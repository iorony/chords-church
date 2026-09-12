// Tipos del motor de acordes y transposición

export type NoteLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type Accidental = '' | '#' | 'b';

export interface ParsedChord {
  raw: string;
  root: NoteLetter;
  accidental: Accidental;
  quality: string; // '', 'm', 'dim', 'aug', 'sus2', 'sus4', etc.
  extension: string; // '7', 'maj7', '9', '11', '13', etc.
  modifications: string; // '(b9)', '(#5)', etc.
  bass: { root: NoteLetter; accidental: Accidental } | null; // slash chord
  recognized: boolean;
}

export interface ChordToken {
  type: 'chord' | 'text';
  value: string;
  parsed?: ParsedChord;
  /** Posición de columna dentro de la línea original, usada para reinsertar tras transponer */
  column: number;
}

export type LineKind = 'chord-line' | 'lyric-line' | 'section-header' | 'blank' | 'annotation';

export interface ParsedLine {
  kind: LineKind;
  raw: string;
  tokens?: ChordToken[]; // solo relevante para 'chord-line'
  sectionLabel?: string; // solo para 'section-header'
}

export type SectionType =
  | 'INTRO'
  | 'VERSE'
  | 'PRECHORUS'
  | 'CHORUS'
  | 'POSTCHORUS'
  | 'BRIDGE'
  | 'INTERLUDE'
  | 'INSTRUMENTAL'
  | 'SOLO'
  | 'SPONTANEOUS'
  | 'FINAL_CHORUS'
  | 'OUTRO'
  | 'END'
  | 'UNKNOWN';

export interface SongSection {
  type: SectionType;
  label: string;
  order: number;
  content: string;
}

export const CHROMATIC_SHARP: string[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

export const CHROMATIC_FLAT: string[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'
];

/**
 * Notación general fija que usa toda la aplicación para MOSTRAR acordes
 * transpuestos, sin permitir elegir entre "todo sostenidos" o "todo
 * bemoles": se usa el sostenido en C#, F#, G# y el bemol en Eb, Bb, que es
 * la convención más común en cifrado de música cristiana/popular en
 * español. Así, si el usuario escribió D# en el original, al transponer
 * se mostrará como Eb; si escribió A#, se mostrará como Bb.
 */
export const CHROMATIC_GENERAL: string[] = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'
];
