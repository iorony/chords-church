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

type SearchSuggestion = {
  kind: 'song' | 'artist';
  value: string;
  label: string;
  detail?: string;
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionBoxRef = useRef<HTMLDivElement | null>(null);
  const requestId = useRef(0);

  const localMatches = useMemo(
    () => initialSongs.filter((song) => matchesQuery(song, query)),
    [initialSongs, query]
  );

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const normalized = normalizeSearchText(query);
    if (!normalized) return [];

    const songSuggestions = initialSongs
      .filter((song) => normalizeSearchText(song.title).includes(normalized))
      .slice(0, 5)
      .map((song) => ({
        kind: 'song' as const,
        value: song.title,
        label: song.title,
        detail: song.artist || undefined
      }));

    const seenArtists = new Set<string>();
    const artistSuggestions = initialSongs
      .map((song) => song.artist)
      .filter((artist): artist is string => Boolean(artist))
      .filter((artist) => normalizeSearchText(artist).includes(normalized))
      .filter((artist) => {
        const key = normalizeSearchText(artist);
        if (seenArtists.has(key)) return false;
        seenArtists.add(key);
        return true;
      })
      .slice(0, 5)
      .map((artist) => ({
        kind: 'artist' as const,
        value: artist,
        label: artist
      }));

    return [...songSuggestions, ...artistSuggestions].slice(0, 8);
  }, [initialSongs, query]);

  function highlightSuggestion(value: string) {
    const normalized = normalizeSearchText(query);
    if (!normalized) return value;

    const source = value;
    const sourceNormalized = normalizeSearchText(source);
    const index = sourceNormalized.indexOf(normalized);
    if (index < 0) return source;

    // La normalización puede quitar tildes; para sugerencias cortas esta aproximación
    // mantiene el texto original y resalta la coincidencia más cercana.
    const visibleLength = query.trim().length;
    return (
      <>
        {source.slice(0, index)}
        <mark className="rounded bg-amber-100 px-0.5 text-inherit dark:bg-amber-900/50">
          {source.slice(index, index + visibleLength)}
        </mark>
        {source.slice(index + visibleLength)}
      </>
    );
  }

  function chooseSuggestion(suggestion: SearchSuggestion) {
    setQuery(suggestion.value);
    setShowSuggestions(false);
  }

  const normalizedQuery = normalizeSearchText(query);
  const shouldSearchRemotely = normalizedQuery.length >= 2 && localMatches.length === 0;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!suggestionBoxRef.current?.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

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
      <div ref={suggestionBoxRef} className="relative w-full max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Buscar por canción o artista..."
          className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700"
          aria-label="Buscar canciones"
          aria-autocomplete="list"
          aria-expanded={showSuggestions && suggestions.length > 0}
          autoComplete="off"
        />

        {showSuggestions && suggestions.length > 0 && (
          <div
            role="listbox"
            className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-950"
          >
            {suggestions.map((suggestion, index) => {
              const showSongHeading = suggestion.kind === 'song' && index === 0;
              const firstArtistIndex = suggestions.findIndex((item) => item.kind === 'artist');
              const showArtistHeading = suggestion.kind === 'artist' && index === firstArtistIndex;

              return (
                <div key={`${suggestion.kind}-${normalizeSearchText(suggestion.value)}`}>
                  {showSongHeading && (
                    <div className="border-b border-gray-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800">
                      Canciones
                    </div>
                  )}
                  {showArtistHeading && (
                    <div className="border-y border-gray-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800">
                      Artistas
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseSuggestion(suggestion)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {highlightSuggestion(suggestion.label)}
                      </span>
                      {suggestion.detail && (
                        <span className="block truncate text-xs text-gray-500">{suggestion.detail}</span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {suggestion.kind === 'song' ? 'Canción' : 'Artista'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-2 text-xs text-gray-500">
          Se sugieren canciones y artistas mientras escribes. Si no existe una coincidencia visible, se buscan canciones privadas existentes.
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
              {song.artist && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{song.artist}</div>
              )}
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
