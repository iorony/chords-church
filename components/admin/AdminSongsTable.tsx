'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export interface AdminSong {
  id: string;
  title: string;
  slug: string;
  status: string;
  visibility: string;
  is_deleted: boolean;
  artists?: { name: string } | null;
}

export default function AdminSongsTable({ songs: initial }: { songs: AdminSong[] }) {
  const supabase = createClient();
  const [songs, setSongs] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [canonicalId, setCanonicalId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);

  async function toggleDeactivate(song: AdminSong) {
    const newDeleted = !song.is_deleted;
    await supabase.from('songs').update({ is_deleted: newDeleted }).eq('id', song.id);
    setSongs(songs.map((s) => (s.id === song.id ? { ...s, is_deleted: newDeleted } : s)));
  }

  function toggleSelected(id: string) {
    setMergeError(null);
    setMergeSuccess(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (canonicalId === id) setCanonicalId(null);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectedSongs = songs.filter((s) => selected.has(s.id));

  async function handleMerge() {
    if (!canonicalId || selectedSongs.length < 2) return;
    setMerging(true);
    setMergeError(null);
    setMergeSuccess(null);

    const duplicateIds = selectedSongs.map((s) => s.id).filter((id) => id !== canonicalId);
    let mergedCount = 0;

    for (const duplicateId of duplicateIds) {
      const res = await fetch('/api/admin/songs/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canonicalSongId: canonicalId, duplicateSongId: duplicateId })
      });
      const data = await res.json();
      if (!res.ok) {
        setMergeError(data.error || 'No se pudo fusionar una de las canciones seleccionadas.');
        break;
      }
      mergedCount += 1;
    }

    if (mergedCount > 0) {
      setSongs(songs.map((s) => (duplicateIds.slice(0, mergedCount).includes(s.id) ? { ...s, is_deleted: true } : s)));
      setMergeSuccess(
        `${mergedCount} canción${mergedCount === 1 ? '' : 'es'} fusionada${mergedCount === 1 ? '' : 's'} correctamente.`
      );
    }

    setSelected(new Set());
    setCanonicalId(null);
    setMerging(false);
  }

  return (
    <div className="space-y-4">
      {selectedSongs.length >= 2 && (
        <div className="border border-primary rounded-lg p-4 space-y-3 text-sm">
          <h2 className="font-semibold">Fusionar {selectedSongs.length} canciones seleccionadas</h2>
          <p className="text-gray-500">
            Elige cuál se conserva como la canción canónica. Las demás se marcarán como fusionadas: todas sus
            listas, favoritos, propuestas, reportes y versiones se trasladan a la canónica.
          </p>
          <div className="space-y-1">
            {selectedSongs.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="canonical"
                  checked={canonicalId === s.id}
                  onChange={() => setCanonicalId(s.id)}
                />
                {s.title} <span className="text-gray-400">({s.artists?.name || 'sin artista'})</span>
              </label>
            ))}
          </div>
          {mergeError && <p className="text-danger">{mergeError}</p>}
          <button
            onClick={handleMerge}
            disabled={!canonicalId || merging}
            className="bg-primary text-white px-4 py-2 rounded-md disabled:opacity-50"
          >
            {merging ? 'Fusionando...' : 'Fusionar'}
          </button>
        </div>
      )}

      {mergeSuccess && <p className="text-success text-sm">{mergeSuccess}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-4 w-8"></th>
              <th className="py-2 pr-4">Título</th>
              <th className="py-2 pr-4">Artista</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Visibilidad</th>
              <th className="py-2 pr-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    aria-label={`Seleccionar ${s.title} para fusionar`}
                  />
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/canciones/${s.slug}`} className="hover:text-primary">
                    {s.title}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-gray-500">{s.artists?.name || '—'}</td>
                <td className="py-2 pr-4">{s.status}</td>
                <td className="py-2 pr-4">{s.visibility === 'private' ? 'Privada' : 'Pública'}</td>
                <td className="py-2 pr-4">
                  <button onClick={() => toggleDeactivate(s)} className="text-danger underline text-xs">
                    {s.is_deleted ? 'Restaurar' : 'Desactivar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
