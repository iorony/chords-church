import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Font } from '@react-pdf/renderer';
import type { ExportableSong, ExportableSetlist } from './export-docx-service';
import { isChordLine } from '@/lib/chords/chord-parser';

// La fuente se obtiene en tiempo de ejecución desde el repositorio oficial de Adobe.
// No se incluyen archivos de fuente dentro del proyecto.
Font.register({
  family: 'Source Code Pro',
  fonts: [
    {
      src: 'https://raw.githubusercontent.com/adobe-fonts/source-code-pro/release/TTF/SourceCodePro-Regular.ttf',
      fontWeight: 400
    },
    {
      src: 'https://raw.githubusercontent.com/adobe-fonts/source-code-pro/release/TTF/SourceCodePro-Bold.ttf',
      fontWeight: 700
    }
  ]
});

export interface PdfLayoutOptions {
  paperSize: 'LETTER' | 'A4';
  orientation: 'portrait' | 'landscape';
  fontSize: number;
  columns: 1 | 2;
  showArtist: boolean;
  showKey: boolean;
  showChords: boolean;
  showLyrics: boolean;
  showNotes: boolean;
  showPageNumbers: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfLayoutOptions = {
  paperSize: 'LETTER',
  orientation: 'portrait',
  fontSize: 11,
  columns: 1,
  showArtist: true,
  showKey: true,
  showChords: true,
  showLyrics: true,
  showNotes: false,
  showPageNumbers: true
};

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Source Code Pro' },
  title: { fontSize: 16, marginBottom: 2, fontFamily: 'Source Code Pro', fontWeight: 700 },
  meta: { fontSize: 10, marginBottom: 10, color: '#555' },
  line: { fontFamily: 'Source Code Pro' },
  chordLine: { fontFamily: 'Source Code Pro', color: '#1565C0' },
  sectionLine: { fontFamily: 'Source Code Pro', fontWeight: 700 },
  pageNumber: { position: 'absolute', bottom: 20, right: 36, fontSize: 9, color: '#888' },
  notesTitle: { fontSize: 10, marginTop: 10, fontFamily: 'Source Code Pro', fontWeight: 700 },
  notes: { fontSize: 10 }
});

function lineKind(line: string): 'section' | 'chord' | 'lyric' | 'blank' {
  const trimmed = line.trim();
  if (!trimmed) return 'blank';
  if (/^\[[^\]]+\]$/.test(trimmed)) return 'section';
  if (isChordLine(line)) return 'chord';
  return 'lyric';
}

function visibleContentLines(content: string, opts: PdfLayoutOptions): string[] {
  return content.split('\n').filter((line) => {
    const kind = lineKind(line);
    if (kind === 'section' || kind === 'blank') return true;
    if (kind === 'chord') return opts.showChords;
    return opts.showLyrics;
  });
}

function SongPdfBlock({ song, options }: { song: ExportableSong; options: PdfLayoutOptions }) {
  const metaParts = [
    options.showArtist && song.artist ? `Artista: ${song.artist}` : null,
    options.showKey && song.displayKey ? `Tono: ${song.displayKey}` : null,
  ].filter(Boolean);

  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.title}>{song.title}</Text>
      {metaParts.length > 0 && <Text style={styles.meta}>{metaParts.join('   •   ')}</Text>}
      <View>
        {visibleContentLines(song.content, options).map((line, index) => {
          const kind = lineKind(line);
          return (
            <Text
              key={index}
              style={[
                styles.line,
                { fontSize: options.fontSize },
                kind === 'chord' ? styles.chordLine : {},
                kind === 'section' ? styles.sectionLine : {}
              ]}
            >
              {line || ' '}
            </Text>
          );
        })}
      </View>
      {options.showNotes && song.notes && (
        <>
          <Text style={styles.notesTitle}>Notas para músicos</Text>
          <Text style={styles.notes}>{song.notes}</Text>
        </>
      )}
    </View>
  );
}

function SongDocument({ song, options }: { song: ExportableSong; options: PdfLayoutOptions }) {
  return (
    <Document>
      <Page size={options.paperSize} orientation={options.orientation} style={styles.page}>
        <SongPdfBlock song={song} options={options} />
        {options.showPageNumbers && (
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        )}
      </Page>
    </Document>
  );
}

function SetlistDocument({ setlist, options }: { setlist: ExportableSetlist; options: PdfLayoutOptions }) {
  return (
    <Document>
      {setlist.includeCoverPage && (
        <Page size={options.paperSize} orientation={options.orientation} style={styles.page}>
          <Text style={{ fontSize: 24, marginTop: 200, textAlign: 'center', fontWeight: 700 }}>{setlist.name}</Text>
          {(setlist.eventDate || setlist.location) && (
            <Text style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
              {[setlist.eventDate, setlist.location].filter(Boolean).join(' • ')}
            </Text>
          )}
        </Page>
      )}
      <Page size={options.paperSize} orientation={options.orientation} style={styles.page}>
        {setlist.includeIndex && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Índice de canciones</Text>
            {setlist.songs.map((s, i) => (
              <Text key={i} style={{ fontSize: 10 }}>
                {i + 1}. {s.title} {s.artist ? `— ${s.artist}` : ''} {s.displayKey ? `(${s.displayKey})` : ''}
              </Text>
            ))}
          </View>
        )}
        {setlist.songs.map((song, i) => <SongPdfBlock key={i} song={song} options={options} />)}
        {options.showPageNumbers && (
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        )}
      </Page>
    </Document>
  );
}

export async function exportSongToPdf(song: ExportableSong, options: Partial<PdfLayoutOptions> = {}): Promise<Buffer> {
  return renderToBuffer(<SongDocument song={song} options={{ ...DEFAULT_PDF_OPTIONS, ...options }} />);
}

export async function exportSetlistToPdf(setlist: ExportableSetlist, options: Partial<PdfLayoutOptions> = {}): Promise<Buffer> {
  return renderToBuffer(<SetlistDocument setlist={setlist} options={{ ...DEFAULT_PDF_OPTIONS, ...options }} />);
}
