import { describe, expect, it } from 'vitest';
import { toProperName, toProperTitle } from '@/lib/services/text-utils';

describe('normalización editorial', () => {
  it('corrige conectores escritos en mayúsculas dentro del título', () => {
    expect(toProperTitle('Fiesta EN EL Desierto')).toBe('Fiesta en el Desierto');
  });

  it('corrige títulos completamente en mayúsculas', () => {
    expect(toProperTitle('DANZO EN EL RÍO')).toBe('Danzo en el Río');
  });

  it('mantiene siglas reales en artistas y conectores en minúscula', () => {
    expect(toProperName('BJ PUTNAM')).toBe('BJ Putnam');
    expect(toProperName('MINISTERIO CASA DE DIOS')).toBe('Ministerio Casa de Dios');
  });
});
