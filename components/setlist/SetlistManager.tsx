'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { keysForMode } from '@/lib/chords/transposition';

export interface SetlistItem {
  id: string;
  song_id: string;
  position: number;
  selected_key: string | null;
  capo: number;
  private_notes: string | null;
  songs: { title: string; slug: string; detected_key: string | null; original_key: string | null };
}

export interface SearchableSong {
  id: string;
  title: string;
  slug: string;
  detected_key: string | null;
  original_key: string | null;
  artist_name: string | null;
}

export interface FavoriteSong extends SearchableSong {
  preferred_key: string | null;
}

export interface SetlistManagerProps {
  setlistId: string;
  setlistName: string;
  initialItems: SetlistItem[];
  favoriteSongs: FavoriteSong[];
  searchableSongs: SearchableSong[];
  canEdit: boolean;
}

export default function SetlistManager({ setlistId, setlistName, initialItems, favoriteSongs, searchableSongs, canEdit }: SetlistManagerProps) {
  const supabase = createClient();
  const pendingSavePromises = useRef<Map<string, Promise<boolean>>>(new Map());
  const [items, setItems] = useState(initialItems);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [addingSongId, setAddingSongId] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialItems.map((item) => [item.id, item.selected_key || item.songs.detected_key || item.songs.original_key || 'C']))
  );
  const [savingKeyIds, setSavingKeyIds] = useState<Set<string>>(new Set());
  const [savedKeyId, setSavedKeyId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function itemBaseKey(item: SetlistItem): string {
    return item.songs.detected_key || item.songs.original_key || 'C';
  }

  function itemOriginalKey(item: SetlistItem): string {
    // `detected_key` is the editable/current key of the song. `original_key`
    // is retained as legacy metadata, so it must only be used as a fallback.
    return item.songs.detected_key || item.songs.original_key || 'C';
  }

  function currentItemKey(item: SetlistItem): string {
    return pendingKeys[item.id] || item.selected_key || itemBaseKey(item);
  }

  async function waitForPendingKeySaves(): Promise<boolean> {
    const pending = Array.from(pendingSavePromises.current.values());
    if (pending.length === 0) return true;
    const results = await Promise.all(pending);
    return results.every(Boolean);
  }

  function normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
  }

  const existingSongIds = useMemo(() => new Set(items.map((item) => item.song_id)), [items]);
  const availableFavorites = useMemo(() => favoriteSongs.filter((song) => !existingSongIds.has(song.id)), [favoriteSongs, existingSongIds]);

  const searchResults = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    if (!query) return [];
    const terms = query.split(/\s+/).filter(Boolean);

    return searchableSongs
      .filter((song) => !existingSongIds.has(song.id))
      .filter((song) => {
        const searchableText = normalizeSearch(`${song.title} ${song.artist_name || ''}`);
        return terms.every((term) => searchableText.includes(term));
      })
      .slice(0, 20);
  }, [searchTerm, searchableSongs, existingSongIds]);

  async function addSong(songId: string, defaultKey: string) {
    if (addingSongId) return;
    setAddingSongId(songId);
    setSaveError(null);
    const nextPosition = (items[items.length - 1]?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from('setlist_items')
      .insert({ setlist_id: setlistId, song_id: songId, position: nextPosition, selected_key: defaultKey })
      .select('*, songs(title, slug, detected_key, original_key)')
      .single();

    setAddingSongId(null);
    if (error || !data) {
      setSaveError('No se pudo agregar la canción. Intenta nuevamente.');
      return;
    }

    const added = data as SetlistItem;
    setItems((current) => [...current, added]);
    setPendingKeys((current) => ({ ...current, [added.id]: added.selected_key || defaultKey }));
    setSearchTerm('');
  }

  async function removeItem(itemId: string) {
    const previousItems = items;
    setItems((current) => current.filter((item) => item.id !== itemId));
    const { error } = await supabase.from('setlist_items').delete().eq('id', itemId);
    if (error) {
      setItems(previousItems);
      setSaveError('No se pudo quitar la canción de la lista.');
    }
  }

  async function saveKey(itemId: string, key: string): Promise<boolean> {
    setSavingKeyIds((current) => new Set(current).add(itemId));
    setSavedKeyId(null);
    setSaveError(null);
    setPendingKeys((current) => ({ ...current, [itemId]: key }));
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, selected_key: key } : item)));

    const request = (async () => {
      const { error } = await supabase.from('setlist_items').update({ selected_key: key }).eq('id', itemId).eq('setlist_id', setlistId);
      if (error) {
        setSaveError('No se pudo guardar la tonalidad. Intenta seleccionarla nuevamente.');
        return false;
      }
      setSavedKeyId(itemId);
      window.setTimeout(() => setSavedKeyId((current) => (current === itemId ? null : current)), 1200);
      return true;
    })();

    pendingSavePromises.current.set(itemId, request);
    try {
      return await request;
    } finally {
      if (pendingSavePromises.current.get(itemId) === request) {
        pendingSavePromises.current.delete(itemId);
        setSavingKeyIds((current) => {
          const next = new Set(current);
          next.delete(itemId);
          return next;
        });
      }
    }
  }

  function restoreOriginalKey(item: SetlistItem) {
    const originalKey = itemOriginalKey(item);
    if (currentItemKey(item) === originalKey || savingKeyIds.has(item.id)) return;
    void saveKey(item.id, originalKey);
  }

  async function openPresentation() {
    if (!(await waitForPendingKeySaves())) return;
    window.location.assign(`/listas/${setlistId}/presentar?updated=${Date.now()}`);
  }

  async function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const previous = items;
    const reordered = [...items];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setItems(reordered);
    const results = await Promise.all(reordered.map((item, itemIndex) => supabase.from('setlist_items').update({ position: itemIndex + 1 }).eq('id', item.id)));
    if (results.some((result) => result.error)) {
      setItems(previous);
      setSaveError('No se pudo guardar el nuevo orden.');
    }
  }

  async function handleExport(type: 'pdf' | 'docx') {
    setExporting(type);
    try {
      if (!(await waitForPendingKeySaves())) return;
      const res = await fetch(`/api/export/${type}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'setlist', scopeId: setlistId })
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('content-disposition') || '';
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
      a.download = utf8Match ? decodeURIComponent(utf8Match[1]) : plainMatch?.[1] || `${setlistName}.${type}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setSaveError('No se pudo generar el archivo.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <button onClick={openPresentation} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-primary-light">
            <span aria-hidden="true">▶</span> Presentar
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exporting !== null} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3 font-semibold transition hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-700">
            {exporting === 'pdf' ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button onClick={() => handleExport('docx')} disabled={exporting !== null} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3 font-semibold transition hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-700">
            {exporting === 'docx' ? 'Generando...' : 'Descargar DOCX'}
          </button>
        </div>
      </section>

      {saveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {saveError}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:px-5">
          <div>
            <h2 className="font-semibold">Orden de canciones</h2>
            <p className="text-sm text-gray-500">El tono seleccionado se guarda automáticamente para esta lista.</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{items.length} canciones</span>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center sm:p-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-xl text-primary">♫</div>
            <h3 className="mt-4 font-semibold">La lista todavía está vacía</h3>
            <p className="mt-1 text-sm text-gray-500">Busca una canción o agrega una de tus favoritas.</p>
          </div>
        ) : (
          <ol className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((item, index) => (
              <li key={item.id} className="group p-3 transition hover:bg-gray-50/80 dark:hover:bg-gray-900/60 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-300">{index + 1}</span>
                    <Link href={`/canciones/${item.songs.slug}`} className="min-w-0 break-words font-semibold hover:text-primary sm:hidden">
                      {item.songs.title}
                    </Link>
                  </div>

                  <div className="hidden min-w-0 sm:block">
                    <Link href={`/canciones/${item.songs.slug}`} className="block truncate font-semibold hover:text-primary">{item.songs.title}</Link>
                    <div className="mt-0.5 text-xs text-gray-500">Tono original: {itemOriginalKey(item)}</div>
                  </div>

                  {canEdit ? (
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 sm:flex sm:justify-end">
                      <label className="sr-only" htmlFor={`key-${item.id}`}>Tono de {item.songs.title}</label>
                      <select
                        id={`key-${item.id}`}
                        value={currentItemKey(item)}
                        onChange={(event) => void saveKey(item.id, event.target.value)}
                        disabled={savingKeyIds.has(item.id)}
                        className="min-h-10 rounded-xl border border-gray-300 bg-transparent px-3 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60 dark:border-gray-700"
                      >
                        {keysForMode(itemBaseKey(item)).map((key) => <option key={key} value={key}>{key}</option>)}
                      </select>
                      <button type="button" onClick={() => restoreOriginalKey(item)} disabled={savingKeyIds.has(item.id) || currentItemKey(item) === itemOriginalKey(item)} title={`Regresar al tono original (${itemOriginalKey(item)})`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700">↺</button>
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir canción" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:border-primary hover:text-primary disabled:opacity-25 dark:border-gray-700">↑</button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Bajar canción" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:border-primary hover:text-primary disabled:opacity-25 dark:border-gray-700">↓</button>
                      <button type="button" onClick={() => removeItem(item.id)} aria-label="Quitar canción" className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-500 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40">✕</button>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-100 px-3 py-2 text-center text-sm font-semibold dark:bg-gray-800">Tono: {currentItemKey(item)}</div>
                  )}
                </div>

                {(savingKeyIds.has(item.id) || savedKeyId === item.id) && (
                  <div className="mt-2 text-right text-xs text-gray-500">{savingKeyIds.has(item.id) ? 'Guardando tonalidad...' : 'Tonalidad guardada'}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {canEdit && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950 sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Agregar canciones</h2>
            <p className="text-sm text-gray-500">Busca por título o artista. Tus favoritas aparecen debajo para agregarlas rápidamente.</p>
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por canción o artista..."
              autoComplete="off"
              className="w-full rounded-xl border border-gray-300 bg-transparent py-3 pl-11 pr-4 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-gray-700"
            />
          </div>

          {searchTerm.trim() && (
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800">Resultados</div>
              {searchResults.length > 0 ? (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {searchResults.map((song) => (
                    <li key={song.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold">{song.title}</div>
                        <div className="mt-0.5 text-xs text-gray-500">{[song.artist_name, `Tono: ${song.detected_key || song.original_key || 'C'}`].filter(Boolean).join(' · ')}</div>
                      </div>
                      <button type="button" onClick={() => addSong(song.id, song.detected_key || song.original_key || 'C')} disabled={addingSongId === song.id} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-light disabled:opacity-50">
                        {addingSongId === song.id ? 'Agregando...' : 'Agregar'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-gray-500">No se encontraron canciones por título o artista.</p>
              )}
            </div>
          )}

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Canciones favoritas</h3>
                <p className="text-sm text-gray-500">Acceso rápido a las canciones que más utilizas.</p>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">★ {availableFavorites.length}</span>
            </div>

            {availableFavorites.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {availableFavorites.map((song) => (
                  <div key={song.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                    <div className="min-w-0">
                      <Link href={`/canciones/${song.slug}`} className="block truncate font-semibold hover:text-primary">{song.title}</Link>
                      <div className="mt-0.5 truncate text-xs text-gray-500">{[song.artist_name, `Tono: ${song.preferred_key || song.detected_key || song.original_key || 'C'}`].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button type="button" onClick={() => addSong(song.id, song.preferred_key || song.detected_key || song.original_key || 'C')} disabled={addingSongId === song.id} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary text-xl font-medium text-primary transition hover:bg-primary hover:text-white disabled:opacity-50" aria-label={`Agregar ${song.title}`}>＋</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500 dark:border-gray-700">
                {favoriteSongs.length === 0 ? 'Aún no tienes canciones favoritas.' : 'Todas tus canciones favoritas ya están agregadas a esta lista.'}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
