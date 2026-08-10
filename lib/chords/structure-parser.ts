import { ParsedLine, SongSection, SectionType } from './types';
import { isChordLine, detectSectionLabel, isRepeatInstruction, normalizeRepeatInstruction } from './chord-parser';

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

  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index];
    const trimmed = raw.trim();

    if (!trimmed) {
      result.push({ kind: 'blank', raw });
      continue;
    }

    // Indicaciones como -estrofa-coro-, volver al puente o BIS son texto de
    // ejecución. Se conservan, pero nunca abren una sección nueva.
    if (isRepeatInstruction(trimmed)) {
      result.push({ kind: 'lyric-line', raw: normalizeRepeatInstruction(trimmed) });
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
      const nextTrimmed = rawLines[index + 1]?.trim() || '';
      const decorated = /^[`*_#~=\-\u2010-\u2014\u2212].*[`*_#~=\-\u2010-\u2014\u2212]$/.test(trimmed);

      // Caso habitual de repertorios: -intro- seguido de -estrofa-coro-.
      // Ambos forman una indicación de repetición, no un INTRO nuevo.
      if (decorated && nextTrimmed && isRepeatInstruction(nextTrimmed)) {
        result.push({
          kind: 'lyric-line',
          raw: normalizeRepeatInstruction(`${trimmed} ${nextTrimmed}`)
        });
        index += 1;
        continue;
      }

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

  const withoutOuterBlankLines = (buffer: string[]) => {
    let start = 0;
    let end = buffer.length;
    while (start < end && !buffer[start].trim()) start += 1;
    while (end > start && !buffer[end - 1].trim()) end -= 1;
    return buffer.slice(start, end);
  };

  function flush(label: string | null) {
    // La sangría de la primera línea posiciona acordes sobre la letra.
    // Retiramos sólo renglones vacíos externos, no espacios musicales.
    const text = withoutOuterBlankLines(currentBuffer).join('\n');
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
    const type = LABEL_TO_TYPE[baseLabel]
      || (baseLabel.startsWith('ESTROFA') ? 'VERSE'
        : baseLabel.startsWith('SOLO') ? 'SOLO'
          : 'UNKNOWN');

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

    const splitBlocks = (buffer: string[]): string[][] => {
      const blocks: string[][] = [];
      let block: string[] = [];
      const flushBlock = () => {
        while (block.length && !block[0].trim()) block.shift();
        while (block.length && !block[block.length - 1].trim()) block.pop();
        if (block.length) blocks.push(block);
        block = [];
      };

      for (const line of buffer) {
        if (!line.trim()) flushBlock();
        else block.push(line);
      }
      flushBlock();
      return blocks;
    };

    const chordTokenCount = (line: string) =>
      (line.match(/[A-G](?:#|b)?(?:maj|min|dim|aug|sus2|sus4|sus|m)?(?:add)?\d{0,2}(?:\/[A-G](?:#|b)?)?/g) || []).length;

    const blockIsClearIntro = (buffer: string[]) => {
      const meaningful = compactNonBlank(buffer);
      if (!meaningful.length) return false;

      const allChordNotation = meaningful.every((line) => isChordLine(line));
      if (!allChordNotation) return false;

      // Una sola progresión como "Bm - G - D - A" sí es un intro inequívoco.
      // Un acorde aislado como "D" antes de «-Estrofa-» se mantiene unido a
      // la estrofa para no volver a crear secciones fantasma.
      const hasProgressionMarker = meaningful.some((line) => /[|/]|(?:^|\s)x\d+(?:\s|$)|\s[-–—]\s/i.test(line));
      const hasSeveralChords = meaningful.some((line) => chordTokenCount(line) >= 3);
      return hasProgressionMarker || hasSeveralChords || meaningful.length >= 2;
    };

    const pushPreambleSections = (buffer: string[], nextLabel: string | null) => {
      const blocks = splitBlocks(buffer);
      if (!blocks.length) return;

      let index = 0;
      if (blockIsClearIntro(blocks[0]) && nextLabel !== 'INTRO') {
        currentBuffer = blocks[0];
        flush('INTRO');
        index = 1;
      }

      const remainder = blocks.slice(index).flatMap((block, blockIndex) =>
        blockIndex === 0 ? block : ['', ...block]
      );

      if (!compactNonBlank(remainder).length) return;

      const nextBase = (nextLabel || '').replace(/\s+(?:\d+|[IVXLCDM]+)$/i, '').toUpperCase();
      const nextIsVerse = nextBase === 'ESTROFA';

      if (nextIsVerse) {
        // Si el primer encabezado es ESTROFA, el texto previo pertenece a ella.
        currentBuffer = remainder;
      } else {
        // Si el primer encabezado explícito es CORO, PUENTE, PRE-CORO, etc.,
        // el bloque previo con letra debe convertirse en ESTROFA y no mezclarse
        // con esa sección explícita.
        currentBuffer = remainder;
        flush('ESTROFA');
      }
    };

    for (const line of lines) {
      if (line.kind === 'section-header') {
        const nextLabel = line.sectionLabel || null;

        if (!foundFirstHeader) {
          foundFirstHeader = true;

          if (compactNonBlank(preambleBuffer).length) {
            pushPreambleSections(preambleBuffer, nextLabel);
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
      const block = withoutOuterBlankLines(blockBuffer).join('\n');
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

  // Numera encabezados repetidos sin sufijo para que un segundo INTRO,
  // PUENTE, INTERLUDIO, etc. no sea indistinguible del primero.
  const labelCounts = new Map<string, number>();
  return sections.map((section, index) => {
    const base = section.label.replace(/\s+(?:\d+|[IVXLCDM]+)$/i, '').trim();
    const alreadyNumbered = /\s+(?:\d+|[IVXLCDM]+)$/i.test(section.label);
    const count = (labelCounts.get(base) || 0) + 1;
    labelCounts.set(base, count);

    return {
      ...section,
      order: index + 1,
      label: alreadyNumbered || count === 1 ? section.label : `${base} ${count}`
    };
  });
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
