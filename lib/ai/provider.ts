import { AiReviewResponse } from './schema';

export interface AiReviewInput {
  title?: string;
  artist?: string;
  content: string;
  /** Preanálisis local: reduce el trabajo y los tokens que necesita la IA. */
  localHints: {
    detectedKey: string;
    keyConfidence: number;
    alternateKey?: string | null;
    hasModulation: boolean;
    hasExplicitSections: boolean;
    /** Solo etiquetas y orden. Nunca vuelve a incluir la letra completa. */
    sectionLabels: string[];
    /** Resumen compacto de los acordes/progresiones detectados. */
    chordSummary: string;
  };
}

export interface AiProvider {
  name: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'groq';
  review(input: AiReviewInput): Promise<AiReviewResponse>;
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * Prompt compacto. La aplicación ya hace detección local, normalización,
 * deduplicación y validación después de la respuesta. La IA se concentra en
 * resolver estructura semántica y ambigüedades armónicas.
 */
export const SYSTEM_PROMPT = `Eres experto en estructura de canciones y armonía.
Devuelve únicamente JSON válido con el esquema solicitado.

Reglas:
- Conserva literalmente cada línea de letra, acordes, espacios, //, barras y guiones.
- No inventes ni omitas contenido.
- Si ya hay secciones, conserva su orden; normaliza VERSO/VERSE a ESTROFA y quita adornos como -Coro-.
- Si no hay secciones, infiere INTRO, ESTROFA, PRE-CORO, CORO, PUENTE, INTERLUDIO, SOLO o FINAL por función musical y lírica.
- No repitas ESTROFA, PRE-CORO o CORO cuando el contenido sea idéntico.
- Registra cualquier corrección real en corrections.
- Warnings solo para ambigüedad real o contenido cortado.

Esquema:
{"detectedTitle":string|null,"detectedArtist":string|null,"detectedKey":string,"keyConfidence":number,"hasModulation":boolean,"warnings":string[],"corrections":[{"original":string,"corrected":string,"reason":string}],"sections":[{"type":"INTRO|VERSE|PRECHORUS|CHORUS|POSTCHORUS|BRIDGE|INTERLUDE|INSTRUMENTAL|SOLO|SPONTANEOUS|FINAL_CHORUS|OUTRO|END|UNKNOWN","label":string,"order":number,"content":string}]}`;

export function buildUserPrompt(input: AiReviewInput): string {
  const structureRule = input.localHints.hasExplicitSections
    ? `La canción ya trae secciones. Conserva este orden: ${input.localHints.sectionLabels.join(' > ') || 'detectado localmente'}.`
    : 'La canción no trae secciones. Créelas por función musical; no etiquetes cada párrafo automáticamente como una estrofa distinta.';

  return `Título obligatorio: ${input.title || '(vacío)'}
Artista obligatorio: ${input.artist || '(vacío)'}
Preanálisis local: tono ${input.localHints.detectedKey} (${input.localHints.keyConfidence}), alternativo ${input.localHints.alternateKey || 'ninguno'}, modulación ${input.localHints.hasModulation ? 'sí' : 'no'}.
Acordes detectados: ${input.localHints.chordSummary || 'sin resumen'}.
${structureRule}

Canción (aparece una sola vez):
<<<
${input.content}
>>>`;
}
