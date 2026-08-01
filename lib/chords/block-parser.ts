import { detectSectionLabel, isChordLine } from './chord-parser';
import { classifyLines } from './structure-parser';
import { SectionType, SongSection } from './types';

export interface SongBlock {
  id: number;
  content: string;
  explicitLabel: string | null;
  explicitType: SectionType | null;
  isProgression: boolean;
  hasLyrics: boolean;
  hasChords: boolean;
}

const LABEL_TO_TYPE: Record<string, SectionType> = {
  INTRO: 'INTRO',
  ESTROFA: 'VERSE',
  'PRE-CORO': 'PRECHORUS',
  CORO: 'CHORUS',
  'POST-CORO': 'POSTCHORUS',
  PUENTE: 'BRIDGE',
  INTERLUDIO: 'INTERLUDE',
  INSTRUMENTAL: 'INSTRUMENTAL',
  SOLO: 'SOLO',
  ESPONTÁNEO: 'SPONTANEOUS',
  'CORO FINAL': 'FINAL_CHORUS',
  SALIDA: 'OUTRO',
  FINAL: 'END'
};

function baseLabel(label: string): string {
  return label.replace(/\s+(?:\d+|[IVXLCDM]+)$/i, '').trim().toUpperCase();
}

export function sectionTypeFromLabel(label: string): SectionType {
  const base = baseLabel(label);
  return LABEL_TO_TYPE[base]
    || (base.startsWith('ESTROFA') || base.startsWith('PARTE') ? 'VERSE'
      : base.startsWith('SOLO') ? 'SOLO'
        : 'UNKNOWN');
}

function analyzeContent(content: string) {
  const meaningful = content.split('\n').filter((line) => line.trim());
  const chordFlags = meaningful.map((line) => isChordLine(line));
  const hasChords = chordFlags.some(Boolean);
  const hasLyrics = meaningful.some((line, index) => !chordFlags[index]);
  const isProgression = meaningful.length > 0
    && chordFlags.every(Boolean)
    && meaningful.some((line) => /[|/]|\s[-–—]\s|(?:^|\s)x\d+(?:\s|$)/i.test(line)
      || ((line.match(/[A-G](?:#|b)?(?:maj|min|dim|aug|sus2|sus4|sus|m)?(?:add)?\d{0,2}(?:\/[A-G](?:#|b)?)?/g) || []).length >= 3));

  return { hasChords, hasLyrics, isProgression };
}

function trimBlankEdges(lines: string[]): string[] {
  const copy = [...lines];
  while (copy.length && !copy[0].trim()) copy.shift();
  while (copy.length && !copy[copy.length - 1].trim()) copy.pop();
  return copy;
}

/**
 * Divide una canción sin reescribirla.
 * - Las regiones con etiqueta explícita se conservan como un único bloque.
 * - Las regiones sin etiqueta se dividen únicamente por líneas en blanco.
 * - Los encabezados se eliminan del contenido y quedan como metadatos bloqueados.
 */
export function parseSongBlocks(content: string): SongBlock[] {
  const lines = classifyLines(content);
  const blocks: SongBlock[] = [];
  let nextId = 1;
  let currentExplicitLabel: string | null = null;
  let current: string[] = [];
  let hasSeenHeader = false;

  const pushBlock = (rawLines: string[], explicitLabel: string | null) => {
    const trimmed = trimBlankEdges(rawLines);
    if (!trimmed.length) return;
    const blockContent = trimmed.join('\n');
    const analysis = analyzeContent(blockContent);
    blocks.push({
      id: nextId++,
      content: blockContent,
      explicitLabel,
      explicitType: explicitLabel ? sectionTypeFromLabel(explicitLabel) : null,
      ...analysis
    });
  };

  const flushUnknownByBlankLines = () => {
    let part: string[] = [];
    const flushPart = () => {
      pushBlock(part, null);
      part = [];
    };
    for (const line of current) {
      if (!line.trim()) flushPart();
      else part.push(line);
    }
    flushPart();
    current = [];
  };

  const flushCurrent = () => {
    if (!current.length) return;
    if (currentExplicitLabel) pushBlock(current, currentExplicitLabel);
    else flushUnknownByBlankLines();
    current = [];
  };

  for (const line of lines) {
    if (line.kind === 'section-header') {
      flushCurrent();
      hasSeenHeader = true;
      currentExplicitLabel = line.sectionLabel
        ? (detectSectionLabel(line.sectionLabel) || line.sectionLabel)
        : null;
      continue;
    }

    // Dentro de una sección explícita se preservan incluso los espacios en blanco.
    // Fuera de ella, los blancos delimitan bloques semánticos independientes.
    current.push(line.raw);
  }

  flushCurrent();

  // Si el documento no tenía encabezados, todos los bloques quedan sin etiqueta.
  // `hasSeenHeader` se conserva implícitamente en explicitLabel para el llamador.
  void hasSeenHeader;
  return blocks;
}

export function localLabelForBlock(block: SongBlock, index: number): { type: SectionType; label: string } {
  if (block.explicitLabel && block.explicitType) {
    return { type: block.explicitType, label: block.explicitLabel };
  }
  if (block.isProgression && index === 0) return { type: 'INTRO', label: 'INTRO' };
  if (!block.hasLyrics && block.hasChords) return { type: 'INSTRUMENTAL', label: 'INSTRUMENTAL' };
  return { type: 'VERSE', label: 'ESTROFA' };
}

export function rebuildSectionsFromBlocks(
  blocks: SongBlock[],
  classifications: Map<number, { type: SectionType; label: string }>
): SongSection[] {
  return blocks.map((block, index) => {
    const locked = block.explicitLabel && block.explicitType
      ? { type: block.explicitType, label: block.explicitLabel }
      : null;
    const resolved = locked || classifications.get(block.id) || localLabelForBlock(block, index);
    return {
      type: resolved.type,
      label: resolved.label,
      order: index,
      content: block.content
    };
  });
}
