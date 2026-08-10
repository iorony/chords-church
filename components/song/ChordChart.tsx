import { isChordLine, tokenizeChordLine } from '@/lib/chords/chord-parser';

export interface ChordChartProps {
  content: string;
  fontSizeClass?: string;
  showChords?: boolean;
  showLyrics?: boolean;
  containerClassName?: string;
}

/**
 * Divide una línea en segmentos alternando espacio en blanco / token,
 * preservando cada espacio exactamente (la fuente es monoespaciada con
 * white-space: pre, así que los espacios se respetan tal cual).
 */

/**
 * Renderiza una línea coloreando SOLO los tokens que realmente son
 * acordes (naranja) o etiquetas de sección inline como "[INTRO]" (azul),
 * dejando cualquier otra palabra, marcador de repetición ("x2") o
 * puntuación en el color de texto normal — nunca se colorea la línea
 * completa.
 */
function renderChordLineTokens(line: string, key: number) {
  const segments = tokenizeChordLine(line);
  return (
    <div key={key}>
      {segments.map((segment, i) => {
        const { value, kind } = segment;
        if (kind === 'whitespace') return <span key={i}>{value}</span>;
        const isCompactNoteRun = kind === 'neutral' && /^([A-G])\1{1,}$/.test(value);
        if (kind === 'chord' || isCompactNoteRun) {
          return (
            <span key={i} className="chord">
              {value}
            </span>
          );
        }
        if (kind === 'section') {
          return (
            <span key={i} className="text-primary dark:text-accent-teal font-semibold">
              {value}
            </span>
          );
        }
        return <span key={i}>{value}</span>;
      })}
    </div>
  );
}

function renderLine(line: string, key: number, showChords: boolean, showLyrics: boolean) {
  const trimmed = line.trim();

  // Línea que es ÚNICAMENTE un encabezado de sección, p.ej. "[CORO]"
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return (
      <span key={key} className="section-label">
        {trimmed}
      </span>
    );
  }

  const tokens = tokenizeChordLine(line);
  const chordCount = tokens.filter((token) => token.kind === 'chord').length;
  const hasMusicalSeparators = /[|\/\-]/.test(line);
  const isPureChordLine = isChordLine(line);
  const hasEmbeddedProgression = chordCount >= 2 || (chordCount >= 1 && hasMusicalSeparators);

  if (isPureChordLine) {
    if (!showChords) return null;
    return renderChordLineTokens(line || '\u00A0', key);
  }

  if (!showLyrics && trimmed !== '') return null;

  // Algunas indicaciones musicales mezclan texto y progresiones en la misma línea,
  // por ejemplo: "(SOLO DE GUITARRA: // Gmaj7 - G - Em7 - A - Bm7 //)".
  // En ese caso coloreamos solamente los acordes reconocidos sin perder ni
  // reacomodar los espacios originales.
  if (showChords && hasEmbeddedProgression) {
    return renderChordLineTokens(line || '\u00A0', key);
  }

  return <div key={key}>{line || '\u00A0'}</div>;
}

/**
 * Muestra el contenido de una canción (letra + acordes) preservando la
 * alineación exacta con fuente monoespaciada. Solo los tokens que son
 * acordes se resaltan con un color distintivo; las etiquetas de sección
 * (entre corchetes) se muestran en azul, e incluso si comparten línea
 * con acordes (p.ej. "[INTRO] Bm A x2") cada parte queda bien
 * identificada por separado.
 */
export default function ChordChart({ content, fontSizeClass = 'text-base', showChords = true, showLyrics = true, containerClassName = '' }: ChordChartProps) {
  const lines = content.split('\n');
  return (
    <div className={`song-content ${fontSizeClass} ${containerClassName}`.trim()}>
      {lines.map((line, i) => renderLine(line, i, showChords, showLyrics))}
    </div>
  );
}
