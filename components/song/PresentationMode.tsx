'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { transposeSongContent, semitoneDifference, keyToIndex, ALL_KEYS_GENERAL } from '@/lib/chords/transposition';
import { buildSections } from '@/lib/chords/structure-parser';
import type { SongSection } from '@/lib/chords/types';
import ChordChart from './ChordChart';

export interface PresentationSong {
  title: string;
  artist?: string;
  baseKey: string;
  selectedKey: string;
  capo: number;
  content: string;
}

export interface PresentationModeProps {
  songs: PresentationSong[];
}

type SectionPage = SongSection[][];

const MIN_FONT_REM = 0.42;
const MAX_FONT_REM = 4;

function visualLineLength(line: string): number {
  // Las tabulaciones ocupan varias columnas en una fuente monoespaciada.
  return line.replace(/\t/g, '    ').length;
}

function longestSectionLine(sections: SongSection[]): number {
  return sections.reduce((largest, section) => {
    const labelLength = visualLineLength(`[${section.label}]`);
    const contentLength = section.content
      .split('\n')
      .reduce((max, line) => Math.max(max, visualLineLength(line)), 0);
    return Math.max(largest, labelLength, contentLength);
  }, 1);
}

function estimateSectionLines(section: SongSection): number {
  const lines = section.content.split('\n');
  const contentLines = Math.max(1, lines.length);
  const blankLines = lines.filter((line) => line.trim() === '').length;

  // El navegador añade altura real por el encabezado, el gap entre secciones,
  // líneas vacías y redondeos de píxeles. Antes se calculaba demasiado justo y
  // la última sección podía quedar cortada. Este margen conservador hace que
  // la sección completa pase a la siguiente columna antes de desbordarse.
  return contentLines + 3.4 + blankLines * 0.35;
}

function maxColumnCount(width: number): number {
  if (width < 700) return 1;
  if (width < 1050) return 2;
  if (width < 1600) return 3;
  return 4;
}

function columnMetrics(viewportWidth: number, columns: number) {
  const horizontalPadding = viewportWidth < 700 ? 24 : 48;
  const gap = viewportWidth < 700 ? 12 : 20;
  const columnWidth = Math.max(
    150,
    (viewportWidth - horizontalPadding - gap * (columns - 1)) / columns
  );
  return { gap, columnWidth };
}

function widthFittedFontRem(
  sections: SongSection[],
  viewportWidth: number,
  columns: number,
  requestedFontRem: number
): number {
  if (sections.length === 0) return requestedFontRem;

  const { columnWidth } = columnMetrics(viewportWidth, columns);
  const longestLine = longestSectionLine(sections);
  const safeColumnWidth = Math.max(110, columnWidth - 10);

  // Source Code Pro/monoespaciada ocupa aproximadamente 0.61em por carácter.
  const widthFitRem = safeColumnWidth / (Math.max(longestLine, 1) * 0.61 * 16);
  return Math.min(requestedFontRem, Math.max(MIN_FONT_REM, widthFitRem));
}

function packSectionsInColumns(
  sections: SongSection[],
  columns: number,
  capacity: number
): { fits: boolean; page: SectionPage } {
  const page: SectionPage = Array.from({ length: columns }, () => []);
  let columnIndex = 0;
  let used = 0;

  for (const section of sections) {
    const sectionSize = estimateSectionLines(section);

    if (sectionSize > capacity) return { fits: false, page };

    if (page[columnIndex].length > 0 && used + sectionSize > capacity) {
      columnIndex += 1;
      used = 0;
    }

    if (columnIndex >= columns) return { fits: false, page };

    page[columnIndex].push(section);
    used += sectionSize;
  }

  return { fits: true, page };
}

function buildMultiPageLayout(
  sections: SongSection[],
  columns: number,
  capacity: number
): SectionPage[] {
  const pages: SectionPage[] = [];
  let page: SectionPage = Array.from({ length: columns }, () => []);
  let columnIndex = 0;
  let used = 0;

  const flushPage = () => {
    if (page.some((column) => column.length > 0)) pages.push(page);
    page = Array.from({ length: columns }, () => []);
    columnIndex = 0;
    used = 0;
  };

  for (const section of sections) {
    const sectionSize = estimateSectionLines(section);

    if (page[columnIndex].length > 0 && used + sectionSize > capacity) {
      columnIndex += 1;
      used = 0;
    }

    if (columnIndex >= columns) flushPage();

    page[columnIndex].push(section);
    used += sectionSize;
  }

  flushPage();
  return pages;
}

