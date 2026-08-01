import { describe, expect, it } from 'vitest';
import {
  detectSectionLabel,
  isRepeatInstruction,
  normalizeRepeatInstruction
} from '../lib/chords/chord-parser';
import { buildSections, renderSections } from '../lib/chords/structure-parser';

describe('Section Parser v2', () => {
  it('reconoce encabezados compuestos', () => {
    expect(detectSectionLabel('INTRO PIANO')).toBe('INTRO');
    expect(detectSectionLabel('INTRO GUITARRA 2')).toBe('INTRO 2');
    expect(detectSectionLabel('SOLO - GUITARRA')).toBe('SOLO GUITARRA');
    expect(detectSectionLabel('ESTROFA FIN')).toBe('FINAL');
    expect(detectSectionLabel('PARTE IV')).toBe('PARTE IV');
  });

  it('no convierte indicaciones de repetición en secciones', () => {
    expect(isRepeatInstruction('-estrofa-coro-')).toBe(true);
    expect(isRepeatInstruction('volver al puente')).toBe(true);
    expect(detectSectionLabel('-estrofa-coro-')).toBeNull();
    expect(normalizeRepeatInstruction('-estrofa-coro-')).toBe('(REPETIR ESTROFA Y CORO)');
  });

  it('evita crear un intro falso antes de una indicación compuesta', () => {
    const content = `INTRO PIANO\nF --- | C --- |\n\nESTROFA\nF\nLa atmósfera cambiando está\n\nCORO\nF\nLlena este lugar\n\n-intro-\n-estrofa-coro-\n\nINSTRUMENTAL\nF --- | Am7 --- |\n\nSOLO - GUITARRA\nF - Dm7/11\n\nESTROFA FIN\nF\nTu Espíritu está aquí`;
    const rendered = renderSections(buildSections(content));

    expect(rendered).toContain('[INTRO]\nF --- | C --- |');
    expect(rendered).toContain('(REPETIR INTRO Y ESTROFA Y CORO)');
    expect(rendered).toContain('[SOLO GUITARRA]');
    expect(rendered).toContain('[FINAL]');
    expect(rendered).not.toContain('[INTRO 2]');
  });
});
