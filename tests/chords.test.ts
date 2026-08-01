import { describe, it, expect } from 'vitest';
import { parseChord, isChordLine, classifyToken, tokenizeChordLine } from '../lib/chords/chord-parser';
import { transposeChord, transposeChordLine, transposeSongContent, semitoneDifference } from '../lib/chords/transposition';
import { detectKey, formatKeyLabel } from '../lib/chords/key-detection';
import { buildSections, renderSections } from '../lib/chords/structure-parser';

describe('parseChord', () => {
  it('parsea acordes simples y con calidad', () => {
    expect(parseChord('C').recognized).toBe(true);
    expect(parseChord('Cm').quality).toBe('m');
    expect(parseChord('C7').extension).toBe('7');
    expect(parseChord('Cmaj7').quality).toBe('maj');
    expect(parseChord('Cmaj7').extension).toBe('7');
  });

  it('parsea slash chords', () => {
    const c = parseChord('D/F#');
    expect(c.root).toBe('D');
    expect(c.bass?.root).toBe('F');
    expect(c.bass?.accidental).toBe('#');
  });

  it('parsea extensiones y modificaciones complejas', () => {
    expect(parseChord('Cadd9').extension).toBe('add9');
    expect(parseChord('G7(b9)').modifications).toBe('(b9)');
    expect(parseChord('A7(#5)').modifications).toBe('(#5)');
    expect(parseChord('F#sus4').recognized).toBe(true);
    expect(parseChord('Bb/D').recognized).toBe(true);
  });

  it('conserva acordes no reconocidos sin destruirlos', () => {
    const c = parseChord('Hallelujah');
    expect(c.recognized).toBe(false);
    expect(c.raw).toBe('Hallelujah');
  });
});

describe('isChordLine', () => {
  it('detecta líneas de acordes', () => {
    expect(isChordLine('G        D')).toBe(true);
    expect(isChordLine('Em             C')).toBe(true);
    expect(isChordLine('| G / / / | D/F# / / / | Em7 / / / | Cadd9 / / / |')).toBe(true);
  });

  it('no confunde letra normal con acordes', () => {
    expect(isChordLine('Grande eres Dios')).toBe(false);
    expect(isChordLine('Tu amor nunca fallará')).toBe(false);
  });

  // Regresión: "A" y "E" son acordes válidos (La mayor, Mi mayor) y no
  // deben excluirse por coincidir con palabras cortas del español. Antes
  // de este fix, líneas como "Bm         A" no se detectaban como línea
  // de acordes y por lo tanto nunca se transponían.
  it('reconoce líneas de acordes que incluyen A o E solas', () => {
    expect(isChordLine('Bm         A')).toBe(true);
    expect(isChordLine('F#m          G')).toBe(true);
    expect(isChordLine('                        A                 Bm')).toBe(true);
    expect(isChordLine('E        A        B')).toBe(true);
  });

  // Regresión: acordes envueltos en paréntesis y separados por guion largo
  // ("–", no el guion normal "-"), como "Em  (D – C# – A – F# – B)", deben
  // reconocerse como línea de acordes y transponerse correctamente.
  it('reconoce y transpone acordes envueltos en paréntesis y separados por guion largo', () => {
    const line = 'Em  (D – C# – A – F# – B)';
    expect(isChordLine(line)).toBe(true);

    const transposed = transposeSongContent(line, { semitones: 2 });
    expect(transposed).toBe('F#m  (E – Eb – B – G# – C#)');
  });
});