function buildSectionPages(
  sections: SongSection[],
  viewportWidth: number,
  viewportHeight: number,
  requestedFontRem: number,
  preserveRequestedFont = false
): { pages: SectionPage[]; fontRem: number; columns: number } {
  const maxColumns = maxColumnCount(viewportWidth);
  const reservedHeight = viewportWidth < 700 ? 132 : 142;
  // Dejamos un margen inferior de seguridad porque las alturas estimadas en
  // rem pueden redondearse distinto al render real de ChordChart.
  const availableHeight = Math.max(180, (viewportHeight - reservedHeight) * 0.91);
  const requested = Math.min(MAX_FONT_REM, Math.max(MIN_FONT_REM, requestedFontRem));

  if (sections.length === 0) {
    return { pages: [[[]]], fontRem: requested, columns: 1 };
  }

  // Cuando el usuario cambia manualmente el tamaño, respetamos ese tamaño.
  // Primero intentamos acomodar la canción en una página aumentando columnas;
  // si ya no cabe, conservamos el tamaño solicitado y creamos páginas.
  if (preserveRequestedFont) {
    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const fittedFont = widthFittedFontRem(sections, viewportWidth, columns, requested);
      const fontPx = fittedFont * 16;
      const capacity = availableHeight / (fontPx * (viewportWidth < 700 ? 1.34 : 1.45));
      const packed = packSectionsInColumns(sections, columns, capacity);

      if (packed.fits) {
        return { pages: [packed.page], fontRem: fittedFont, columns };
      }
    }

    const columns = maxColumns;
    const fontRem = widthFittedFontRem(sections, viewportWidth, columns, requested);
    const fontPx = fontRem * 16;
    const capacity = availableHeight / (fontPx * (viewportWidth < 700 ? 1.34 : 1.45));
    const pages = buildMultiPageLayout(sections, columns, capacity);

    return {
      pages: pages.length ? pages : [Array.from({ length: columns }, () => [])],
      fontRem,
      columns
    };
  }

  // Prioridad de diseño:
  // 1) usar una sola columna si toda la canción cabe;
  // 2) agregar únicamente las columnas necesarias;
  // 3) reducir el texto gradualmente solo cuando ni las columnas bastan;
  // 4) crear páginas adicionales únicamente como último recurso.
  for (let fontRem = requested; fontRem >= MIN_FONT_REM; fontRem = Number((fontRem - 0.04).toFixed(2))) {
    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const fittedFont = widthFittedFontRem(sections, viewportWidth, columns, fontRem);

      // Si el ancho obliga a reducir más de un paso, dejamos que la siguiente
      // iteración evalúe ese tamaño de manera uniforme para todos los diseños.
      if (fittedFont < fontRem - 0.039) continue;

      const fontPx = fittedFont * 16;
      const capacity = availableHeight / (fontPx * (viewportWidth < 700 ? 1.34 : 1.45));
      const packed = packSectionsInColumns(sections, columns, capacity);

      if (packed.fits) {
        return {
          pages: [packed.page],
          fontRem: fittedFont,
          columns
        };
      }
    }
  }

  // Último recurso para canciones excepcionalmente largas: usamos el máximo
  // número de columnas, el tamaño mínimo y paginamos sin cortar secciones.
  const columns = maxColumns;
  const fontRem = widthFittedFontRem(
    sections,
    viewportWidth,
    columns,
    MIN_FONT_REM
  );
  const fontPx = fontRem * 16;
  const capacity = availableHeight / (fontPx * (viewportWidth < 700 ? 1.34 : 1.45));
  const pages = buildMultiPageLayout(sections, columns, capacity);

  return {
    pages: pages.length ? pages : [Array.from({ length: columns }, () => [])],
    fontRem,
    columns
  };
}

