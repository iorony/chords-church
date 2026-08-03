import 'server-only';
import { AiProvider, AiProviderError, AiReviewInput, getSystemPrompt, buildUserPrompt } from '../provider';
import { AiReviewResponseSchema, AiReviewResponse } from '../schema';

/**
 * Proveedor Anthropic (Claude). Requiere ANTHROPIC_API_KEY en el servidor.
 * La clave nunca se expone al navegador porque este archivo tiene
 * 'server-only' y solo se importa desde Route Handlers.
 */
export const anthropicProvider: AiProvider = {
  name: 'anthropic',
  async review(input: AiReviewInput): Promise<AiReviewResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AiProviderError('ANTHROPIC_API_KEY no está configurada en el servidor.');
    }
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2600,
        system: getSystemPrompt(input),
        messages: [{ role: 'user', content: buildUserPrompt(input) }]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AiProviderError(`Error de la API de Anthropic (${response.status}): ${text}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    if (!textBlock?.text) {
      throw new AiProviderError('Anthropic no devolvió contenido de texto.');
    }

    return parseAiJson(textBlock.text, input);
  }
};

const SECTION_TYPE_MAP: Record<string, AiReviewResponse['sections'][number]['type']> = {
  INTRO: 'INTRO', INTRODUCCION: 'INTRO', INTRODUCCIÓN: 'INTRO',
  VERSE: 'VERSE', ESTROFA: 'VERSE', VERSO: 'VERSE',
  PRECHORUS: 'PRECHORUS', PRE_CORO: 'PRECHORUS', PRECORO: 'PRECHORUS',
  CHORUS: 'CHORUS', CORO: 'CHORUS',
  POSTCHORUS: 'POSTCHORUS', POST_CORO: 'POSTCHORUS', POSTCORO: 'POSTCHORUS',
  BRIDGE: 'BRIDGE', PUENTE: 'BRIDGE',
  INTERLUDE: 'INTERLUDE', INTERLUDIO: 'INTERLUDE',
  INSTRUMENTAL: 'INSTRUMENTAL', SOLO: 'SOLO',
  SPONTANEOUS: 'SPONTANEOUS', ESPONTANEO: 'SPONTANEOUS', ESPONTÁNEO: 'SPONTANEOUS',
  FINAL_CHORUS: 'FINAL_CHORUS', CORO_FINAL: 'FINAL_CHORUS',
  OUTRO: 'OUTRO', SALIDA: 'OUTRO',
  END: 'END', FINAL: 'END',
  UNKNOWN: 'UNKNOWN', DESCONOCIDO: 'UNKNOWN'
};

function extractJsonObject(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1));
    }
    throw new Error('No se encontró un objeto JSON en la respuesta.');
  }
}

function normalizeSectionType(value: unknown, label: unknown): AiReviewResponse['sections'][number]['type'] {
  const source = String(value || label || 'UNKNOWN')
    .replace(/[\[\]]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return SECTION_TYPE_MAP[source] || 'UNKNOWN';
}

export function parseAiJson(raw: string, input?: AiReviewInput): AiReviewResponse {
  let parsedJson: any;
  try {
    parsedJson = extractJsonObject(raw);
  } catch (err) {
    throw new AiProviderError('La respuesta de la IA no es un JSON válido.', err);
  }

  if (parsedJson && typeof parsedJson === 'object') {
    parsedJson = parsedJson.result ?? parsedJson.data ?? parsedJson;
  }

  const fallbackSections: AiReviewResponse['sections'] = [];

  const rawSections = Array.isArray(parsedJson?.sections)
    ? parsedJson.sections
    : Array.isArray(parsedJson?.secciones)
      ? parsedJson.secciones
      : fallbackSections;

  const normalized = {
    detectedTitle: parsedJson?.detectedTitle ?? parsedJson?.title ?? parsedJson?.titulo ?? null,
    detectedArtist: parsedJson?.detectedArtist ?? parsedJson?.artist ?? parsedJson?.artista ?? null,
    detectedArtistConfidence: Number(parsedJson?.detectedArtistConfidence ?? parsedJson?.artistConfidence ?? parsedJson?.confianzaArtista ?? ((parsedJson?.detectedArtist ?? parsedJson?.artist ?? parsedJson?.artista) ? 0.75 : 0)),
    artistAlternatives: (Array.isArray(parsedJson?.artistAlternatives) ? parsedJson.artistAlternatives : Array.isArray(parsedJson?.alternatives) ? parsedJson.alternatives : []).map((item: any) => ({ name: String(item?.name ?? item?.artist ?? item?.artista ?? ''), confidence: Math.max(0, Math.min(1, Number(item?.confidence ?? item?.confianza ?? 0))) })).filter((item: any) => item.name),
    detectedKey: String(parsedJson?.detectedKey ?? parsedJson?.key ?? parsedJson?.tono ?? input?.localHints.detectedKey ?? 'C'),
    keyConfidence: Number(parsedJson?.keyConfidence ?? parsedJson?.confidence ?? parsedJson?.confianza ?? input?.localHints.keyConfidence ?? 0),
    hasModulation: Boolean(parsedJson?.hasModulation ?? parsedJson?.modulation ?? parsedJson?.modulacion ?? input?.localHints.hasModulation ?? false),
    warnings: Array.isArray(parsedJson?.warnings)
      ? parsedJson.warnings.map(String)
      : Array.isArray(parsedJson?.advertencias)
        ? parsedJson.advertencias.map(String)
        : [],
    corrections: (Array.isArray(parsedJson?.corrections)
      ? parsedJson.corrections
      : Array.isArray(parsedJson?.correcciones)
        ? parsedJson.correcciones
        : []).map((item: any) => ({
          original: String(item?.original ?? ''),
          corrected: String(item?.corrected ?? item?.corregido ?? ''),
          reason: item?.reason ?? item?.razon ?? item?.razón
        })),
    sections: rawSections.map((section: any, index: number) => ({
      type: normalizeSectionType(section?.type ?? section?.tipo, section?.label ?? section?.etiqueta),
      label: String(section?.label ?? section?.etiqueta ?? section?.type ?? section?.tipo ?? 'UNKNOWN')
        .replace(/[\[\]]/g, '')
        .trim() || 'UNKNOWN',
      order: Number.isInteger(Number(section?.order ?? section?.orden))
        ? Number(section?.order ?? section?.orden)
        : index,
      content: Array.isArray(section?.content ?? section?.contenido)
        ? (section?.content ?? section?.contenido).join('\n')
        : String(section?.content ?? section?.contenido ?? '')
    }))
  };

  if (!normalized.sections.length && fallbackSections.length) {
    normalized.sections = fallbackSections;
  }

  normalized.keyConfidence = Math.max(0, Math.min(1, Number.isFinite(normalized.keyConfidence) ? normalized.keyConfidence : 0));

  const result = AiReviewResponseSchema.safeParse(normalized);
  if (!result.success) {
    console.error('[AI] Respuesta normalizada inválida:', result.error.flatten());
    throw new AiProviderError('La respuesta de la IA no cumple el esquema esperado.', result.error);
  }
  return result.data;
}
