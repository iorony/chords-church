import { describe, expect, it } from 'vitest';
import { detectSectionLabel } from '../lib/chords/chord-parser';
import { buildSections } from '../lib/chords/structure-parser';

describe('encabezados PARTE e intro/final en texto plano', () => {
  it('reconoce y conserva PARTE con numeración romana o arábiga', () => {
    expect(detectSectionLabel('PARTE I')).toBe('PARTE I');
    expect(detectSectionLabel('Parte 2:')).toBe('PARTE 2');
    expect(detectSectionLabel('-- PARTE IV --')).toBe('PARTE IV');
  });

  it('normaliza variantes musicales comunes', () => {
    expect(detectSectionLabel('INTRODUCCIÓN')).toBe('INTRO');
    expect(detectSectionLabel('SOLO DE GUITARRA')).toBe('SOLO GUITARRA');
    expect(detectSectionLabel('CIERRE')).toBe('FINAL');
  });

  it('estructura la canción sin convertir PARTE en ESTROFA', () => {
    const sections = buildSections(`INTRO\nG Bm A\n\nPARTE I\nD A Bm G\nBendeciré tu nombre\n\nPARTE II\nG D A Bm\nExaltaré tu nombre\n\nFINAL\nG Bm A\nEres mi Dios`);

    expect(sections.map((section) => section.label)).toEqual([
      'INTRO',
      'PARTE I',
      'PARTE II',
      'FINAL'
    ]);
    expect(sections[1].type).toBe('UNKNOWN');
    expect(sections[2].type).toBe('UNKNOWN');
  });
});
