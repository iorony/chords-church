import { describe, expect, it } from 'vitest';
import { parseSongBlocks, rebuildSectionsFromBlocks } from '../lib/chords/block-parser';

describe('bloques con intro explícito y primera estrofa implícita', () => {
  it('separa la letra posterior al intro antes del coro', () => {
    const content = `Intro: G B F# E E G C B (Solo notas)

G
Te amo Dios

C                 G
Tu bondad nunca me falla,
D/F# Em            C   D
Mi existir en tus manos está

Coro
C                  G C
En mi vida has sido bueno,

Verso 2
G                  C
Yo amo tu voz, me has guiado por el fuego`;

    const blocks = parseSongBlocks(content);
    const sections = rebuildSectionsFromBlocks(blocks, new Map());

    expect(sections.map((section) => section.label)).toEqual(['INTRO', 'ESTROFA', 'CORO', 'ESTROFA 2']);
    expect(sections[0].content).toContain('Solo notas');
    expect(sections[0].content).not.toContain('Te amo Dios');
    expect(sections[1].content).toContain('Te amo Dios');
    expect(sections[1].content).toContain('Mi existir en tus manos está');
  });
});
