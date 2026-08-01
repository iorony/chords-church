import { ParsedLine, SongSection, SectionType } from './types';
import { isChordLine, detectSectionLabel } from './chord-parser';

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

/**
 * Cuando una etiqueta de sección comparte línea con contenido adicional
 * (p.ej. "[INTRO] Bm A F#m G x2"), la extrae como encabezado real y
 * devuelve el resto como el contenido de esa sección — en vez de que la
 * línea completa se pierda dentro de una estrofa inventada por no
 * calzar con el patrón de "línea que es solo un encabezado".
 */
function extractInlineSectionHeader(trimmedLine: string): { label: string; remainder: string } | null {
  // Formato entre corchetes: [INTRO] G D Em C
  const bracketMatch = /^\[([^\]]+)\]\s*(.*)$/.exec(trimmedLine);
  if (bracketMatch) {
    const label = detectSectionLabel(bracketMatch[1]);
    if (!label) return null;
    return { label, remainder: bracketMatch[2].trim() };
  }

  // Formato común pegado desde documentos: CORO 2: // G D Em C //
  // Solo acepta nombres musicales conocidos para no convertir una frase
  // normal que contenga dos puntos en un encabezado falso.
  const colonIndex = trimmedLine.indexOf(':');
  if (colonIndex > 0) {
    const possibleHeader = trimmedLine.slice(0, colonIndex).trim();
    const label = detectSectionLabel(possibleHeader);
    if (label) {
      return {
        label,
        remainder: trimmedLine.slice(colonIndex + 1).trim()
      };
    }
  }

  return null;
}

/** Clasifica cada línea del contenido crudo pegado por el usuario */
export function classifyLines(content: string): ParsedLine[] {
  const rawLines = content.split('\n');
  const result: ParsedLine[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();

    if (!trimmed) {
      result.push({ kind: 'blank', raw });
      continue;
    }

    if (/^\[.+\]$/.test(trimmed)) {
      const rawLabel = trimmed.slice(1, -1).trim();
      // Normaliza etiquetas equivalentes. Por ejemplo [VERSO] y [VERSE]
      // siempre se reconstruyen como [ESTROFA].
      const normalizedLabel = detectSectionLabel(rawLabel) || rawLabel;
      result.push({ kind: 'section-header', raw, sectionLabel: normalizedLabel });
      continue;
    }

    const inline = extractInlineSectionHeader(trimmed);
    if (inline) {
      result.push({ kind: 'section-header', raw: `[${inline.label}]`, sectionLabel: inline.label });
      if (inline.remainder) {
        result.push({
          kind: isChordLine(inline.remainder) ? 'chord-line' : 'lyric-line',
          raw: inline.remainder
        });
      }
      continue;
    }

    const label = detectSectionLabel(trimmed);
    if (label) {
      result.push({ kind: 'section-header', raw, sectionLabel: label });
      continue;
    }

    if (isChordLine(raw)) {
      result.push({ kind: 'chord-line', raw });
      continue;
    }

    result.push({ kind: 'lyric-line', raw });
  }

  return result;
}

/**
 * Agrupa las líneas clasificadas en secciones. Cuando el contenido no
 * trae encabezados explícitos, agrupa por bloques separados por líneas
 * en blanco y los etiqueta como ESTROFA en orden.
 */
