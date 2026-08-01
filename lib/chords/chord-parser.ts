import { NoteLetter, Accidental, ParsedChord } from './types';

/**
 * Expresión regular para un acorde en cifrado americano.
 * Soporta: nota raíz, alteración, calidad (m, dim, aug, sus2, sus4),
 * extensiones (6,7,9,11,13,maj7,min7...), modificaciones entre paréntesis
 * y bajo alternativo (slash chord).
 *
 * Ejemplos válidos: C, Cm, C7, Cmaj7, Cmin7, Csus2, Csus4, Cadd9, C6, C9,
 * C11, C13, Cdim, Cdim7, Caug, C5, C/G, C#m7, Dbmaj7, F#sus4, Bb/D,
 * G7(b9), A7(#5)
 */
const CHORD_REGEX =
  /^([A-G])(#|b)?((?:maj|min|dim|aug|sus2|sus4|sus)?)(m(?!aj))?((?:add)?\d{1,2})?((?:\((?:[#b]?\d{1,2})\))*)(\/([A-G])(#|b)?)?$/;

/** Palabras comunes en español que podrían confundirse con acordes por su forma (letra + texto),
 * pero que el parser NO reconoce como acorde válido. Nunca incluyas aquí una nota real de una sola
 * letra (A, E) — esas SÍ son acordes válidos (La mayor, Mi mayor) y el parser las reconoce primero. */
const NON_CHORD_WORDS = new Set([
  'O', 'DE', 'DO', 'SI', 'TE', 'ME', 'MI', 'ES', 'EN', 'UN', 'AL', 'AMOR'
]);

/** Caracteres separadores entre acordes: barra de compás, slash de repetición,
 * punto, y cualquier variante de guion (ASCII "-", guion en "–", raya "—",
 * signo menos "−"), tal como aparecen en progresiones como "D – C# – A". */
export const SEPARATOR_TOKEN_REGEX = /^[/|.\-\u2010\u2011\u2012\u2013\u2014\u2212]+$/;

/**
 * Quita paréntesis, corchetes y puntuación envolvente de los extremos de un
 * token (p.ej. "(D" -> prefijo "(", núcleo "D"; "B)" -> núcleo "B", sufijo
 * ")") para poder reconocer y transponer el acorde aunque venga envuelto,
 * conservando exactamente esos símbolos alrededor al reconstruir la línea.
 */
const WRAPPER_CHAR = /[()[\]{},;:]/;
export function stripChordWrapper(token: string): { prefix: string; core: string; suffix: string } {
  let start = 0;
  let end = token.length;
  while (start < end && WRAPPER_CHAR.test(token[start])) start++;
  while (end > start && WRAPPER_CHAR.test(token[end - 1])) end--;
  return { prefix: token.slice(0, start), core: token.slice(start, end), suffix: token.slice(end) };
}

export function isLikelyChordToken(token: string): boolean {
  if (!token) return false;
  const cleaned = token.trim();
  if (!cleaned) return false;
  // Debe empezar con letra de nota A-G (mayúscula)
  if (!/^[A-G]/.test(cleaned)) return false;
  if (NON_CHORD_WORDS.has(cleaned.toUpperCase()) && cleaned.length <= 2 && !/\d/.test(cleaned)) {
    return false;
  }
  return true;
}

export function parseChord(raw: string): ParsedChord {
  const trimmed = raw.trim();
  const match = CHORD_REGEX.exec(trimmed);

  if (!match) {
    return {
      raw: trimmed,
      root: 'C',
      accidental: '',
      quality: '',
      extension: '',
      modifications: '',
      bass: null,
      recognized: false
    };
  }

  const [, root, accidental, qualityWord, minorFlag, extension, modifications, , bassRoot, bassAccidental] = match;

  let quality = qualityWord || '';
  if (minorFlag) quality = quality ? `${quality}m` : 'm';

  return {
    raw: trimmed,
    root: root as NoteLetter,
    accidental: (accidental || '') as Accidental,
    quality,
    extension: extension || '',
    modifications: modifications || '',
    bass: bassRoot ? { root: bassRoot as NoteLetter, accidental: (bassAccidental || '') as Accidental } : null,
    recognized: true
  };
}

/** Reconstruye la representación textual de un acorde parseado */
export function stringifyChord(chord: ParsedChord): string {
  if (!chord.recognized) return chord.raw;
  const base = `${chord.root}${chord.accidental}${chord.quality}${chord.extension}${chord.modifications}`;
  if (chord.bass) {
    return `${base}/${chord.bass.root}${chord.bass.accidental}`;
  }
  return base;
}

export type TokenKind = 'chord' | 'section' | 'repeat' | 'separator' | 'neutral';

/**
 * Clasifica un token dentro de una línea: acorde, etiqueta de sección
 * inline (p.ej. "[INTRO]"), marcador de repetición (p.ej. "x2"),
 * separador (barras, guiones) o neutral (palabra normal, letra).
 * Se usa tanto para decidir si una línea es de acordes como para
 * colorear cada token individualmente al mostrarlo (nunca se colorea
 * una línea completa: solo lo que realmente es acorde).
 */
export function classifyToken(token: string): TokenKind {
  if (SEPARATOR_TOKEN_REGEX.test(token)) return 'separator';
  if (/^\[.*\]$/.test(token)) return 'section';
  if (/^\(?x\d+\)?$/i.test(token)) return 'repeat';
  const { core } = stripChordWrapper(token);
  if (!core) return 'separator';
  // Solo se reconoce como acorde si el parser lo valida de forma
  // ESTRICTA (coincide exactamente con la gramática de cifrado
  // americano). No se usa un reconocimiento laxo aquí para evitar que
  // palabras como "Dios" o "Gloria" (empiezan con una nota válida pero
  // no son acordes) se pinten como si lo fueran.
  return parseChord(core).recognized ? 'chord' : 'neutral';
}

/**
 * Detecta si una línea completa parece ser una línea de acordes
 * (mayoría de tokens son acordes reconocibles o parecen serlo, y hay
 * suficiente espacio en blanco típico de una línea de cifrado sobre letra).
 */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Line made only of chords/separators like "| G / / / | D/F# / / / |"
  const barLine = /^[\sA-G0-9#b/|.\-()add majminsudg]+$/i.test(trimmed) && /[A-G]/.test(trimmed);

  const tokens = tokenizeChordLine(trimmed).filter((t) => t.kind !== 'whitespace');
  if (tokens.length === 0) return false;

  const meaningful = tokens.filter((t) => t.kind !== 'section' && t.kind !== 'repeat');
  const chordCount = meaningful.filter((t) => t.kind === 'chord').length;
  const neutralCount = meaningful.filter((t) => t.kind === 'neutral').length;
  const notationCount = meaningful.filter((t) => t.kind === 'chord' || t.kind === 'separator').length;

  if (chordCount === 0 || neutralCount > 0) return false;
  const ratio = notationCount / Math.max(meaningful.length, 1);
  return ratio >= 0.75 && (barLine || chordCount >= 1);
}

const SECTION_BASES = new Set([
  'INTRO',
  'ESTROFA',
  'PRE CORO',
  'CORO',
  'POST CORO',
  'PUENTE',
  'INTERLUDIO',
  'INSTRUMENTAL',
  'SOLO',
  'ESPONTANEO',
  'CORO FINAL',
  'SALIDA',
  'FINAL',
  'PARTE'
]);

const INSTRUMENT_NAMES = '(?:PIANO|PAD|GUITARRA|TECLADO|BATERIA|BAJO|VOCES?|ACUSTICO|ELECTRICO)';

/**
 * Convierte encabezados pegados desde Word/PDF/sitios web a una forma
 * comparable. Quita adornos exteriores, unifica guiones/guiones bajos como
 * espacios, elimina tildes y colapsa espacios.
 */
export function normalizeSectionCandidate(line: string): string {
  return line
    .trim()
    .replace(/^\[\s*|\s*\]$/g, '')
    .replace(/^\(\s*|\s*\)$/g, '')
    .replace(/^\{\s*|\s*\}$/g, '')
    .replace(/^[`*_#~=\-\u2010\u2011\u2012\u2013\u2014\u2212\s]+/, '')
    .replace(/[`*_#~=\-\u2010\u2011\u2012\u2013\u2014\u2212:\s]+$/, '')
    .replace(/[\-\u2010\u2011\u2012\u2013\u2014\u2212_]+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Detecta indicaciones de ejecución/repetición que mencionan secciones, pero
 * que NO deben convertirse en encabezados nuevos.
 */
export function isRepeatInstruction(line: string): boolean {
  const normalized = normalizeSectionCandidate(line)
    .replace(/[(),.;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return false;

  // Compuestos legítimos que contienen dos palabras de sección, pero sí son
  // encabezados reales y no instrucciones de repetición.
  if (/^(?:PRE CORO|POST CORO|CORO FINAL|ESTROFA FINAL|ESTROFA FIN)$/.test(normalized)) return false;
  if (new RegExp(`^(?:INTRO|INTRODUCCION)(?:\\s+${INSTRUMENT_NAMES})?(?:\\s+(?:[0-9]+|[IVXLCDM]+))?$`).test(normalized)) return false;
  if (new RegExp(`^SOLO(?:\\s+(?:DE\\s+)?${INSTRUMENT_NAMES})?(?:\\s+(?:[0-9]+|[IVXLCDM]+))?$`).test(normalized)) return false;

  if (/^(?:BIS|X\s*\d+|REPETIR|REPITE|REPETIR TODO)$/.test(normalized)) return true;
  if (/^(?:REPETIR|REPITE|VUELVE|VUELVES|VOLVER|REGRESA|REGRESAR|IR)\b/.test(normalized)) return true;
  if (/\b(?:REPETIR|REPITE|VUELVE|VUELVES|VOLVER|REGRESA|REGRESAR)\b/.test(normalized)) return true;

  // Formatos abreviados habituales: -estrofa-coro-, -intro-puente-coro-.
  // Exige al menos dos nombres para no confundir PRE-CORO con una repetición.
  const names = normalized.match(/INTRO|ESTROFA|VERSO|VERSE|CORO|PUENTE|BRIDGE|INTERLUDIO|INSTRUMENTAL|FINAL/g) || [];
  const residue = normalized
    .replace(/INTRO|ESTROFA|VERSO|VERSE|CORO|PUENTE|BRIDGE|INTERLUDIO|INSTRUMENTAL|FINAL/g, '')
    .replace(/\b(?:Y|AL|EL|LA|LOS|LAS|DE)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return names.length >= 2 && !residue;
}

export function normalizeRepeatInstruction(line: string): string {
  const normalized = normalizeSectionCandidate(line);
  if (!normalized) return line.trim();
  if (/^(?:BIS|X\s*\d+)$/.test(normalized)) return `(${normalized})`;

  const sectionNames = normalized.match(/INTRO|ESTROFA|VERSO|VERSE|CORO|PUENTE|BRIDGE|INTERLUDIO|INSTRUMENTAL|FINAL/g) || [];
  if (sectionNames.length >= 2) {
    const mapped = sectionNames.map((name) => {
      if (name === 'VERSO' || name === 'VERSE') return 'ESTROFA';
      if (name === 'BRIDGE') return 'PUENTE';
      return name;
    });
    return `(REPETIR ${mapped.join(' Y ')})`;
  }

  return line.trim();
}

/**
 * Normaliza encabezados equivalentes al formato visible en español.
 * Soporta encabezados simples, numerados y compuestos:
 *   INTRO PIANO, SOLO - GUITARRA, ESTROFA FIN, PARTE II, etc.
 * Las indicaciones de repetición se excluyen expresamente.
 */
export function detectSectionLabel(line: string): string | null {
  if (isRepeatInstruction(line)) return null;

  const normalized = normalizeSectionCandidate(line);
  if (!normalized) return null;

  const suffixMatch = /\s+([0-9]+|[IVXLCDM]+)$/.exec(normalized);
  const suffix = suffixMatch?.[1];
  const withoutSuffix = suffixMatch ? normalized.slice(0, suffixMatch.index).trim() : normalized;

  // Las divisiones PARTE se preservan tal como fueron numeradas.
  if (/^PARTE$/.test(withoutSuffix)) return suffix ? `PARTE ${suffix}` : 'PARTE';

  // Encabezados que indican explícitamente el cierre de una estrofa/canción.
  if (/^(?:ESTROFA|VERSO|VERSE)\s+(?:FIN|FINAL)$/.test(normalized)) return 'FINAL';

  // INTRO puede incluir el instrumento o ambiente sin crear una etiqueta nueva.
  if (new RegExp(`^(?:INTRO|INTRODUCCION)(?:\\s+${INSTRUMENT_NAMES})?$`).test(withoutSuffix)) {
    return suffix ? `INTRO ${suffix}` : 'INTRO';
  }

  if (/^(?:ESTROFA|VERSO|VERSE)$/.test(withoutSuffix)) return suffix ? `ESTROFA ${suffix}` : 'ESTROFA';
  if (/^(?:PRE\s*CORO|PRE\s*CHORUS)$/.test(withoutSuffix)) return suffix ? `PRE-CORO ${suffix}` : 'PRE-CORO';
  if (/^(?:CORO|CHORUS|ESTRIBILLO)$/.test(withoutSuffix)) return suffix ? `CORO ${suffix}` : 'CORO';
  if (/^(?:POST\s*CORO|POST\s*CHORUS)$/.test(withoutSuffix)) return suffix ? `POST-CORO ${suffix}` : 'POST-CORO';
  if (/^(?:PUENTE|BRIDGE)$/.test(withoutSuffix)) return suffix ? `PUENTE ${suffix}` : 'PUENTE';
  if (/^(?:INTERLUDIO|INTERLUDE)$/.test(withoutSuffix)) return suffix ? `INTERLUDIO ${suffix}` : 'INTERLUDIO';
  if (/^INSTRUMENTAL(?:\s+.+)?$/.test(withoutSuffix)) return suffix ? `INSTRUMENTAL ${suffix}` : 'INSTRUMENTAL';

  const soloMatch = new RegExp(`^SOLO(?:\\s+(?:DE\\s+)?(${INSTRUMENT_NAMES.slice(3, -1)}))?$`).exec(withoutSuffix);
  if (soloMatch) {
    const instrument = soloMatch[1]?.replace(/^DE\s+/, '').trim();
    const base = instrument ? `SOLO ${instrument}` : 'SOLO';
    return suffix ? `${base} ${suffix}` : base;
  }

  if (/^ESPONTANEO$/.test(withoutSuffix)) return suffix ? `ESPONTÁNEO ${suffix}` : 'ESPONTÁNEO';
  if (/^CORO\s+FINAL$/.test(withoutSuffix)) return suffix ? `CORO FINAL ${suffix}` : 'CORO FINAL';
  if (/^(?:SALIDA|OUTRO)$/.test(withoutSuffix)) return suffix ? `SALIDA ${suffix}` : 'SALIDA';
  if (/^(?:FINAL|FIN|CIERRE)$/.test(withoutSuffix)) return suffix ? `FINAL ${suffix}` : 'FINAL';

  return null;
}

/**
 * Tokeniza notación musical preservando posición y separadores, incluso cuando
 * los acordes vienen pegados a barras o guiones.
 *
 * Ejemplo:
 *   |B/Eb-E |F#/Bb-G#m | - |B/Eb |C#m F#sus|
 * se divide en: |, B/Eb, -, E, |, F#/Bb, -, G#m, ...
 */
export interface ChordLineToken {
  value: string;
  column: number;
  kind: TokenKind | 'whitespace';
}

const CHORD_CORE_SOURCE = String.raw`[A-G](?:#|b)?(?:(?:maj|min|dim|aug|sus2|sus4|sus)?)(?:m(?!aj))?(?:(?:add)?\d{1,2})?(?:(?:\((?:[#b]?\d{1,2})\))*)(?:\/[A-G](?:#|b)?)?`;
const CHORD_PREFIX_REGEX = new RegExp(String.raw`^([\(\[\{,;:]*)((${CHORD_CORE_SOURCE}))([\)\]\},;:]*)`);
const INLINE_SEPARATOR_CHAR_REGEX = /[|.\-\u2010\u2011\u2012\u2013\u2014\u2212]/;

export function tokenizeChordLine(line: string): ChordLineToken[] {
  const tokens: ChordLineToken[] = [];
  let i = 0;

  while (i < line.length) {
    const column = i;
    const char = line[i];

    if (/\s/.test(char)) {
      let j = i + 1;
      while (j < line.length && /\s/.test(line[j])) j++;
      tokens.push({ value: line.slice(i, j), column, kind: 'whitespace' });
      i = j;
      continue;
    }

    if (char === '[') {
      const close = line.indexOf(']', i + 1);
      if (close !== -1) {
        tokens.push({ value: line.slice(i, close + 1), column, kind: 'section' });
        i = close + 1;
        continue;
      }
    }

    const repeat = /^\(?x\d+\)?/i.exec(line.slice(i));
    if (repeat) {
      tokens.push({ value: repeat[0], column, kind: 'repeat' });
      i += repeat[0].length;
      continue;
    }

    if (INLINE_SEPARATOR_CHAR_REGEX.test(char) || char === '/') {
      let j = i + 1;
      while (j < line.length && (INLINE_SEPARATOR_CHAR_REGEX.test(line[j]) || line[j] === '/')) j++;
      tokens.push({ value: line.slice(i, j), column, kind: 'separator' });
      i = j;
      continue;
    }

    const chord = CHORD_PREFIX_REGEX.exec(line.slice(i));
    if (chord) {
      const value = chord[0];
      const core = chord[2];
      // El siguiente carácter debe marcar un límite musical; así evitamos
      // reconocer la "G" inicial de una palabra como "Gloria".
      const next = line[i + value.length];
      if (
        parseChord(core).recognized &&
        (next === undefined || /\s/.test(next) || INLINE_SEPARATOR_CHAR_REGEX.test(next) || next === '/')
      ) {
        tokens.push({ value, column, kind: 'chord' });
        i += value.length;
        continue;
      }
    }

    // Texto desconocido: consumir hasta el próximo límite para conservarlo.
    let j = i + 1;
    while (
      j < line.length &&
      !/\s/.test(line[j]) &&
      !INLINE_SEPARATOR_CHAR_REGEX.test(line[j]) &&
      line[j] !== '/'
    ) j++;
    const value = line.slice(i, j);
    tokens.push({ value, column, kind: classifyToken(value) });
    i = j;
  }

  return tokens;
}
