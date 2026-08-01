import { describe, it, expect } from 'vitest';
import { buildSections } from '../lib/chords/structure-parser';

describe('buildSections: contenido antes del primer encabezado', () => {
  it('adjunta un acorde aislado a la primera estrofa y no inventa ESTROFA 2', () => {
    const sections = buildSections(`D
-Estrofa-
D             G
Grandioso Dios, Exaltado estas

-Coro-
D             G
Yo bendeciré tu nombre Cristo`);

    expect(sections.map((section) => section.label)).toEqual(['ESTROFA', 'CORO']);
    expect(sections[0].content.startsWith('D\nD')).toBe(true);
  });

  it('conserva un intro implícito cuando hay una progresión inequívoca', () => {
    const sections = buildSections(`| D | G |\n| Bm | A |\n-Estrofa-\nD\nGrandioso Dios`);
    expect(sections.map((section) => section.label)).toEqual(['INTRO', 'ESTROFA']);
  });
});

describe('estructura mixta con preámbulo e introducción interna', () => {
  it('separa intro, estrofa y respeta coro/intro/puente explícitos', () => {
    const content = `Bm - G - D - A

G
Un estruendo de muchas aguas
Bm        F#m
Se escucha aquí
G
Trae sanidad, trae libertad

CORO:
D
//Yo danzo en el río
A
Yo danzo en el río//

-intro-
Bm - G - D - A

PUENTE:
Bm G D A`;

    const sections = buildSections(content);

    expect(sections.map((section) => section.label)).toEqual([
      'INTRO',
      'ESTROFA',
      'CORO',
      'INTRO 2',
      'PUENTE'
    ]);
    expect(sections[0].content).toBe('Bm - G - D - A');
    expect(sections[1].content).toContain('Un estruendo de muchas aguas');
    expect(sections[2].content).toContain('Yo danzo en el río');
    expect(sections[3].content).toBe('Bm - G - D - A');
  });
});
