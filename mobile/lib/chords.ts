import { keyToIndex, ALL_KEYS_GENERAL, keysForMode, transposeSongContent } from './music/transposition';
import { tokenizeChordLine } from './music/chord-parser';

export const KEYS = ALL_KEYS_GENERAL;
export const keyIndex = keyToIndex;
export const keysFor = keysForMode;
export const transposeSong = (content: string, semitones: number) => transposeSongContent(content, { semitones });

/** Adaptador para el renderizador móvil del mismo tokenizador usado en web. */
export function chordTokens(line: string) {
  return tokenizeChordLine(line).map((token) => ({
    token: token.value,
    chord: token.kind === 'chord',
    section: token.kind === 'section'
  }));
}
