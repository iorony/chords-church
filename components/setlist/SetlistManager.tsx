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
  initialStatus: 'draft' | 'confirmed' | 'finished' | 'archived';
}

export default function SetlistManager({ setlistId, setlistName, initialStatus, initialItems, favoriteSongs, searchableSongs, canEdit }: SetlistManagerProps) {
  const supabase = createClient();
  const pendingSavePromises = useRef<Map<string, Promise<boolean>>>(new Map());
  const [items, setItems] = useState(initialItems);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [savingStatus, setSavingStatus] = useState(false);
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
    return item.songs.original_key || item.songs.detected_key || 'C';
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
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  }

  const searchResults = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    if (!query) return [];

    const terms = query.split(/\s+/).filter(Boolean);

    return searchableSongs
      .filter((song) => {
        const searchableText = normalizeSearch(`${song.title} ${song.artist_name || ''}`);
        return terms.every((term) => searchableText.includes(term));
      })
      .slice(0, 20);
  }, [searchTerm, searchableSongs]);


  async function addSong(songId: string, defaultKey: string) {
    const nextPosition = (items[items.length - 1]?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from('setlist_items')
      .insert({ setlist_id: setlistId, song_id: songId, position: nextPosition, selected_key: defaultKey })
      .select('*, songs(title, slug, detected_key, original_key)')
      .single();
    if (!error && data) {
      const added = data as SetlistItem;
      setItems((current) => [...current, added]);
      setPendingKeys((current) => ({ ...current, [added.id]: added.selected_key || defaultKey }));
      setSearchTerm('');
    }
  }

  async function removeItem(itemId: string) {
    await supabase.from('setlist_items').delete().eq('id', itemId);
    setItems(items.filter((i) => i.id !== itemId));
  }

  async function saveKey(itemId: string, key: string): Promise<boolean> {
    setSavingKeyIds((current) => new Set(current).add(itemId));
    setSavedKeyId(null);
    setSaveError(null);

    // Actualización optimista: la lista usa el nuevo tono de inmediato.
    setPendingKeys((current) => ({ ...current, [itemId]: key }));
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, selected_key: key } : item)));

    const request = (async () => {
      const { error } = await supabase
        .from('setlist_items')
        .update({ selected_key: key })
        .eq('id', itemId)
        .eq('setlist_id', setlistId);

      if (error) {
        console.error('Error guardando tonalidad de la lista:', error);
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

  function handleKeyChange(itemId: string, key: string) {
    void saveKey(itemId, key);
  }

  function restoreOriginalKey(item: SetlistItem) {
    const originalKey = itemOriginalKey(item);
    if (currentItemKey(item) === originalKey || savingKeyIds.has(item.id)) return;
    void saveKey(item.id, originalKey);
  }

  async function openPresentation() {
    if (!(await waitForPendingKeySaves())) return;

    // Se fuerza una navegación completa para que la página de presentación
    // consulte nuevamente setlist_items y use los tonos recién seleccionados,
    // evitando datos antiguos del caché de navegación de Next.js.
    window.location.assign(`/listas/${setlistId}/presentar?updated=${Date.now()}`);
  }

  async function confirmSetlist() {
    setSavingStatus(true);
    setSaveError(null);
    const { error } = await supabase
      .from('setlists')
      .update({ status: 'confirmed' })
      .eq('id', setlistId);
    setSavingStatus(false);

    if (error) {
      console.error('Error confirmando la lista:', error);
      setSaveError('No se pudo confirmar la lista.');
      return;
    }
    setStatus('confirmed');
  }

  async function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setItems(reordered);
    await Promise.all(
      reordered.map((item, i) => supabase.from('setlist_items').update({ position: i + 1 }).eq('id', item.id))
    );
  }

  const existingSongIds = new Set(items.map((item) => item.song_id));
  const availableFavorites = favoriteSongs.filter((song) => !existingSongIds.has(song.id));

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
      a.download = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : plainMatch?.[1] || `${setlistName}.${type}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('No se pudo generar el archivo.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="responsive-actions">
        <button
          type="button"
          onClick={openPresentation}
          className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-light"
        >
          Modo presentación
        </button>
        <button
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
          className="border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-md"
        >
          {exporting === 'pdf' ? 'Generando...' : 'Exportar PDF'}
        </button>
        <button
          onClick={() => handleExport('docx')}
          disabled={exporting !== null}
          className="border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-md"
        >
          {exporting === 'docx' ? 'Generando...' : 'Exportar DOCX'}
        </button>
        {canEdit && status === 'draft' && (
          <button
            onClick={confirmSetlist}
            disabled={savingStatus}
            className="border border-accent-teal text-accent-teal px-4 py-2 rounded-md disabled:opacity-50"
          >
            {savingStatus ? 'Confirmando...' : 'Confirmar lista'}
          </button>
        )}
        <span className="text-xs text-gray-500">
          Estado: {status === 'confirmed' ? 'Confirmada' : status === 'finished' ? 'Finalizada' : status === 'archived' ? 'Archivada' : 'Borrador'}
        </span>
      </div>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border border-gray-200 dark:border-gray-800 rounded-lg p-3 sm:flex sm:gap-3"
          >
            <span className="row-start-1 text-gray-400 text-sm w-6 sm:row-auto">{index + 1}</span>
            <Link href={`/canciones/${item.songs.slug}`} className="min-w-0 break-words font-medium hover:text-primary sm:flex-1">
              {item.songs.title}
            </Link>
            {canEdit && (
              <div className="col-span-3 flex flex-wrap items-center justify-end gap-3 sm:col-auto sm:flex-nowrap">
                <select
                  value={currentItemKey(item)}
                  onChange={(e) => handleKeyChange(item.id, e.target.value)}
                  disabled={savingKeyIds.has(item.id)}
                  className="w-20 border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-2 py-1 text-sm disabled:opacity-60 sm:w-auto"
                >
                  {keysForMode(itemBaseKey(item)).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => restoreOriginalKey(item)}
                  disabled={savingKeyIds.has(item.id) || currentItemKey(item) === itemOriginalKey(item)}
                  title={`Regresar al tono original (${itemOriginalKey(item)})`}
                  aria-label={`Regresar ${item.songs.title} al tono original ${itemOriginalKey(item)}`}
                  className="text-gray-400 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↺
                </button>
                {(savingKeyIds.has(item.id) || savedKeyId === item.id) && (
                  <span className="hidden text-xs text-gray-500 min-w-[64px] lg:inline">
                    {savingKeyIds.has(item.id) ? 'Guardando...' : 'Guardado'}
                  </span>
                )}
                <button onClick={() => move(index, -1)} className="text-gray-400 hover:text-primary" aria-label="Subir">
                  ↑
                </button>
                <button onClick={() => move(index, 1)} className="text-gray-400 hover:text-primary" aria-label="Bajar">
                  ↓
                </button>
                <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-danger" aria-label="Quitar">
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-gray-500 text-sm">Aún no agregas canciones a esta lista.</p>}
      </div>

      {canEdit && (
        <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
          <h2 className="font-semibold mb-2 text-sm">Agregar canción</h2>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por canción o artista..."
            autoComplete="off"
            className="border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2 w-full"
          />
          {searchResults.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Resultados de búsqueda</h3>
              <ul className="space-y-1">
                {searchResults
                  .filter((song) => !existingSongIds.has(song.id))
                  .map((s) => (
                    <li key={s.id} className="flex flex-col items-stretch gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <span className="font-medium block">{s.title}</span>
                        {s.artist_name && <span className="text-xs text-gray-500">{s.artist_name}</span>}
                      </div>
                      <button
                        onClick={() => addSong(s.id, s.detected_key || s.original_key || 'C')}
                        className="text-primary underline shrink-0"
                      >
                        Agregar
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {searchTerm.trim() && searchResults.filter((song) => !existingSongIds.has(song.id)).length === 0 && (
            <p className="mt-3 text-sm text-gray-500">No se encontraron canciones por título o artista.</p>
          )}

          <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2">Canciones favoritas</h3>
            {availableFavorites.length > 0 ? (
              <ul className="space-y-2">
                {availableFavorites.map((song) => (
                  <li key={song.id} className="flex flex-col items-stretch gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={`/canciones/${song.slug}`} className="font-medium hover:text-primary">
                        {song.title}
                      </Link>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[song.artist_name, `Tono: ${song.preferred_key || song.detected_key || song.original_key || 'C'}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <button
                      onClick={() => addSong(song.id, song.preferred_key || song.detected_key || song.original_key || 'C')}
                      className="border border-primary text-primary px-3 py-1.5 rounded-md hover:bg-primary hover:text-white shrink-0"
                    >
                      Agregar
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">
                {favoriteSongs.length === 0
                  ? 'Aún no tienes canciones favoritas.'
                  : 'Todas tus canciones favoritas ya están agregadas a esta lista.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
