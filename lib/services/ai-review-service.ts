import 'server-only';
import { AiProvider, AiProviderError, AiReviewInput } from '../ai/provider';
import { readMaxRetries } from '../ai/http';
import { AiReviewResponse } from '../ai/schema';
import { anthropicProvider } from '../ai/providers/anthropic';
import { openaiProvider } from '../ai/providers/openai';
import { geminiProvider } from '../ai/providers/gemini';
import { openrouterProvider } from '../ai/providers/openrouter';
import { groqProvider } from '../ai/providers/groq';
import { detectKey, detectModulation, formatKeyLabel, detectKeyWithAlternate, detectAlternateKeyForPrimary } from '../chords/key-detection';
import { parseSongBlocks, rebuildSectionsFromBlocks, SongBlock } from '../chords/block-parser';
import { SectionType } from '../chords/types';
import { detectSectionLabel, tokenizeChordLine, stripChordWrapper } from '../chords/chord-parser';

const PROVIDERS: Record<string, AiProvider> = {
  groq: groqProvider,
  openrouter: openrouterProvider,
  gemini: geminiProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider
};

const PROVIDER_API_KEYS: Record<string, string> = {
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  gemini: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY'
};

function getProviderOrder(): string[] {
  const configured = process.env.AI_PROVIDER_ORDER || process.env.AI_PROVIDER || 'groq,openrouter';
  const names = configured
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set<string>(names));
}

function getConfiguredProviders(): AiProvider[] {
  const providers: AiProvider[] = [];

  for (const name of getProviderOrder()) {
    const provider = PROVIDERS[name];
    if (!provider) {
      console.warn(`[AI] Proveedor desconocido omitido: ${name}`);
      continue;
    }

    const keyName = PROVIDER_API_KEYS[name];
    if (keyName && !process.env[keyName]) {
      console.warn(`[AI] ${name} omitido porque ${keyName} no está configurada.`);
      continue;
    }

    providers.push(provider);
  }

  return providers;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'La solicitud superó el tiempo máximo de espera.';
    return err.message;
  }
  return 'Error desconocido al contactar la IA.';
}

async function executeWithRetry(
  provider: AiProvider,
  input: AiReviewInput
): Promise<AiReviewResponse> {
  const retries = readMaxRetries();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await provider.review(input);
    } catch (err) {
      lastError = err;
      const message = errorMessage(err);
      // 413 no mejora repitiendo la misma carga; 400/401/403 tampoco.
      const nonRetryable = /\((?:400|401|403|413)\)/.test(message);
      if (nonRetryable || attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiProviderError('El proveedor de IA falló sin devolver detalles.');
}

function buildChordSummary(content: string): string {
  const chords: string[] = [];
  for (const line of content.split('\n')) {
    for (const token of tokenizeChordLine(line)) {
      if (token.kind !== 'chord') continue;
      const core = stripChordWrapper(token.value).core;
      if (core && !chords.includes(core)) chords.push(core);
      if (chords.length >= 32) break;
    }
    if (chords.length >= 32) break;
  }
  return chords.join(' ');
}

function comparableSongLines(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => !isRecognizedSectionHeader(line))
    .map((line) => line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Asegura que la IA no haya perdido ni inventado líneas sustanciales. */
function assertContentCoverage(original: string, sections: AiReviewResponse['sections']): void {
  const expected = comparableSongLines(original);
  const actual = comparableSongLines(sections.map((section) => section.content).join('\n'));
  const remaining = [...actual];
  let matched = 0;

  for (const line of expected) {
    const index = remaining.indexOf(line);
    if (index >= 0) {
      matched += 1;
      remaining.splice(index, 1);
    }
  }

  const coverage = expected.length ? matched / expected.length : 1;
  // Permite diferencias pequeñas causadas por correcciones explícitas, pero no
  // una respuesta truncada o una reescritura completa.
  if (coverage < 0.92) {
    throw new AiProviderError(
      `La IA devolvió una estructura incompleta (${Math.round(coverage * 100)}% del contenido conservado).`
    );
  }
}


function isRecognizedSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Reconoce encabezados entre corchetes y también encabezados escritos como
  // texto simple: "estrofa II", "verso 2", "coro", "puente", etc.
  if (/^\s*\[[^\]]+\]\s*$/.test(trimmed)) {
    return Boolean(detectSectionLabel(trimmed.slice(1, -1)));
  }

  return Boolean(detectSectionLabel(trimmed));
}