export default function PresentationMode({ songs }: PresentationModeProps) {
  const router = useRouter();
  const [songIndex, setSongIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [fontSize, setFontSize] = useState(1.5);
  const [fontSizeManuallyAdjusted, setFontSizeManuallyAdjusted] = useState(false);
  const [dark, setDark] = useState(true);
  const [showKeyPicker, setShowKeyPicker] = useState(false);
  const [semitoneOverride, setSemitoneOverride] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [viewport, setViewport] = useState({ width: 1280, height: 720 });
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openPreviousSongAtLastPage = useRef(false);
  const contentScrollRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Puede ocurrir que la presentación se abra antes de que la lista termine
  // de cargarse, o que alguna canción antigua no tenga baseKey/selectedKey.
  // Normalizamos los datos para evitar errores de runtime.
  const rawSong = songs[songIndex] ?? songs[0];
  const song: PresentationSong = {
    title: rawSong?.title?.trim() || 'Canción sin título',
    artist: rawSong?.artist?.trim() || 'Artista desconocido',
    baseKey: rawSong?.baseKey?.trim() || 'C',
    selectedKey: rawSong?.selectedKey?.trim() || rawSong?.baseKey?.trim() || 'C',
    capo: Number.isFinite(rawSong?.capo) ? rawSong.capo : 0,
    content: rawSong?.content || ''
  };
  const hasSongs = songs.length > 0;
  const isMinorKey = /m$/i.test(song.baseKey);
  const semitones = semitoneOverride || semitoneDifference(song.baseKey, song.selectedKey);
  const transposedContent = transposeSongContent(song.content, { semitones });
  const currentKey =
    ALL_KEYS_GENERAL[((keyToIndex(song.baseKey) + semitones) % 12 + 12) % 12] + (isMinorKey ? 'm' : '');

  const sections = useMemo(() => buildSections(transposedContent), [transposedContent]);
  const isMobile = viewport.width < 700;
  const layout = useMemo(
    () => buildSectionPages(sections, viewport.width, viewport.height, fontSize, fontSizeManuallyAdjusted),
    [sections, viewport, fontSize, fontSizeManuallyAdjusted]
  );

  // En móvil cada canción se presenta como un documento continuo de una sola
  // página. El usuario recorre toda la letra verticalmente; no se divide en
  // columnas ni páginas internas. Cuando el tamaño fue ajustado manualmente se
  // respeta y, si una línea excede el ancho, queda disponible el scroll
  // horizontal en lugar de recortarla.
  const mobileFontRem = useMemo(() => {
    if (!isMobile) return layout.fontRem;
    if (fontSizeManuallyAdjusted) {
      return Math.min(MAX_FONT_REM, Math.max(MIN_FONT_REM, fontSize));
    }
    return widthFittedFontRem(sections, viewport.width, 1, fontSize);
  }, [isMobile, layout.fontRem, fontSizeManuallyAdjusted, fontSize, sections, viewport.width]);

  const currentPage = layout.pages[Math.min(pageIndex, layout.pages.length - 1)] ?? Array.from({ length: layout.columns }, () => []);

  // No renderizamos columnas vacías al final de la página. El algoritmo puede
  // reservar, por ejemplo, tres columnas para asegurar que toda la canción
  // quepa, aunque finalmente solo utilice dos. Mostrar la tercera dejaba un
  // espacio visual innecesario y hacía que las columnas con contenido fueran
  // más estrechas. Al recortar únicamente las columnas vacías finales, las
  // secciones conservan su orden y el contenido aprovecha todo el ancho.
  const visibleColumns = useMemo(() => {
    const trimmed = currentPage.slice();
    while (trimmed.length > 1 && trimmed[trimmed.length - 1].length === 0) {
      trimmed.pop();
    }
    return trimmed.length ? trimmed : [[]];
  }, [currentPage]);

  const nextSong = useCallback(() => {
    setSongIndex((i) => Math.min(i + 1, songs.length - 1));
    setPageIndex(0);
  }, [songs.length]);

  const prevSong = useCallback(() => {
    setSongIndex((i) => Math.max(i - 1, 0));
    setPageIndex(0);
  }, []);

  const nextPage = useCallback(() => {
    if (isMobile) {
      if (songIndex < songs.length - 1) {
        setPageIndex(0);
        setSongIndex(songIndex + 1);
      }
      return;
    }
    // No hacemos setSongIndex dentro del actualizador de setPageIndex.
    // React puede ejecutar los actualizadores funcionales más de una vez en
    // desarrollo (Strict Mode), lo que provocaba saltos de dos canciones y que
    // solo se mostraran las posiciones impares.
    if (pageIndex < layout.pages.length - 1) {
      setPageIndex(pageIndex + 1);
      return;
    }

    if (songIndex < songs.length - 1) {
      setPageIndex(0);
      setSongIndex(songIndex + 1);
    }
  }, [isMobile, pageIndex, layout.pages.length, songIndex, songs.length]);

  const prevPage = useCallback(() => {
    if (isMobile) {
      if (songIndex > 0) {
        setPageIndex(0);
        setSongIndex(songIndex - 1);
      }
      return;
    }
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
      return;
    }

    if (songIndex > 0) {
      openPreviousSongAtLastPage.current = true;
      setPageIndex(0);
      setSongIndex(songIndex - 1);
    }
  }, [isMobile, pageIndex, songIndex]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    setSemitoneOverride(0);
    if (!openPreviousSongAtLastPage.current) setPageIndex(0);
  }, [songIndex]);

  // En móvil, cada canción es un documento vertical independiente. Al cambiar
  // de canción regresamos inmediatamente al inicio para que el usuario vea el
  // título y la primera sección, aunque la canción anterior se hubiera dejado
  // desplazada hacia abajo.
  useEffect(() => {
    if (!isMobile) return;

    const scrollContainer = contentScrollRef.current;
    if (!scrollContainer) return;

    const frame = window.requestAnimationFrame(() => {
      scrollContainer.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [songIndex, isMobile]);

  useEffect(() => {
    if (openPreviousSongAtLastPage.current) {
      openPreviousSongAtLastPage.current = false;
      setPageIndex(Math.max(0, layout.pages.length - 1));
      return;
    }
    if (pageIndex >= layout.pages.length) setPageIndex(Math.max(0, layout.pages.length - 1));
  }, [layout.pages.length, pageIndex, songIndex]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          nextPage();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          prevPage();
          break;
        case '+':
        case '=':
          setFontSizeManuallyAdjusted(true);
          setFontSize((f) => Math.min(f + 0.15, MAX_FONT_REM));
          break;
        case '-':
          setFontSizeManuallyAdjusted(true);
          setFontSize((f) => Math.max(f - 0.15, MIN_FONT_REM));
          break;
        case 'd':
        case 'D':
          setDark((d) => !d);
          break;
        case 't':
        case 'T':
          setShowKeyPicker((v) => !v);
          break;
        case 'f':
        case 'F':
          document.documentElement.requestFullscreen?.().catch(() => {});
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          } else {
            router.back();
          }
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [nextPage, prevPage, nextSong, prevSong, router]);


  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    resetControlsTimer();
    if (!isMobile || event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
  }, [isMobile]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile || !touchStartRef.current || event.changedTouches.length !== 1) {
      touchStartRef.current = null;
      return;
    }

    const touch = event.changedTouches[0];
    const start = touchStartRef.current;
    touchStartRef.current = null;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;

    // Solo considera un gesto horizontal intencional. El scroll vertical normal
    // de la canción no cambia de canción.
    const isHorizontalSwipe =
      Math.abs(deltaX) >= 60 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.25 &&
      elapsed <= 900;

    if (!isHorizontalSwipe) return;

    if (deltaX < 0) {
      nextPage();
    } else {
      prevPage();
    }
  }, [isMobile, nextPage, prevPage]);

  function resetControlsTimer() {
    setControlsVisible(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setControlsVisible(false), 4000);
  }

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden ${dark ? 'bg-black text-white' : 'bg-white text-black'}`}
      style={{ height: '100dvh' }}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null; }}
    >
      <div
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm transition-opacity ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${dark ? 'bg-black/90' : 'bg-white/95'} border-b ${dark ? 'border-gray-800' : 'border-gray-200'}`}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button onClick={() => router.back()} className="shrink-0 opacity-70 hover:opacity-100">
            ✕ Salir
          </button>
          <span className="truncate opacity-70">
            {hasSongs ? songIndex + 1 : 0}/{songs.length}: {song.title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button onClick={() => setShowKeyPicker((v) => !v)} className="opacity-70 hover:opacity-100">
            {currentKey} <span className="hidden sm:inline">(T)</span>
          </button>
          <button onClick={() => { setFontSizeManuallyAdjusted(true); setFontSize((f) => Math.max(f - 0.15, MIN_FONT_REM)); }} aria-label="Reducir texto">
            A−
          </button>
          <button onClick={() => { setFontSizeManuallyAdjusted(true); setFontSize((f) => Math.min(f + 0.15, MAX_FONT_REM)); }} aria-label="Aumentar texto">
            A+
          </button>
          <button onClick={() => setDark((d) => !d)} className="opacity-70 hover:opacity-100">
            {dark ? '☀' : '🌙'}
          </button>
        </div>
      </div>

      {showKeyPicker && (
        <div className="absolute top-12 right-3 sm:right-4 z-30 max-w-[calc(100vw-1.5rem)] bg-gray-900 text-white rounded-lg p-3 grid grid-cols-4 gap-2 text-sm shadow-xl">
          {ALL_KEYS_GENERAL.map((k) => (
            <button
              key={k}
              onClick={() => {
                setSemitoneOverride(semitoneDifference(song.baseKey, k));
                setShowKeyPicker(false);
              }}
              className={`px-2 py-1 rounded ${k + (isMinorKey ? 'm' : '') === currentKey ? 'bg-primary' : 'hover:bg-gray-700'}`}
            >
              {k}
              {isMinorKey ? 'm' : ''}
            </button>
          ))}
        </div>
      )}

      <main
        ref={contentScrollRef}
        className={`absolute inset-x-0 top-11 bottom-14 sm:top-12 sm:bottom-14 px-3 sm:px-6 py-2 sm:py-3 ${
          isMobile ? 'overflow-y-auto overflow-x-hidden overscroll-contain' : 'overflow-hidden'
        }`}
      >
        {!hasSongs ? (
          <div className="flex h-full items-center justify-center text-center opacity-70">
            No hay canciones disponibles para presentar.
          </div>
        ) : isMobile ? (
          <article className="mx-auto w-full max-w-full pb-8">
            <header className="relative mb-4 px-10 text-center">
              <h1
                className="font-bold opacity-90"
                style={{ fontSize: `${Math.max(1.05, mobileFontRem * 1.12)}rem` }}
              >
                {song.title}
              </h1>
              <p className="text-xs opacity-65">
                {song.artist} <span className="mx-1.5 opacity-60">•</span> Tono: {currentKey}
              </p>
              <span className="absolute right-0 top-1 text-[10px] opacity-55">Página 1/1</span>
            </header>

            <div
              className="flex min-w-0 flex-col gap-[0.8em]"
              style={{ fontSize: `${mobileFontRem}rem`, lineHeight: 1.42 }}
            >
              {sections.map((section) => (
                <section key={`${section.order}-${section.label}`} className="min-w-0">
                  <div className="mb-[0.22em] font-mono font-semibold text-primary dark:text-accent-teal">
                    [{section.label}]
                  </div>
                  <ChordChart
                    content={section.content}
                    fontSizeClass=""
                    containerClassName="presentation-song-content presentation-song-content-mobile"
                  />
                </section>
              ))}
            </div>
          </article>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="relative mb-1.5 shrink-0 px-12 text-center sm:px-20">
              <h1
                className="truncate font-bold opacity-90"
                style={{ fontSize: `${Math.max(1, layout.fontRem * 1.12)}rem` }}
              >
                {song.title}
              </h1>
              <p className="truncate text-xs sm:text-sm opacity-65">
                {song.artist} <span className="mx-1.5 opacity-60">•</span> Tono: {currentKey}
              </p>
              <span className="absolute right-0 top-1 text-xs opacity-55">
                Página {pageIndex + 1}/{layout.pages.length}
              </span>
            </div>

            <div
              className="grid min-h-0 flex-1 gap-3 sm:gap-5 overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))` }}
            >
              {visibleColumns.map((column, columnNumber) => (
                <div
                  key={columnNumber}
                  className={`min-w-0 overflow-hidden ${columnNumber > 0 ? `border-l pl-3 sm:pl-5 ${dark ? 'border-gray-800' : 'border-gray-200'}` : ''}`}
                >
                  <div className="flex h-full min-h-0 flex-col justify-start gap-[0.55em] overflow-hidden" style={{ fontSize: `${layout.fontRem}rem`, lineHeight: 1.45 }}>
                    {column.map((section) => (
                      <section key={`${section.order}-${section.label}`} className="shrink-0 break-inside-avoid overflow-hidden">
                        <div className="mb-[0.18em] font-mono font-semibold text-primary dark:text-accent-teal">
                          [{section.label}]
                        </div>
                        <ChordChart content={section.content} fontSizeClass="" containerClassName="presentation-song-content" />
                      </section>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-3 px-3 sm:px-5 py-2 text-xs sm:text-sm transition-opacity ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${dark ? 'bg-black/90' : 'bg-white/95'} border-t ${dark ? 'border-gray-800' : 'border-gray-200'}`}
      >
        <button
          onClick={prevPage}
          disabled={!hasSongs || (songIndex === 0 && pageIndex === 0)}
          className="rounded px-2 py-1 opacity-80 hover:opacity-100 disabled:opacity-30"
        >
          ← Anterior
        </button>
        <span className="hidden min-w-0 truncate opacity-50 sm:block">
          ← → página · ↑ ↓ canción · +/− tamaño · T tono · F pantalla completa
        </span>
        <button
          onClick={nextPage}
          disabled={!hasSongs || (songIndex === songs.length - 1 && pageIndex === layout.pages.length - 1)}
          className="rounded px-2 py-1 opacity-80 hover:opacity-100 disabled:opacity-30"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
