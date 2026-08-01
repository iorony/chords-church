'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type CatalogSong = {
  id: string;
  title: string;
  slug: string;
  artist: string | null;
  detected_key: string | null;
  original_key: string | null;
  status: string;
  is_favorite: boolean;
};

type SearchSong = {
  id: string;
  title: string;
  slug: string;
  artist: string | null;
  detected_key: string | null;
  original_key: string | null;
  visibility: 'public' | 'private';
  is_owner: boolean;
  shared_list_access: boolean;
  can_open_directly: boolean;
};

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesQuery(song: CatalogSong, query: string) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchable = normalizeSearchText(`${song.title} ${song.artist ?? ''}`);
  return terms.every((term) => searchable.includes(term));
}

export default function SongCatalogClient({ initialSongs }: { initialSongs: CatalogSong[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [remoteSongs, setRemoteSongs] = useState<SearchSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const localMatches = useMemo(
    () => initialSongs.filter((song) => matchesQuery(song, query)),
    [initialSongs, query]
  );

  const normalizedQuery = normalizeSearchText(query);
  const shouldSearchRemotely = normalizedQuery.length >= 2 && localMatches.length === 0;

  useEffect(() => {
    if (!shouldSearchRemotely) {
      requestId.current += 1;
      setRemoteSongs([]);
      setError(null);
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/songs/search?q=${encodeURIComponent(query.trim())}`, {
          cache: 'no-store'
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo realizar la búsqueda.');

        if (currentRequest === requestId.current) {
          setRemoteSongs(data.songs ?? []);
        }
      } catch (searchError) {
        if (currentRequest === requestId.current) {
          setRemoteSongs([]);
          setError(searchError instanceof Error ? searchError.message : 'No se pudo realizar la búsqueda.');
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, shouldSearchRemotely]);

  async function openSong(song: SearchSong) {
    setOpeningId(song.id);
    setError(null);

    try {
      if (!song.can_open_directly && song.visibility === 'private') {
        const response = await fetch('/api/songs/duplicates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: song.title,
            artist: song.artist || 'Artista desconocido',
            content: '',
            promote: true
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo habilitar la canción existente.');
        const resolved = data.duplicates?.[0];
        router.push(`/canciones/${resolved?.slug || song.slug}`);
      } else {
        router.push(`/canciones/${song.slug}`);
      }
      router.refresh();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'No se pudo abrir la canción.');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="w-full max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por canción o artista..."
          className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
          aria-label="Buscar canciones"
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-gray-500">
          Primero se filtran las canciones visibles. Si no existe una coincidencia, se buscan canciones privadas existentes.
        </p>
      </div>

      {localMatches.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {localMatches.map((song) => (
            <Link
              key={song.id}
              href={`/canciones/${song.slug}`}
              className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-primary dark:border-gray-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium">{song.title}</div>
                {song.is_favorite && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    title="Canción favorita"
                    aria-label="Canción favorita"
                  >
                    <span aria-hidden="true">★</span> Favorita
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500">{song.artist || 'Artista desconocido'}</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-accent-teal">
                  Tono {song.detected_key || song.original_key || '—'}
                </span>
                {song.status !== 'published' && <span className="text-xs text-gray-400">{song.status}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {shouldSearchRemotely && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="border-b border-gray-200 px-4 py-3 text-sm font-medium dark:border-gray-800">
            Buscar canción existente
          </div>

          {loading && <div className="p-4 text-sm text-gray-500">Buscando canciones...</div>}
          {error && <div className="p-4 text-sm text-red-600">{error}</div>}

          {!loading && !error && remoteSongs.length === 0 && (
            <div className="p-4 text-sm text-gray-500">
              No se encontró una canción existente con ese título o artista.
            </div>
          )}

          {!loading && !error && remoteSongs.map((song) => (
            <div
              key={song.id}
              className="flex items-center justify-between gap-4 border-b border-gray-100 p-3 last:border-b-0 dark:border-gray-800"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{song.title}</div>
                <div className="truncate text-xs text-gray-500">
                  {song.artist || 'Artista desconocido'} · Tono {song.detected_key || song.original_key || '—'}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${song.visibility === 'private' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                    {song.visibility === 'private' ? 'Privada' : 'Pública'}
                  </span>
                  {song.shared_list_access && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      Lista compartida
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openSong(song)}
                disabled={openingId === song.id}
                className="shrink-0 rounded-md border border-primary px-3 py-1.5 text-sm text-primary disabled:opacity-50"
              >
                {openingId === song.id
                  ? 'Abriendo...'
                  : !song.can_open_directly && song.visibility === 'private'
                    ? 'Usar existente'
                    : 'Abrir'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