describe('transposeChord', () => {
  it('transpone acordes simples un semitono', () => {
    expect(transposeChord('G', { semitones: 2 })).toBe('A');
    expect(transposeChord('C', { semitones: 1 })).toBe('C#');
  });

  it('usa siempre la notación general fija (no permite elegir sostenidos o bemoles)', () => {
    // C#, F#, G# se muestran con sostenido; Eb y Bb se muestran con bemol
    expect(transposeChord('C', { semitones: 1 })).toBe('C#');
    expect(transposeChord('C', { semitones: 3 })).toBe('Eb'); // no "D#"
    expect(transposeChord('C', { semitones: 6 })).toBe('F#');
    expect(transposeChord('C', { semitones: 8 })).toBe('G#');
    expect(transposeChord('C', { semitones: 10 })).toBe('Bb'); // no "A#"
  });

  it('normaliza a la notación general incluso si el acorde original venía escrito distinto', () => {
    // Si el usuario escribió D# o A#, al transponer (incluso 0 semitonos) se normaliza
    expect(transposeChord('D#', { semitones: 0 })).toBe('Eb');
    expect(transposeChord('A#m', { semitones: 0 })).toBe('Bbm');
    expect(transposeChord('Db', { semitones: 0 })).toBe('C#');
  });

  it('transpone slash chords', () => {
    expect(transposeChord('D/F#', { semitones: 2 })).toBe('E/G#');
  });

  it('transpone acordes menores y extendidos', () => {
    expect(transposeChord('Em7', { semitones: 2 })).toBe('F#m7');
    expect(transposeChord('Cadd9', { semitones: 2 })).toBe('Dadd9');
  });

  it('nunca modifica acordes no reconocidos', () => {
    expect(transposeChord('Hallelujah', { semitones: 3 })).toBe('Hallelujah');
  });
});

describe('regresión: transposición completa de Bm a Dm (caso reportado)', () => {
  const original = `[INTRO] Bm A F#m G x2

[ESTROFA]
Bm         A
Levantamos un clamor
F#m          G
por sanidad y redención
Bm             A
Muestranos lo que Tu ves
F#m               G
los secretos de Tu corazón.

[PRE-CORO]
G                         A             G
Que el cielo se parta en dos... inundanos
                        A                 Bm
en el desierto broten rios... vida sopla hoy

[CORO]
  Bm                        D
// Hossana al Rey de Salvación
                     Em
Hossana al Dios Altisimo
          G            A             Bm
Hossana, Jesucristo, Jesucristo es Rey //

[SOLO] G A G A Bm C#m

[PUENTE]
G       A       G     A     Bm   C#m
Hossana Hossana Hossana al rey`;

  it('transpone TODAS las apariciones de "Bm A" y "A Bm", no solo algunas', () => {
    // Bm -> Dm es +3 semitonos
    const result = transposeSongContent(original, { semitones: 3 });

    expect(result).toContain('Dm         C'); // antes se quedaba como "Bm         A"
    expect(result).toContain('Am          Bb'); // antes ya funcionaba (era F#m G)
    expect(result).not.toContain('Bm         A'); // no debe sobrevivir sin transponer
    expect(result).not.toContain('                        A                 Bm'); // línea del PRE-CORO
  });

  it('produce el resultado completo correcto, incluyendo la línea de [INTRO] con "x2" y notación general (Bb en vez de A#)', () => {
    const result = transposeSongContent(original, { semitones: 3 });
    expect(result).toContain('[INTRO] Dm C Am Bb x2'); // antes no se transponía nada en esta línea
    expect(result).toContain('Dm         C');
    expect(result).toContain('Am          Bb');
    expect(result).toContain('Bb                         C             Bb');
    expect(result).toContain('                        C                 Dm');
    expect(result).toContain('  Dm                        F');
    expect(result).toContain('                     Gm');
    expect(result).toContain('          Bb            C             Dm');
    expect(result).toContain('[SOLO] Bb C Bb C Dm Em');
    expect(result).toContain('Bb       C       Bb     C     Dm   Em');
  });
});

