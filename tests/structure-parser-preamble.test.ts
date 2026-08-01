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
