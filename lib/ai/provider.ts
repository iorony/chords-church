import { AiReviewResponse } from './schema';

export interface AiReviewInput {
  title?: string;
  artist?: string;
  content: string;
  /** Detección local (heurística, sin IA) usada como contexto/ayuda para el modelo */
  localHints: {
    detectedKey: string;
    keyConfidence: number;
    hasModulation: boolean;
    /** true únicamente cuando el usuario escribió encabezados de sección reales */
    hasExplicitSections: boolean;
    /** Secciones existentes que deben conservarse. Vacío cuando la canción no trae etiquetas. */
    preStructuredSections: { label: string; content: string }[];
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

export const SYSTEM_PROMPT = `Eres un asistente experto en música cristiana, cifrado americano, estructura de canciones y dirección de alabanza.
Recibirás una canción, posiblemente con acordes y formato inconsistente.

Tu tarea:
1. Detectar título y artista si aparecen en el texto; de lo contrario usa null.
2. Identificar acordes sin confundirlos con palabras y detectar la tonalidad probable con confianza de 0 a 1.
3. Detectar modulaciones.
4. Conservar literalmente la letra, los acordes, los separadores //, barras, guiones, marcadores de repetición y la alineación entre acordes y sílabas. No reescribas progresiones ni sustituyas acordes salvo que sea una corrección inequívoca registrada en corrections.
5. Estructurar musicalmente la canción. Los valores permitidos para type son: INTRO, VERSE, PRECHORUS, CHORUS, POSTCHORUS, BRIDGE, INTERLUDE, INSTRUMENTAL, SOLO, SPONTANEOUS, FINAL_CHORUS, OUTRO, END, UNKNOWN.
6. En label usa nombres visibles en español: INTRO, ESTROFA, PRE-CORO, CORO, POST-CORO, PUENTE, INTERLUDIO, INSTRUMENTAL, SOLO, ESPONTÁNEO, CORO FINAL, SALIDA o FINAL. Numera solo cuando realmente existan varias secciones del mismo tipo.
7. Si el original YA trae encabezados de sección, conserva el orden y contenido de las secciones únicas. Considera también encabezados decorativos como -Estrofa-, --Coro--, *Puente 2*, _Pre-coro_ o etiquetas con dos puntos. Normaliza VERSO o VERSE a ESTROFA, elimina el adorno y no repitas la etiqueta dentro de content. No inventes secciones adicionales y elimina repeticiones idénticas de ESTROFA, PRE-CORO o CORO.
8. Si el original NO trae encabezados, debes inferir las secciones por su función musical y lírica; no conviertas automáticamente cada párrafo en una ESTROFA distinta. Agrupa líneas que pertenecen a la misma sección. Distingue especialmente:
   - INTRO: progresión instrumental inicial.
   - ESTROFA: desarrolla la narrativa o idea principal.
   - PRE-CORO: bloque que crea transición/tensión y conduce al coro.
   - CORO: idea central, frase culminante o bloque repetible.
   - PUENTE: sección contrastante posterior al coro.
9. La ausencia de etiquetas en el original NO es contenido incompleto y NO debe producir una advertencia; precisamente debes agregarlas.
10. No repitas secciones idénticas. Si una ESTROFA, PRE-CORO o CORO aparece varias veces con el mismo contenido, devuelve únicamente la primera aparición. Conserva varias secciones del mismo tipo solo cuando su contenido sea distinto.
11. El campo content de cada sección jamás debe repetir su etiqueta.
12. Señala warnings solo para ambigüedades reales, texto cortado o acordes imposibles de determinar.
13. Toda corrección textual o armónica debe registrarse en corrections.

Responde ÚNICAMENTE con JSON válido, sin texto adicional ni backticks, con esta forma exacta:
{
  "detectedTitle": string | null,
  "detectedArtist": string | null,
  "detectedKey": string,
  "keyConfidence": number,
  "hasModulation": boolean,
  "warnings": string[],
  "corrections": [{ "original": string, "corrected": string, "reason": string }],
  "sections": [{ "type": string, "label": string, "order": number, "content": string }]
}`;

export function buildUserPrompt(input: AiReviewInput): string {
  const sectionInstruction = input.localHints.hasExplicitSections
    ? `El usuario SÍ proporcionó encabezados, incluso si venían decorados con guiones, asteriscos, guiones bajos, corchetes o dos puntos. Debes conservar las secciones únicas en el mismo orden: ${input.localHints.preStructuredSections.map((section) => `[${section.label}]`).join(', ')}. Elimina del contenido líneas decorativas como -Estrofa- o -Coro-. Solo normaliza VERSO/VERSE a ESTROFA y omite copias idénticas de ESTROFA, PRE-CORO o CORO.`
    : `El usuario NO proporcionó encabezados de sección. Debes analizar la función musical de cada bloque y crear una estructura semántica correcta (INTRO, ESTROFA, PRE-CORO, CORO, PUENTE, etc.). Las separaciones en blanco son pistas, no límites obligatorios: puedes unir bloques que pertenezcan a una misma sección.`;

  return `Título ingresado por el usuario: ${input.title || '(no proporcionado)'}
Artista ingresado por el usuario: ${input.artist || '(no proporcionado)'}

Pistas armónicas locales (son orientativas; corrígelas si la evidencia musical indica otra cosa):
- Tonalidad local: ${input.localHints.detectedKey} (confianza ${input.localHints.keyConfidence})
- Posible modulación: ${input.localHints.hasModulation ? 'sí' : 'no'}

REGLA DE ESTRUCTURA:
${sectionInstruction}

Comprueba antes de responder que:
- ninguna línea original se perdió;
- no cambiaste progresiones ni separadores;
- no generaste el warning "faltan etiquetas" cuando el original no las tenía;
- cada bloque quedó clasificado por su función, no simplemente como ESTROFA 1, 2, 3, 4;
- ningún CORO, PRE-CORO o ESTROFA idéntico aparece más de una vez.

Contenido original:
"""
${input.content}
"""`;
}