describe('transposeChordLine / transposeSongContent', () => {
  it('preserva el espaciado de la letra y solo cambia acordes', () => {
    const content = 'G        D\nGrande eres Dios\nEm             C\nTu amor nunca fallará';
    const result = transposeSongContent(content, { semitones: 2 });
    const lines = result.split('\n');
    expect(lines[1]).toBe('Grande eres Dios');
    expect(lines[3]).toBe('Tu amor nunca fallará');
    expect(lines[0].trim().split(/\s+/)).toEqual(['A', 'E']);
  });

  it('no modifica encabezados de sección', () => {
    const content = '[CORO]\nG D\nTe adoramos';
    const result = transposeSongContent(content, { semitones: 2 });
    expect(result.split('\n')[0]).toBe('[CORO]');
  });
});

describe('semitoneDifference', () => {
  it('calcula la diferencia entre dos tonalidades', () => {
    expect(semitoneDifference('C', 'D')).toBe(2);
    expect(semitoneDifference('G', 'A')).toBe(2);
  });
});

describe('detectKey', () => {
  it('detecta la tonalidad probable de una progresión típica en G', () => {
    const content = '[INTRO]\nG D Em7 Cadd9\n[ESTROFA 1]\nG D/F# Em7 Cadd9\n[CORO]\nG D Em7 Cadd9';
    const result = detectKey(content);
    expect(result.key).toBe('G');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('usa la calidad de los acordes para distinguir D mayor de G mayor o B menor', () => {
    const content = `[CORO]
G        A        Bm
Amoroso eres Tú
G        A        D
No hay nadie más
[ESTROFA]
G A Bm D/F#
Em A D`;
    const result = detectKey(content);
    expect(formatKeyLabel(result)).toBe('D');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('detecta correctamente una tonalidad menor (Bm), no solo la mayor relativa (D)', () => {
    // Esta progresión usa exactamente las mismas notas que Re mayor (su relativa
    // mayor), así que el motor debe usar dónde aparece la tónica (Bm al inicio
    // y al final) para inclinarse por la tonalidad menor correcta.
    const content = `[INTRO] Bm A F#m G
[ESTROFA]
Bm A F#m G
[CORO]
Bm D Em G A Bm`;
    const result = detectKey(content);
    expect(result.key).toBe('B');
    expect(result.isMinor).toBe(true);
    expect(formatKeyLabel(result)).toBe('Bm');
  });
});

describe('buildSections / renderSections', () => {
  it('estructura contenido sin encabezados en estrofas', () => {
    const content = 'G        D\nGrande eres Dios\n\nEm             C\nTu amor nunca fallará';
    const sections = buildSections(content);
    expect(sections.length).toBe(2);
    // La primera estrofa queda sin número (igual que "CORO" sin número
    // cuando solo hay uno) y solo se numera a partir de la segunda —
    // coincide con cómo se escriben las canciones en la práctica.
    expect(sections[0].label).toBe('ESTROFA');
    expect(sections[1].label).toBe('ESTROFA 2');
  });

  it('respeta encabezados explícitos', () => {
    const content = '[CORO]\nG D\nTe adoramos\n\n[PUENTE]\nEm C\nSanto eres tú';
    const sections = buildSections(content);
    expect(sections.map((s) => s.label)).toEqual(['CORO', 'PUENTE']);
    expect(sections[0].type).toBe('CHORUS');
    expect(sections[1].type).toBe('BRIDGE');
  });

  it('renderSections reconstruye el texto con corchetes', () => {
    const sections = buildSections('[CORO]\nG D\nTe adoramos');
    const rendered = renderSections(sections);
    expect(rendered).toBe('[CORO]\nG D\nTe adoramos');
  });

  // Regresión: una etiqueta de sección que comparte línea con acordes,
  // p.ej. "[INTRO] Bm A F#m G x2", debe reconocerse como su propia
  // sección INTRO en vez de quedar envuelta en una "ESTROFA 1" inventada.
  it('reconoce un encabezado de sección aunque comparta línea con acordes', () => {
    const content = '[INTRO] Bm A F#m G x2\n\n[ESTROFA]\nBm         A\nLevantamos un clamor';
    const sections = buildSections(content);
    expect(sections.map((s) => s.label)).toEqual(['INTRO', 'ESTROFA']);
    expect(sections[0].type).toBe('INTRO');
    expect(sections[0].content).toBe('Bm A F#m G x2');
  });
});

describe('classifyToken (usado para colorear solo acordes, no la línea completa)', () => {
  it('clasifica acordes, etiquetas de sección y marcadores de repetición por separado', () => {
    expect(classifyToken('Bm')).toBe('chord');
    expect(classifyToken('A')).toBe('chord');
    expect(classifyToken('[INTRO]')).toBe('section');
    expect(classifyToken('x2')).toBe('repeat');
    expect(classifyToken('(x2)')).toBe('repeat');
    expect(classifyToken('/')).toBe('separator');
  });

  it('no clasifica palabras normales como acordes', () => {
    expect(classifyToken('Levantamos')).toBe('neutral');
    expect(classifyToken('clamor')).toBe('neutral');
    expect(classifyToken('Dios')).toBe('neutral'); // empieza con "D" pero no es un acorde válido
  });
});

describe('progresiones compactas con barras y guiones', () => {
  const progression = '|B/Eb-E |F#/Bb-G#m | - |B/Eb |C#m F#sus|';

  it('reconoce la línea completa como progresión de acordes', () => {
    expect(isChordLine(progression)).toBe(true);
  });

  it('reconoce cada slash chord y acorde pegado a separadores', () => {
    const chordValues = tokenizeChordLine(progression)
      .filter((token) => token.kind === 'chord')
      .map((token) => token.value);

    expect(chordValues).toEqual(['B/Eb', 'E', 'F#/Bb', 'G#m', 'B/Eb', 'C#m', 'F#sus']);
  });

  it('transpone la progresión sin modificar barras ni guiones', () => {
    expect(transposeSongContent(progression, { semitones: 2 }))
      .toBe('|C#/F-F# |G#/C-Bbm | - |C#/F |Ebm G#sus|');
  });

  it('incluye los acordes compactos al detectar tonalidad', () => {
    const result = detectKey(`${progression}\n|B E F# B|`);
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe('encabezados de sección sin corchetes', () => {
  it('reconoce estrofa II como una sección independiente', () => {
    const content = `[INTRO]\nBsus4 F# G#m E\n\n[ESTROFA]\nE                 B\nPréstame un poco del Cielo donde te cantan\n\nestrofa II\nE                 B\nDame el sonido del Cielo para adorarte`;

    const sections = buildSections(content);

    expect(sections.map((section) => section.label)).toEqual([
      'INTRO',
      'ESTROFA',
      'ESTROFA II'
    ]);
    expect(sections[2].content).not.toMatch(/estrofa II/i);
  });
});

describe('estructura local con encabezados escritos con dos puntos', () => {
  it('reconoce y conserva INTRO, VERSO, PRE-CORO, CORO, INTERLUDIO y PUENTE numerados', () => {
    const content = `INTRO: Gmaj7 - Em7 - Bm - F#m7

VERSO 1:
Gmaj7 Em7 Bm
Los corazones a Ti vuelven

PRE-CORO:
Gmaj7 Em7 Bm
Un nuevo tiempo

CORO 1:
Gmaj7 Em7
Más de tu presencia

INTRO: // Gmaj7 - Em7 - Bm - F#m7 //

INTERLUDIO 2: // Gmaj7 - A - Bm - F#m7 //

PUENTE 2:
Gmaj7 A/C#
Queremos más`;

    const sections = buildSections(content);
    expect(sections.map((section) => section.label)).toEqual([
      'INTRO',
      'ESTROFA 1',
      'PRE-CORO',
      'CORO 1',
      'INTRO 2',
      'INTERLUDIO 2',
      'PUENTE 2'
    ]);
    expect(sections[0].content).toContain('Gmaj7 - Em7 - Bm - F#m7');
    expect(sections[4].content).toContain('// Gmaj7 - Em7 - Bm - F#m7 //');
  });
});
