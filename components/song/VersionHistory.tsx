'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ChordChart from './ChordChart';

export interface SongVersion {
  id: string;
  version_number: number;
  content: string;
  key: string | null;
  change_summary: string | null;
  created_at: string;
  is_current: boolean;
  author_name: string | null;
}

export interface VersionHistoryProps {
  songId: string;
  slug: string;
  canRestore: boolean;
  versions: SongVersion[];
}

export default function VersionHistory({ songId, slug, canRestore, versions }: VersionHistoryProps) {
  const supabase = createClient();
  const router = useRouter();
  const [compareId, setCompareId] = useState<string | null>(versions[1]?.id ?? null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = versions.find((v) => v.is_current) ?? versions[0];
  const compare = versions.find((v) => v.id === compareId) ?? null;

  async function handleRestore(versionId: string) {
    if (!canRestore) return;
    if (!confirm('¿Restaurar esta versión? Se creará una versión nueva con este contenido; nada se borra.')) return;
    setRestoring(true);
    setError(null);
    const { error } = await supabase.rpc('restore_song_version', { target_version_id: versionId });
    setRestoring(false);
    if (error) {
      setError(`No se pudo restaurar: ${error.message}`);
      return;
    }
    router.push(`/canciones/${slug}`);
    router.refresh();
  }

  if (versions.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        Esta canción todavía no tiene historial de versiones (se agregó antes de que existiera esta función, o
        aún no se ha guardado ningún cambio).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="space-y-2">
        {versions.map((v) => (
          <div
            key={v.id}
            className={`flex items-center justify-between gap-3 border rounded-lg p-3 text-sm ${
              v.is_current ? 'border-primary' : 'border-gray-200 dark:border-gray-800'
            }`}
          >
            <div>
              <span className="font-medium">
                Versión {v.version_number} {v.is_current && <span className="text-primary">(vigente)</span>}
              </span>
              <div className="text-gray-500 text-xs mt-0.5">
                {new Date(v.created_at).toLocaleString('es-GT')}
                {v.author_name && ` · ${v.author_name}`}
                {v.key && ` · Tono ${v.key}`}
              </div>
              {v.change_summary && <div className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">{v.change_summary}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setCompareId(v.id)} className="text-primary underline text-xs">
                Ver
              </button>
              {canRestore && !v.is_current && (
                <button
                  onClick={() => handleRestore(v.id)}
                  disabled={restoring}
                  className="border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs disabled:opacity-50"
                >
                  Restaurar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {compare && current && compare.id !== current.id && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <h2 className="text-sm text-gray-500 mb-2">Versión {compare.version_number}</h2>
            <ChordChart content={compare.content} fontSizeClass="text-sm" />
          </div>
          <div className="border border-primary rounded-lg p-4">
            <h2 className="text-sm text-primary mb-2">Versión {current.version_number} (vigente)</h2>
            <ChordChart content={current.content} fontSizeClass="text-sm" />
          </div>
        </div>
      )}

      {compare && current && compare.id === current.id && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h2 className="text-sm text-gray-500 mb-2">Versión {compare.version_number} (vigente)</h2>
          <ChordChart content={compare.content} fontSizeClass="text-sm" />
        </div>
      )}
    </div>
  );
}
