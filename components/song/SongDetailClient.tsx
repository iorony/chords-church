'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ChordChart from './ChordChart';
import KeyControl from './KeyControl';
import YouTubePreview from './YouTubePreview';

export interface SongDetailClientProps {
  songId: string;
  title: string;
  artistName?: string;
  originalKey: string;
  content: string;
  sourceUrl?: string | null;
  isFavorite: boolean;
  isLoggedIn: boolean;
  status: string;
  visibility: 'public' | 'private';
  canManageSong: boolean;
  canSetPrivate: boolean;
}

export default function SongDetailClient({
  songId,
  title,
  artistName,
  originalKey,
  content,
  sourceUrl,
  isFavorite: initialFavorite,
  isLoggedIn,
  status: initialStatus,
  visibility: initialVisibility,
  canManageSong,
  canSetPrivate
}: SongDetailClientProps) {
  const router = useRouter();
  const [displayContent, setDisplayContent] = useState(content);
  const [currentKey, setCurrentKey] = useState(originalKey);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [visibility, setVisibility] = useState<'public' | 'private'>(initialVisibility);
  const [publishing, setPublishing] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);

  async function toggleFavorite() {
    if (!isLoggedIn) return;
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    if (favorite) {
      await supabase.from('song_favorites').delete().eq('user_id', user.id).eq('song_id', songId);
    } else {
      await supabase.from('song_favorites').insert({ user_id: user.id, song_id: songId, preferred_key: currentKey });
    }
    setFavorite(!favorite);
  }

  async function updateVisibility(nextVisibility: 'public' | 'private') {
    if (!canManageSong || savingVisibility || nextVisibility === visibility) return;
    if (nextVisibility === 'private' && !canSetPrivate) return;

    const previous = visibility;
    setVisibility(nextVisibility);
    setSavingVisibility(true);

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase
        .from('songs')
        .update({ visibility: nextVisibility })
        .eq('id', songId);

      if (error) throw error;
      router.refresh();
    } catch (error: any) {
      setVisibility(previous);
      alert(`No se pudo cambiar la visibilidad: ${error?.message || 'error desconocido'}`);
    } finally {
      setSavingVisibility(false);
    }
  }

  async function publishSong() {
    if (!canManageSong || publishing) return;
    setPublishing(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase
        .from('songs')
        .update({
          status: 'published',
          published_at: new Date().toISOString()
        })
        .eq('id', songId);
      if (error) throw error;
      setStatus('published');
      router.refresh();
    } catch (error: any) {
      alert(`No se pudo publicar la canción: ${error?.message || 'error desconocido'}`);
    } finally {
      setPublishing(false);
    }
  }

  async function handleExport(type: 'pdf' | 'docx') {
    setExporting(type);
    try {
      const res = await fetch(`/api/export/${type}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'song', scopeId: songId })
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.${type}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-white/[0.02] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words">{title}</h1>
            {artistName && <p className="mt-1 text-gray-500">{artistName}</p>}
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[34rem] sm:grid-cols-4">
            {canManageSong && status !== 'published' && (
              <button
                onClick={publishSong}
                disabled={publishing}
                className="col-span-2 sm:col-span-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {publishing ? 'Publicando...' : 'Publicar canción'}
              </button>
            )}

            {canManageSong ? (
              <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-1 dark:border-gray-700">
                <label htmlFor="song-visibility" className="text-xs text-gray-500 whitespace-nowrap">
                  Visibilidad
                </label>
                <select
                  id="song-visibility"
                  value={visibility}
                  disabled={savingVisibility}
                  onChange={(event) => updateVisibility(event.target.value as 'public' | 'private')}
                  className="min-w-0 bg-transparent py-1 text-right text-sm font-medium outline-none disabled:opacity-50"
                  title={!canSetPrivate ? 'No puede hacerse privada porque otro usuario ya la utiliza en una lista propia.' : undefined}
                >
                  <option value="public">Pública</option>
                  <option value="private" disabled={!canSetPrivate}>Privada</option>
                </select>
                {savingVisibility && <span className="sr-only">Guardando visibilidad</span>}
              </div>
            ) : isLoggedIn && status !== 'published' ? (
              <div className="inline-flex min-h-11 items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
                <span className="text-xs text-gray-500">Visibilidad</span>
                <span className="font-medium">{visibility === 'public' ? 'Pública' : 'Privada'}</span>
              </div>
            ) : null}

            {isLoggedIn && (
              <button
                onClick={toggleFavorite}
                className={`inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-center text-sm ${favorite ? 'border-accent-gold bg-accent-gold/20' : 'border-gray-300 dark:border-gray-700'}`}
              >
                {favorite ? '★ En favoritos' : '☆ Agregar a favoritos'}
              </button>
            )}

            {isLoggedIn ? (
              <>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exporting !== null}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700"
                >
                  {exporting === 'pdf' ? 'Generando...' : 'PDF'}
                </button>
                <button
                  onClick={() => handleExport('docx')}
                  disabled={exporting !== null}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700"
                >
                  {exporting === 'docx' ? 'Generando...' : 'DOCX'}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-md border border-dashed border-gray-300 px-3 py-2 text-center text-sm text-gray-500 hover:text-primary sm:col-span-4 dark:border-gray-700"
              >
                Inicia sesión para guardar favoritos y exportar
              </Link>
            )}
          </div>
        </div>

        {canManageSong && !canSetPrivate && (
          <p className="mt-3 text-xs text-accent-gold text-right">
            Esta canción debe permanecer pública porque otro usuario ya la agregó a una lista propia.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white/40 p-3 dark:border-gray-800 dark:bg-white/[0.02]">
        <KeyControl
          originalKey={originalKey}
          originalContent={content}
          onChange={(transposed, key) => {
            setDisplayContent(transposed);
            setCurrentKey(key);
          }}
        />
      </section>

      <section className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white/40 p-5 dark:border-gray-800 dark:bg-white/[0.02]">
        {sourceUrl && (
          <div className="absolute right-4 top-4 hidden w-60 sm:block">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-gray-500">Video de referencia</span>
              <button type="button" onClick={() => setVideoExpanded(true)} className="font-medium text-primary hover:underline">Ampliar</button>
            </div>
            <YouTubePreview url={sourceUrl} title={`Video de referencia de ${title}`} />
          </div>
        )}
        <div className={sourceUrl ? 'sm:pr-64' : undefined}>
          <ChordChart content={displayContent} />
        </div>
      </section>

      {sourceUrl && (
        <section className="rounded-xl border border-gray-200 bg-white/40 p-4 dark:border-gray-800 dark:bg-white/[0.02] sm:hidden">
          <div className="mx-auto mb-3 flex max-w-4xl items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Video de referencia</h2>
            <div className="flex items-center gap-3 text-xs font-medium">
              <button type="button" onClick={() => setVideoExpanded((value) => !value)} className="text-primary hover:underline">
                {videoExpanded ? 'Vista compacta' : 'Ver más grande'}
              </button>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">YouTube ↗</a>
            </div>
          </div>
          <div className={`mx-auto w-full transition-[max-width] duration-300 ${videoExpanded ? 'max-w-4xl' : 'max-w-lg'}`}>
            <YouTubePreview url={sourceUrl} title={`Video de referencia de ${title}`} />
          </div>
        </section>
      )}

      {sourceUrl && videoExpanded && (
        <div className="fixed inset-0 z-50 hidden items-center justify-center bg-black/75 p-6 backdrop-blur-sm sm:flex" role="dialog" aria-modal="true" aria-label={`Video de referencia de ${title}`} onClick={() => setVideoExpanded(false)}>
          <div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between text-white">
              <h2 className="font-semibold">Video de referencia · {title}</h2>
              <button type="button" onClick={() => setVideoExpanded(false)} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10">Cerrar ✕</button>
            </div>
            <YouTubePreview url={sourceUrl} title={`Video de referencia ampliado de ${title}`} />
          </div>
        </div>
      )}
    </div>
  );
}
