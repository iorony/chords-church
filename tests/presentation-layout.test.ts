import { describe, expect, it } from 'vitest';
import { buildSectionPages } from '../components/song/PresentationMode';
import type { SongSection } from '../lib/chords/types';

const sections: SongSection[] = [
  {
    type: 'VERSE', label: 'ESTROFA', order: 1,
    content: 'Bm\nEn Santiago uno, verso dos\nestá escrito que tenga gozo\nBm\nCuando pase por diversas pruebas\nPorque de allí saldré victorioso'
  },
  {
    type: 'PRECHORUS', label: 'PRE-CORO', order: 2,
    content: 'G                    A\nMi lamento cambiaste por danza\nF#                 Bm#\nYa no hay tristeza, solo alabanza'
  },
  {
    type: 'CHORUS', label: 'CORO', order: 3,
    content: 'G                 A              F#7\nYo Danzo, danzo, danzo, danzo, danzo, danzo\nBm\nEn el proceso\nG                 A              F#7\nY Grito, grito, grito, grito, grito, grito\nBm\nNo moriré'
  },
  {
    type: 'INTERLUDE', label: 'INTERLUDIO', order: 4,
    content: 'G A F#7 F#m'
  },
  {
    type: 'BRIDGE', label: 'PUENTE', order: 5,
    content: 'Bm\nAunque venga la enfermedad\nMientras viva te alabaré\nBm\nAunque mis labios quieran callar\nMientras viva te alabaré'
  }
];

describe('layout de presentación en escritorio', () => {
  it('da más ancho a las secciones largas para conservar el tamaño elegido', () => {
    const layout = buildSectionPages(sections, 1920, 1080, 1.5);

    expect(layout.fontRem).toBe(1.5);
    expect(layout.pages[0].filter((column) => column.length > 0)).toHaveLength(2);
    expect(layout.columnWeights[0]).not.toBe(layout.columnWeights[1]);
  });
});