function stripLeadingSectionHeaders(content: string): string {
  const lines = content.split('\n');
  while (lines.length && (!lines[0].trim() || isRecognizedSectionHeader(lines[0]))) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

function hasExplicitSectionLabels(content: string): boolean {
  return content.split('\n').some(isRecognizedSectionHeader);
}

function normalizeVisibleSectionLabel(label: string, type: string): string {
  const cleaned = label.trim().replace(/^\[|\]$/g, '').trim();
  const suffixMatch = /(?:\s+)([0-9]+|[ivxlcdm]+)$/i.exec(cleaned);
  const suffix = suffixMatch?.[1]?.toUpperCase();

  const visibleByType: Record<string, string> = {
    INTRO: 'INTRO',
    VERSE: 'ESTROFA',
    PRECHORUS: 'PRE-CORO',
    CHORUS: 'CORO',
    POSTCHORUS: 'POST-CORO',
    BRIDGE: 'PUENTE',
    INTERLUDE: 'INTERLUDIO',
    INSTRUMENTAL: 'INSTRUMENTAL',
    SOLO: 'SOLO',
    SPONTANEOUS: 'ESPONTÁNEO',
    FINAL_CHORUS: 'CORO FINAL',
    OUTRO: 'SALIDA',
    END: 'FINAL'
  };

  const verseMatch = /^(?:estrofa|verso|verse)(?:\s+([0-9]+|[ivxlcdm]+))?$/i.exec(cleaned);
  if (verseMatch || type === 'VERSE') {
    const verseSuffix = verseMatch?.[1]?.toUpperCase() || suffix;
    return verseSuffix ? `ESTROFA ${verseSuffix}` : 'ESTROFA';
  }

  const base = visibleByType[type];
  if (base) return suffix ? `${base} ${suffix}` : base;
  return cleaned;
}


const DEDUPLICATED_SECTION_TYPES = new Set(['VERSE', 'PRECHORUS', 'CHORUS']);

function sectionFingerprint(content: string): string {
  return content
    .split('\n')
    .filter((line) => !isRecognizedSectionHeader(line))
    .join('\n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Conserva una sola copia de ESTROFAS, PRE-COROS y COROS cuyo contenido sea
 * realmente el mismo. Las secciones distintas del mismo tipo se mantienen y
 * se renombran de forma consecutiva.
 */
function removeDuplicateSections<T extends { type: string; label: string; order: number; content: string }>(
  sections: T[]
): T[] {
  const seen = new Set<string>();
  const filtered = sections.filter((section) => {
    if (!DEDUPLICATED_SECTION_TYPES.has(section.type)) return true;

    const fingerprint = sectionFingerprint(section.content);
    if (!fingerprint) return true;

    const key = `${section.type}:${fingerprint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const counters: Record<string, number> = {};
  return filtered.map((section, index) => {
    if (!DEDUPLICATED_SECTION_TYPES.has(section.type)) {
      return { ...section, order: index };
    }

    counters[section.type] = (counters[section.type] || 0) + 1;
    const occurrence = counters[section.type];
    const baseLabel = section.type === 'VERSE'
      ? 'ESTROFA'
      : section.type === 'PRECHORUS'
        ? 'PRE-CORO'
        : 'CORO';

    return {
      ...section,
      order: index,
      label: occurrence === 1 ? baseLabel : `${baseLabel} ${occurrence}`
    };
  });
}

function buildAiBlockInput(blocks: SongBlock[]): string {
  return blocks
    .map((block) => {
      const id = `BLOCK_${block.id}`;
      return `<<<${id}>>>\n${block.content}\n<<<END_${id}>>>`;
    })
    .join('\n\n');
}

function readBlockNumber(content: string): number | null {
  const match = /\bBLOCK_(\d+)\b/i.exec(content || '');
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function classificationFromAiSection(section: AiReviewResponse['sections'][number]): { type: SectionType; label: string } {
  return {
    type: section.type as SectionType,
    label: normalizeVisibleSectionLabel(section.label, section.type)
  };
}

/**
 * Mezcla el enriquecimiento semántico de la IA con la estructura local.
 * El contenido de la IA nunca se usa como fuente de verdad: cada sección
 * conserva exactamente las líneas producidas por el parser local.
 */
function normalizeAiResult(
  result: AiReviewResponse,
  originalContent: string,
  blocks: SongBlock[],
  unresolvedBlocks: SongBlock[],
  localKeyLabel: string,
  localKeyConfidence: number
): AiReviewResponse {
  const classifications = new Map<number, { type: SectionType; label: string }>();

  result.sections.forEach((section, index) => {
    const fallbackBlock = unresolvedBlocks[index];
    const blockNumber = readBlockNumber(section.content) ?? fallbackBlock?.id ?? null;
    if (blockNumber && !classifications.has(blockNumber)) {
      classifications.set(blockNumber, classificationFromAiSection(section));
    }
  });

  // La IA debe responder una clasificación por cada bloque enviado. Si omite
  // alguno, el resultado no es confiable y se prueba el siguiente proveedor.
  const missing = unresolvedBlocks.filter((block) => !classifications.has(block.id));
  if (missing.length) {
    throw new AiProviderError(`La IA omitió ${missing.length} bloque(s) semánticos.`);
  }

  let sections = rebuildSectionsFromBlocks(blocks, classifications).map((section, index) => ({
    ...section,
    label: normalizeVisibleSectionLabel(section.label, section.type),
    order: index
  }));
  sections = removeDuplicateSections(sections);

  const explicitSections = hasExplicitSectionLabels(originalContent);
  const warnings = result.warnings.filter((warning) => {
    if (explicitSections) return true;
    return !/(faltan?|ausencia de|no (?:hay|tiene|contiene)).{0,30}(?:etiquetas?|secciones?)/i.test(warning);
  });

  let detectedKey = result.detectedKey || localKeyLabel;
  let keyConfidence = result.keyConfidence || localKeyConfidence;
  if (localKeyConfidence >= 0.68 && detectedKey !== localKeyLabel) {
    warnings.push(`El análisis armónico local identifica ${localKeyLabel} con mayor coherencia funcional; se usó ese tono en lugar de ${detectedKey}.`);
    detectedKey = localKeyLabel;
    keyConfidence = Math.max(localKeyConfidence, keyConfidence * 0.85);
  }

  return {
    ...result,
    detectedKey,
    keyConfidence: Number(Math.min(1, keyConfidence).toFixed(2)),
    warnings: Array.from(new Set(warnings)),
    sections
  };
}

export function reviewSongLocally(input: ReviewSongInput): {
  result: AiReviewResponse;
  aiAvailable: boolean;
  providerName: string;
  alternateKey: { key: string; confidence: number; isMinor: boolean } | null;
} {
  const localKey = detectKey(input.content);
  const localModulation = detectModulation(input.content);
  const localSections = rebuildSectionsFromBlocks(parseSongBlocks(input.content), new Map());
  const { alternate: alternateKey } = detectKeyWithAlternate(input.content);

  return {
    result: {
      detectedTitle: input.title || null,
      detectedArtist: input.artist || null,
      detectedKey: formatKeyLabel(localKey),
      keyConfidence: localKey.confidence,
      hasModulation: localModulation,
      warnings: ['Reestructuración realizada localmente, sin consumir una API de IA.'],
      corrections: [],
      sections: removeDuplicateSections(localSections.map((section) => ({
        type: section.type,
        label: normalizeVisibleSectionLabel(section.label, section.type),
        order: section.order,
        content: section.content
      })))
    },
    aiAvailable: false,
    providerName: 'local',
    alternateKey
  };
}

export interface ReviewSongInput {
  title?: string;
  artist?: string;
  content: string;
}

/**
 * Ejecuta la heurística local y después prueba, en orden, todos los proveedores
 * configurados. Si uno falla, pasa automáticamente al siguiente. Solo cuando
 * todos fallan se devuelve el análisis local degradado.
 */
export async function reviewSongWithAi(input: ReviewSongInput): Promise<{
  result: AiReviewResponse;
  aiAvailable: boolean;
  providerName: string;
  error?: string;
  alternateKey: { key: string; confidence: number; isMinor: boolean } | null;
}> {
  const localKey = detectKey(input.content);
  const localModulation = detectModulation(input.content);
  const blocks = parseSongBlocks(input.content);
  const unresolvedBlocks = blocks.filter((block) => !block.explicitLabel);
  const localSections = rebuildSectionsFromBlocks(blocks, new Map());
  const { alternate: alternateKey } = detectKeyWithAlternate(input.content);

  // Las secciones explícitas están resueltas de forma determinista. Si no hay
  // bloques pendientes, la IA no tiene nada que clasificar.
  if (unresolvedBlocks.length === 0) {
    const local = reviewSongLocally(input);
    return { ...local, providerName: 'local (secciones explícitas)' };
  }

  const aiInput: AiReviewInput = {
    title: input.title,
    artist: input.artist,
    content: buildAiBlockInput(unresolvedBlocks),
    localHints: {
      detectedKey: formatKeyLabel(localKey),
      keyConfidence: localKey.confidence,
      alternateKey: alternateKey ? formatKeyLabel(alternateKey) : null,
      hasModulation: localModulation,
      hasExplicitSections: hasExplicitSectionLabels(input.content),
      sectionLabels: hasExplicitSectionLabels(input.content)
        ? localSections.map((section) => section.label)
        : [],
      blockCount: unresolvedBlocks.length,
      chordSummary: buildChordSummary(input.content)
    }
  };

  const providers = getConfiguredProviders();
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      const rawResult = await executeWithRetry(provider, aiInput);
      const result = normalizeAiResult(
        rawResult,
        input.content,
        blocks,
        unresolvedBlocks,
        formatKeyLabel(localKey),
        localKey.confidence
      );
      const aiAwareAlternateKey = detectAlternateKeyForPrimary(input.content, result.detectedKey);
      return {
        result,
        aiAvailable: true,
        providerName: provider.name,
        // El alternativo se calcula contra el tono final elegido por la IA y
        // validado localmente, no solamente contra la primera hipótesis local.
        alternateKey: aiAwareAlternateKey
      };
    } catch (err) {
      const message = errorMessage(err);
      failures.push(`${provider.name}: ${message}`);
      console.warn(`[AI] ${provider.name} no disponible; se probará el siguiente proveedor: ${message}`);
    }
  }

  const noProvidersMessage = providers.length === 0
    ? 'No hay proveedores de IA configurados. Agrega al menos GROQ_API_KEY u OPENROUTER_API_KEY.'
    : `Todos los proveedores configurados fallaron: ${failures.join(' | ')}`;

  const fallback: AiReviewResponse = {
    detectedTitle: input.title || null,
    detectedArtist: input.artist || null,
    detectedKey: formatKeyLabel(localKey),
    keyConfidence: localKey.confidence,
    hasModulation: localModulation,
    // Los errores operativos de proveedores se muestran una sola vez mediante
    // la propiedad `error`. No se duplican dentro de `warnings`, que queda
    // reservado para advertencias sobre el contenido de la canción.
    warnings: [],
    corrections: [],
    sections: removeDuplicateSections(localSections.map((s) => ({
      type: s.type,
      label: normalizeVisibleSectionLabel(s.label, s.type),
      order: s.order,
      content: s.content
    })))
  };

  return {
    result: fallback,
    aiAvailable: false,
    providerName: providers.map((provider) => provider.name).join(' → ') || 'local',
    error: noProvidersMessage,
    alternateKey
  };
}
