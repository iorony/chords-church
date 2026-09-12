import { CHROMATIC_SHARP, CHROMATIC_FLAT, CHROMATIC_GENERAL, ParsedChord, NoteLetter, Accidental } from './types';
import { parseChord, stringifyChord, isChordLine, tokenizeChordLine, stripChordWrapper } from './chord-parser';

const NOTE_INDEX: Record<string, number> = {};
// Se aceptan como ENTRADA todas las formas de escribir una nota (sostenidos,
// bemoles y la notación general), pero la SALIDA siempre usa CHROMATIC_GENERAL.
CHROMATIC_SHARP.forEach((n, i) => (NOTE_INDEX[n] = i));
CHROMATIC_FLAT.forEach((n, i) => {
  if (!(n in NOTE_INDEX)) NOTE_INDEX[n] = i;
});
CHROMATIC_GENERAL.forEach((n, i) => {
  if (!(n in NOTE_INDEX)) NOTE_INDEX[n] = i;
});
// Enarmónicos explícitos poco comunes que igual pueden aparecer pegados de otras fuentes
Object.assign(NOTE_INDEX, {
  'B#': 0, 'E#': 5, 'Cb': 11, 'Fb': 4
});

function noteToIndex(root: NoteLetter, accidental: Accidental): number {
  const key = `${root}${accidental}`;
  if (key in NOTE_INDEX) return NOTE_INDEX[key];
  return NOTE_INDEX[root] ?? 0;
}

/** Siempre devuelve la nota en la notación general fija de la app (ver CHROMATIC_GENERAL) */
function indexToNote(index: number): { root: NoteLetter; accidental: Accidental } {
  const normalized = ((index % 12) + 12) % 12;
  const name = CHROMATIC_GENERAL[normalized];
  const root = name[0] as NoteLetter;
  const accidental = (name.slice(1) || '') as Accidental;
  return { root, accidental };
}

export interface TransposeOptions {
  semitones: number;
  /** Mantiene la columna visual de cada token; útil para vistas proyectadas. */
  preserveColumns?: boolean;
}

export function transposeChord(raw: string, options: TransposeOptions): string {
  const chord = parseChord(raw);
  if (!chord.recognized) return raw; // conservar acordes no reconocidos sin destruirlos

  const rootIndex = noteToIndex(chord.root, chord.accidental);
  const newRootIndex = rootIndex + options.semitones;
  const newRoot = indexToNote(newRootIndex);

  let newBass: ParsedChord['bass'] = null;
  if (chord.bass) {
    const bassIndex = noteToIndex(chord.bass.root, chord.bass.accidental);
    const newBassIndex = bassIndex + options.semitones;
    newBass = indexToNote(newBassIndex);
  }

  const transposed: ParsedChord = {
    ...chord,
    root: newRoot.root,
    accidental: newRoot.accidental,
    bass: newBass
  };

  return stringifyChord(transposed);
}

/**
 * Transpone una línea de acordes completa, preservando separadores y
 * cualquier caracter que no sea parte de un acorde (barras, puntos, etc.)
 */
export function transposeChordLine(line: string, options: TransposeOptions): string {
  const tokens = tokenizeChordLine(line);

  if (options.preserveColumns) {
    let aligned = '';
    let precededByWhitespace = false;

    for (const token of tokens) {
      if (token.kind === 'whitespace') {
        precededByWhitespace = true;
        continue;
      }

      if (aligned.length < token.column) {
        aligned += ' '.repeat(token.column - aligned.length);
      } else if (precededByWhitespace && aligned.length > 0 && !aligned.endsWith(' ')) {
        // Si un acorde creció hasta ocupar la columna siguiente, dejamos como
        // mínimo una separación legible. Ese solapamiento es físicamente
        // imposible de evitar sin mover el siguiente token.
        aligned += ' ';
      }

      if (token.kind === 'chord') {
        const { prefix, core, suffix } = stripChordWrapper(token.value);
        aligned += prefix + transposeChord(core, options) + suffix;
      } else {
        aligned += token.value;
      }
      precededByWhitespace = false;
    }

    return aligned;
  }

  let result = line;
  // Reemplazar de derecha a izquierda para no invalidar índices de columna
  for (let i = tokens.length - 1; i >= 0; i--) {
    const { value, column, kind } = tokens[i];
    if (kind !== 'chord') continue;
    const { prefix, core, suffix } = stripChordWrapper(value);
    const transposedValue = prefix + transposeChord(core, options) + suffix;
    result = result.slice(0, column) + transposedValue + result.slice(column + value.length);
  }
  return result;
}

