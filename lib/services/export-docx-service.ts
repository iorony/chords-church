import 'server-only';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
  AlignmentType
} from 'docx';
import { isChordLine } from '@/lib/chords/chord-parser';

export interface ExportableSong {
  title: string;
  artist?: string;
  displayKey?: string;
  capo?: number;
  content: string; // texto ya transpuesto/renderizado, con [SECCIONES] entre corchetes
  notes?: string;
}

const EXPORT_FONT = 'Source Code Pro';
const CHORD_BLUE = '1565C0';

/** Convierte el contenido en párrafos monoespaciados y resalta en azul las líneas de acordes. */
function contentToParagraphs(content: string): Paragraph[] {
  return content.split('\n').map((line) => {
    const trimmed = line.trim();
    const chordLine = trimmed.length > 0 && isChordLine(line);
    const sectionLine = /^\[[^\]]+\]$/.test(trimmed);

    return new Paragraph({
      children: [
        new TextRun({
          text: line || ' ',
          font: EXPORT_FONT,
          size: 20,
          color: chordLine ? CHORD_BLUE : undefined,
          bold: sectionLine
        })
      ],
      spacing: { after: 0 }
    });
  });
}

function songToBlocks(song: ExportableSong, includePageBreakAfter: boolean): Paragraph[] {
  const blocks: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: song.title, font: EXPORT_FONT, bold: true, size: 32 })],
      heading: HeadingLevel.HEADING_1
    }),
    new Paragraph({
      children: [
        new TextRun({
          font: EXPORT_FONT,
          text: [
            song.artist ? `Artista: ${song.artist}` : null,
            song.displayKey ? `Tono: ${song.displayKey}` : null,
          ]
            .filter(Boolean)
            .join('   •   '),
          italics: true,
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),
    ...contentToParagraphs(song.content)
  ];

  if (song.notes) {
    blocks.push(
      new Paragraph({ text: 'Notas para músicos', heading: HeadingLevel.HEADING_3, spacing: { before: 200 } }),
      new Paragraph({ text: song.notes })
    );
  }

  if (includePageBreakAfter) {
    blocks.push(new Paragraph({ children: [new PageBreak()] }));
  }

  return blocks;
}

export async function exportSongToDocx(song: ExportableSong): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: EXPORT_FONT } } } },
    sections: [{ children: songToBlocks(song, false) }]
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

export interface ExportableSetlist {
  name: string;
  eventDate?: string;
  location?: string;
  songs: ExportableSong[];
  includeCoverPage?: boolean;
  includeIndex?: boolean;
}

export async function exportSetlistToDocx(setlist: ExportableSetlist): Promise<Buffer> {
  const children: Paragraph[] = [];

  if (setlist.includeCoverPage) {
    children.push(
      new Paragraph({
        text: setlist.name,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { before: 2000, after: 200 }
      })
    );
    if (setlist.eventDate || setlist.location) {
      children.push(
        new Paragraph({
          children: [new TextRun({
            text: [setlist.eventDate, setlist.location].filter(Boolean).join(' • '),
            font: EXPORT_FONT
          })],
          alignment: AlignmentType.CENTER
        })
      );
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  if (setlist.includeIndex) {
    children.push(new Paragraph({ text: 'Índice de canciones', heading: HeadingLevel.HEADING_2 }));
    setlist.songs.forEach((s, i) => {
      children.push(new Paragraph({ text: `${i + 1}. ${s.title}${s.displayKey ? ` (${s.displayKey})` : ''}` }));
    });
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  setlist.songs.forEach((song, index) => {
    const isLast = index === setlist.songs.length - 1;
    children.push(...songToBlocks(song, !isLast));
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: EXPORT_FONT } } } },
    sections: [{ children }]
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
