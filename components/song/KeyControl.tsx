'use client';

import { useMemo, useState } from 'react';
import { ALL_KEYS_GENERAL, keyToIndex, semitoneDifference, transposeSongContent, stripKeyMode } from '@/lib/chords/transposition';

export interface KeyControlProps {
  originalKey: string;
  originalContent: string;
  onChange: (transposedContent: string, currentKey: string, semitones: number) => void;
}

/**
 * Control de transposición por tonalidad. La aplicación no utiliza capo:
 * todo cambio se realiza directamente sobre los acordes mostrados.
 */
export default function KeyControl({ originalKey, originalContent, onChange }: KeyControlProps) {
  const [semitones, setSemitones] = useState(0);

  const isMinorKey = /m$/i.test(originalKey.trim());
  const originalIndex = useMemo(() => keyToIndex(originalKey), [originalKey]);

  const currentKey = useMemo(() => {
    const idx = ((originalIndex + semitones) % 12 + 12) % 12;
    return ALL_KEYS_GENERAL[idx] + (isMinorKey ? 'm' : '');
  }, [originalIndex, semitones, isMinorKey]);

  function applyChange(newSemitones: number) {
    const transposed = transposeSongContent(originalContent, { semitones: newSemitones });
    const idx = ((originalIndex + newSemitones) % 12 + 12) % 12;
    const key = ALL_KEYS_GENERAL[idx] + (isMinorKey ? 'm' : '');
    onChange(transposed, key, newSemitones);
  }

  function shift(delta: number) {
    const next = semitones + delta;
    setSemitones(next);
    applyChange(next);
  }

  function selectKey(key: string) {
    const next = semitoneDifference(originalKey, key);
    setSemitones(next);
    applyChange(next);
  }

  function reset() {
    setSemitones(0);
    applyChange(0);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm border border-gray-200 dark:border-gray-800 rounded-lg p-3">
      <div className="inline-flex items-stretch overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Bajar un semitono"
          title="Bajar un semitono"
          className="w-9 h-9 border-r border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          −
        </button>

        <select
          aria-label="Tono de la canción"
          value={stripKeyMode(currentKey)}
          onChange={(e) => selectKey(e.target.value + (isMinorKey ? 'm' : ''))}
          className="h-9 min-w-[5rem] bg-transparent px-3 text-center font-mono font-semibold outline-none"
        >
          {ALL_KEYS_GENERAL.map((key) => (
            <option key={key} value={key}>
              {key}{isMinorKey ? 'm' : ''}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Subir un semitono"
          title="Subir un semitono"
          className="w-9 h-9 border-l border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          +
        </button>
      </div>

      {semitones !== 0 && (
        <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-primary underline">
          Restaurar tono original ({originalKey})
        </button>
      )}
    </div>
  );
}