function isEmbeddedProgression(line: string): boolean {
  const tokens = tokenizeChordLine(line);
  const chordCount = tokens.filter((token) => token.kind === 'chord').length;
  const hasMusicalSeparators = /[|/]|(?:[A-G](?:#|b)?)-(?=[A-G])/i.test(line);
  return chordCount >= 2 && hasMusicalSeparators;
}

function transposeCompactNoteRuns(line: string, options: TransposeOptions): string {
  // Algunas fuentes escriben repeticiones melódicas como CCC o FFF. Sólo se
  // llama para progresiones ya verificadas, evitando modificar palabras.
  return line.replace(/\b([A-G])\1{1,}\b/g, (run: string) =>
    Array.from(run, (note) => transposeChord(note, options)).join('')
  );
}

/**
 * Transpone el contenido completo de una canción (texto con letra y
 * acordes intercalados). Nunca modifica las líneas de letra.
 */
export function transposeSongContent(content: string, options: TransposeOptions): string {
  const lines = content.split('\n');
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) return line; // encabezado de sección
      if (isChordLine(line) || isEmbeddedProgression(line)) {
        return transposeCompactNoteRuns(transposeChordLine(line, options), options);
      }
      return line;
    })
    .join('\n');
}

/** Quita el sufijo de modo menor ("m") de una tonalidad como "Bm" para poder buscar su índice cromático */
export function stripKeyMode(key: string): string {
  return key.replace(/m$/i, '');
}

export function semitoneDifference(fromKey: string, toKey: string): number {
  const from = parseChord(stripKeyMode(fromKey));
  const to = parseChord(stripKeyMode(toKey));
  const fromIndex = noteToIndex(from.root, from.accidental);
  const toIndex = noteToIndex(to.root, to.accidental);
  return ((toIndex - fromIndex + 12) % 12);
}

/** Índice cromático (0-11) de una tonalidad, aceptando cualquier notación de entrada (p.ej. "F#", "Gb", "Bm") */
export function keyToIndex(key: string): number {
  const parsed = parseChord(stripKeyMode(key));
  return noteToIndex(parsed.root, parsed.accidental);
}

/** Lista de las 12 tonalidades en la notación general fija de la app, para selectores de tono */
export const ALL_KEYS_GENERAL = CHROMATIC_GENERAL;

/**
 * Devuelve las 12 tonalidades conservando el modo del tono original.
 * Ejemplos:
 *   C  -> C, C#, D ... B
 *   Bm -> Cm, C#m, Dm ... Bm
 */
export function keysForMode(originalKey: string | null | undefined): string[] {
  const normalized = (originalKey || '').trim();
  const isMinor = /m$/i.test(normalized);
  return CHROMATIC_GENERAL.map((key) => (isMinor ? `${key}m` : key));
}

/** @deprecated usa ALL_KEYS_GENERAL — la app ya no permite elegir entre sostenidos y bemoles */
export const ALL_KEYS_SHARP = CHROMATIC_GENERAL;
/** @deprecated usa ALL_KEYS_GENERAL — la app ya no permite elegir entre sostenidos y bemoles */
export const ALL_KEYS_FLAT = CHROMATIC_GENERAL;

/** Aplica el capo: la tonalidad "sonante" es la original transpuesta hacia abajo por el número de trastes del capo */
export function applyCapo(displayKey: string, capoFret: number): string {
  if (!capoFret) return displayKey;
  return transposeChord(displayKey, { semitones: -capoFret });
}
