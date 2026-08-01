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
    /** Solo bloques sin etiqueta explícita. La IA clasifica estos ids y nada más. */
    blockCount: number;
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
 * Prompt compacto para un flujo local-first.
 *
 * La aplicación ya separó la canción en bloques y conserva el contenido
 * original. La IA NO reconstruye la letra: únicamente clasifica cada bloque,
 * revisa el tono y devuelve referencias BLOCK_n. Después, el servidor vuelve
 * a insertar el contenido local exacto.
 */
export const SYSTEM_PROMPT = `Eres experto en estructura de canciones y armonía.
Devuelve únicamente JSON válido con el esquema solicitado.

Tu tarea es de ENRIQUECIMIENTO, no de reescritura:
- Recibirás bloques delimitados como <<<BLOCK_1>>> ... <<<END_BLOCK_1>>>.
- Devuelve exactamente un objeto de sections por cada bloque recibido y en el mismo orden.
- En content escribe únicamente el identificador BLOCK_1, BLOCK_2, etc.; nunca copies la letra.
- Clasifica cada bloque como INTRO, VERSE, PRECHORUS, CHORUS, POSTCHORUS, BRIDGE, INTERLUDE, INSTRUMENTAL, SOLO, SPONTANEOUS, FINAL_CHORUS, OUTRO, END o UNKNOWN.
- Usa ESTROFA para VERSE, PRE-CORO para PRECHORUS, CORO para CHORUS, PUENTE para BRIDGE e INTERLUDIO para INTERLUDE.
- Los bloques con etiqueta explícita no se envían: ya están bloqueados por el servidor.
- Un bloque inicial compuesto solo por una progresión de acordes es INTRO.
- Un bloque con letra antes del primer CORO, PRE-CORO o PUENTE es ESTROFA.
- Encabezados como CORO:, PUENTE: o -intro- siempre abren una nueva sección y nunca deben quedar dentro del contenido anterior.
- Reconoce encabezados compuestos: INTRO PIANO/PAD/GUITARRA como INTRO; SOLO GUITARRA/PIANO como SOLO; ESTROFA FIN como FINAL.
- Reconoce INTERMEDIO, INTERMEDIO:, INTERLUDE, BREAK, MÚSICA y SECCIÓN INSTRUMENTAL como INTERLUDIO.
- Líneas de ejecución como -estrofa-coro-, volver al coro, repetir puente, BIS o X2 son indicaciones, no secciones nuevas.
- Si -intro- aparece seguido inmediatamente por -estrofa-coro- u otra lista de secciones, interpreta el conjunto como una indicación de repetición y no como un INTRO nuevo.
- Si aparecen PARTE I, PARTE II, PARTE III, etc., conserva esas etiquetas como PARTE. No las conviertas a ESTROFA salvo que el servidor ya las haya clasificado explícitamente así.
- No inventes bloques, no elimines bloques, no dividas bloques y no unas dos secciones.
- Puedes sugerir título, artista, tono, modulación, advertencias y correcciones.
- No repitas ESTROFA, PRE-CORO o CORO cuando sean bloques idénticos; el servidor hará la deduplicación final.

Esquema:
{"detectedTitle":string|null,"detectedArtist":string|null,"detectedKey":string,"keyConfidence":number,"hasModulation":boolean,"warnings":string[],"corrections":[{"original":string,"corrected":string,"reason":string}],"sections":[{"type":"INTRO|VERSE|PRECHORUS|CHORUS|POSTCHORUS|BRIDGE|INTERLUDE|INSTRUMENTAL|SOLO|SPONTANEOUS|FINAL_CHORUS|OUTRO|END|UNKNOWN","label":string,"order":number,"content":string}]}`;

export function buildUserPrompt(input: AiReviewInput): string {
  const structureRule = `Clasifica semánticamente los ${input.localHints.blockCount} bloques SIN etiqueta explícita. Los demás bloques están bloqueados y no se enviaron.`;

  return `Título obligatorio: ${input.title || '(vacío)'}
Artista obligatorio: ${input.artist || '(vacío)'}
Preanálisis local: tono ${input.localHints.detectedKey} (${input.localHints.keyConfidence}), alternativo ${input.localHints.alternateKey || 'ninguno'}, modulación ${input.localHints.hasModulation ? 'sí' : 'no'}.
Acordes detectados: ${input.localHints.chordSummary || 'sin resumen'}.
${structureRule}

Bloques locales (la canción aparece una sola vez):
${input.content}`;
}