export function buildSections(content: string): SongSection[] {
  const lines = classifyLines(content);
  const sections: SongSection[] = [];

  let currentLabel: string | null = null;
  let currentBuffer: string[] = [];
  let order = 0;
  let verseCounter = 0;
  let hasExplicitLabels = lines.some((l) => l.kind === 'section-header');

  function flush(label: string | null) {
    const text = currentBuffer.join('\n').trim();
    if (!text) {
      currentBuffer = [];
      return;
    }
    order += 1;
    let resolvedLabel = label;
    if (!resolvedLabel) {
      verseCounter += 1;
      resolvedLabel = `ESTROFA ${verseCounter}`;
    }
    const baseLabel = resolvedLabel.replace(/\s+(?:\d+|[IVXLCDM]+)$/i, '').trim().toUpperCase();
    const type = LABEL_TO_TYPE[baseLabel] || (baseLabel.startsWith('ESTROFA') ? 'VERSE' : 'UNKNOWN');

    sections.push({
      type,
      label: resolvedLabel,
      order,
      content: text
    });
    currentBuffer = [];
  }

  if (hasExplicitLabels) {
    let foundFirstHeader = false;
    let preambleBuffer: string[] = [];

    const compactNonBlank = (buffer: string[]) => buffer.filter((line) => line.trim());
    const preambleIsClearIntro = (buffer: string[]) => {
      const meaningful = compactNonBlank(buffer);
      if (meaningful.length < 2) return false;

      // Solo se crea un INTRO implícito cuando el bloque previo contiene
      // notación musical inequívoca. Un acorde aislado antes de «-Estrofa-»
      // normalmente pertenece a esa estrofa y no debe generar ESTROFA 1 vacía.
      const allChordNotation = meaningful.every((line) => isChordLine(line));
      const hasProgressionMarker = meaningful.some((line) => /[|/]|(?:^|\s)x\d+(?:\s|$)/i.test(line));
      return allChordNotation && hasProgressionMarker;
    };

    for (const line of lines) {
      if (line.kind === 'section-header') {
        const nextLabel = line.sectionLabel || null;

        if (!foundFirstHeader) {
          foundFirstHeader = true;

          if (compactNonBlank(preambleBuffer).length) {
            if (preambleIsClearIntro(preambleBuffer) && nextLabel !== 'INTRO') {
              currentBuffer = preambleBuffer;
              flush('INTRO');
            } else {
              // Adjunta el contenido anterior al primer encabezado explícito.
              // Corrige casos como:
              //   D
              //   -Estrofa-
              // evitando crear una ESTROFA adicional solo para «D».
              currentBuffer = preambleBuffer;
            }
          }
          preambleBuffer = [];
          currentLabel = nextLabel;
          continue;
        }

        flush(currentLabel);
        currentLabel = nextLabel;
      } else if (!foundFirstHeader) {
        if (line.kind !== 'blank') {
          preambleBuffer.push(line.raw);
        } else if (preambleBuffer.length && preambleBuffer[preambleBuffer.length - 1] !== '') {
          preambleBuffer.push('');
        }
      } else if (line.kind !== 'blank') {
        currentBuffer.push(line.raw);
      } else if (currentBuffer.length && currentBuffer[currentBuffer.length - 1] !== '') {
        currentBuffer.push('');
      }
    }

    // Por seguridad, si no se consumió el preámbulo, intégralo antes de cerrar.
    if (!foundFirstHeader && compactNonBlank(preambleBuffer).length) {
      currentBuffer = preambleBuffer;
    }
    flush(currentLabel);
  } else {
    // Sin encabezados: primero agrupa por bloques separados por líneas en blanco.
    // Después reconoce bloques repetidos como CORO y marca los demás como ESTROFA.
    const blocks: string[] = [];
    let blockBuffer: string[] = [];
    const flushBlock = () => {
      const block = blockBuffer.join('\n').trim();
      if (block) blocks.push(block);
      blockBuffer = [];
    };

    for (const line of lines) {
      if (line.kind === 'blank') flushBlock();
      else blockBuffer.push(line.raw);
    }
    flushBlock();

    const normalizedCounts = new Map<string, number>();
    for (const block of blocks) {
      const normalized = block.replace(/\s+/g, ' ').trim().toLowerCase();
      normalizedCounts.set(normalized, (normalizedCounts.get(normalized) || 0) + 1);
    }

    let localVerseCounter = 0;
    let chorusCounter = 0;
    blocks.forEach((block, index) => {
      const normalized = block.replace(/\s+/g, ' ').trim().toLowerCase();
      const repeated = (normalizedCounts.get(normalized) || 0) > 1;
      const blockLines = block.split('\n').filter((line) => line.trim());
      const chordOnly = blockLines.length > 0 && blockLines.every((line) => isChordLine(line));

      let label: string;
      let type: SectionType;
      if (repeated) {
        chorusCounter += 1;
        label = chorusCounter === 1 ? 'CORO' : `CORO ${chorusCounter}`;
        type = 'CHORUS';
      } else if (chordOnly && index === 0) {
        label = 'INTRO';
        type = 'INTRO';
      } else if (chordOnly) {
        label = 'INSTRUMENTAL';
        type = 'INSTRUMENTAL';
      } else {
        localVerseCounter += 1;
        label = localVerseCounter === 1 ? 'ESTROFA' : `ESTROFA ${localVerseCounter}`;
        type = 'VERSE';
      }

      sections.push({ type, label, order: index + 1, content: block });
    });
  }

  return sections;
}

/** Reconstruye el texto completo de la canción a partir de secciones estructuradas, con encabezados entre corchetes */
export function renderSections(sections: SongSection[]): string {
  return sections
    .sort((a, b) => a.order - b.order)
    .map((s) => `[${s.label}]\n${s.content}`)
    .join('\n\n');
}

/** Detecta bloques repetidos consecutivos (p.ej. mismo coro repetido varias veces seguidas) */
export function detectRepeatedBlocks(sections: SongSection[]): { label: string; count: number }[] {
  const repeats: { label: string; count: number }[] = [];
  const seen = new Map<string, number>();
  for (const s of sections) {
    const key = s.content.replace(/\s+/g, ' ').trim();
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [key, count] of seen.entries()) {
    if (count > 1) {
      const label = sections.find((s) => s.content.replace(/\s+/g, ' ').trim() === key)?.label || 'desconocido';
      repeats.push({ label, count });
    }
  }
  return repeats;
}
