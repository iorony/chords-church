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
import { buildSections } from '../chords/structure-parser';
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
  const configured = process.env.AI_PROVIDER_ORDER || process.env.AI_PROVIDER || 'groq,openrouter,gemini';
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

function normalizeAiResult(
  result: AiReviewResponse,
  originalContent: string,
  localSections: ReturnType<typeof buildSections>,
  localKeyLabel: string,
  localKeyConfidence: number
): AiReviewResponse {
  let sections = result.sections.map((section) => ({
    ...section,
    label: normalizeVisibleSectionLabel(section.label, section.type),
    content: stripLeadingSectionHeaders(section.content)
  }));

  if (hasExplicitSectionLabels(originalContent)) {
    if (sections.length === localSections.length) {
      sections = sections.map((section, index) => ({
        ...section,
        type: localSections[index].type,
        label: localSections[index].label,
        order: localSections[index].order
      }));
    } else {
      // Evita que una IA invente o duplique secciones cuando el usuario ya las definió.
      sections = localSections.map((section) => ({
        type: section.type,
        label: section.label,
        order: section.order,
        content: section.content
      }));
    }
  }

  // En el cancionero se guarda cada sección repetida una sola vez. Esto evita
  // que la IA replique el mismo CORO, PRE-CORO o ESTROFA varias veces.
  sections = removeDuplicateSections(sections);

  const originalHasSections = hasExplicitSectionLabels(originalContent);
  const warnings = result.warnings.filter((warning) => {
    if (originalHasSections) return true;
    return !/(faltan?|ausencia de|no (?:hay|tiene|contiene)).{0,30}(?:etiquetas?|secciones?)/i.test(warning);
  });
  let detectedKey = result.detectedKey;
  let keyConfidence = result.keyConfidence;

  // La heurística armónica local ahora considera calidad de acordes y cadencias.
  // Cuando su evidencia es alta, evita resultados de IA incompatibles como G para
  // una progresión diatónica clara de D mayor (G, A, Bm, D, F#sus...).
  if (localKeyConfidence >= 0.68 && result.detectedKey !== localKeyLabel) {
    warnings.push(
      `El análisis armónico local identifica ${localKeyLabel} con mayor coherencia funcional; se usó ese tono en lugar de ${result.detectedKey}.`
    );
    detectedKey = localKeyLabel;
    keyConfidence = Math.max(localKeyConfidence, result.keyConfidence * 0.85);
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
  const localSections = buildSections(input.content);
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
  const localSections = buildSections(input.content);
  const { alternate: alternateKey } = detectKeyWithAlternate(input.content);

  const aiInput: AiReviewInput = {
    title: input.title,
    artist: input.artist,
    content: input.content,
    localHints: {
      detectedKey: formatKeyLabel(localKey),
      keyConfidence: localKey.confidence,
      alternateKey: alternateKey ? formatKeyLabel(alternateKey) : null,
      hasModulation: localModulation,
      hasExplicitSections: hasExplicitSectionLabels(input.content),
      sectionLabels: hasExplicitSectionLabels(input.content)
        ? localSections.map((section) => section.label)
        : [],
      chordSummary: buildChordSummary(input.content)
    }
  };

  const providers = getConfiguredProviders();
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      const rawResult = await executeWithRetry(provider, aiInput);
      assertContentCoverage(input.content, rawResult.sections);
      const result = normalizeAiResult(
        rawResult,
        input.content,
        localSections,
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
