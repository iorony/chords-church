'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Source = { id: string; name: string; base_url: string | null; can_import: boolean; is_enabled: boolean; notes: string | null };

export default function SourcesManager({ sources: initial }: { sources: Source[] }) {
  const supabase = createClient();
  const [sources, setSources] = useState(initial);
  const [name, setName] = useState(''); const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setBusy('new'); setError(null);
    const { data, error: insertError } = await supabase.from('external_sources').insert({ name: name.trim(), base_url: baseUrl.trim() || null, can_import: false, is_enabled: true }).select('*').single();
    setBusy(null);
    if (insertError || !data) { setError(insertError?.message || 'No se pudo crear la fuente.'); return; }
    setSources((current) => [...current, data as Source].sort((a, b) => a.name.localeCompare(b.name))); setName(''); setBaseUrl('');
  }

  async function patch(item: Source, changes: Partial<Source>) {
    setBusy(item.id); setError(null);
    const { error: updateError } = await supabase.from('external_sources').update(changes).eq('id', item.id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    setSources((current) => current.map((source) => source.id === item.id ? { ...source, ...changes } : source));
  }

  async function remove(item: Source) {
    if (!window.confirm(`¿Eliminar la fuente “${item.name}”?`)) return;
    setBusy(item.id); setError(null);
    const { error: deleteError } = await supabase.from('external_sources').delete().eq('id', item.id);
    setBusy(null);
    if (deleteError) { setError(deleteError.message); return; }
    setSources((current) => current.filter((source) => source.id !== item.id));
  }

  return <div className="space-y-4">
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
    <div className="grid gap-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-[1fr_1.4fr_auto]">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la fuente" className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
      <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://... (opcional)" type="url" className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
      <button type="button" onClick={add} disabled={!name.trim() || busy === 'new'} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === 'new' ? 'Agregando...' : 'Agregar'}</button>
    </div>
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800"><table className="w-full min-w-[650px] text-sm"><thead className="bg-gray-50 text-left dark:bg-gray-900"><tr><th className="p-3">Fuente</th><th className="p-3">Importación</th><th className="p-3">Estado</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">
      {sources.map((item) => <tr key={item.id}><td className="p-3"><div className="font-semibold">{item.name}</div>{item.base_url && <a href={item.base_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{item.base_url}</a>}</td><td className="p-3"><button disabled={busy === item.id} onClick={() => patch(item, { can_import: !item.can_import })} className="underline">{item.can_import ? 'Permitida' : 'Solo referencia'}</button></td><td className="p-3"><button disabled={busy === item.id} onClick={() => patch(item, { is_enabled: !item.is_enabled })} className={item.is_enabled ? 'text-green-700 underline' : 'text-gray-500 underline'}>{item.is_enabled ? 'Habilitada' : 'Deshabilitada'}</button></td><td className="p-3 text-right"><button disabled={busy === item.id} onClick={() => remove(item)} className="text-red-600 underline">Eliminar</button></td></tr>)}
      {!sources.length && <tr><td colSpan={4} className="p-6 text-center text-gray-500">No hay fuentes configuradas.</td></tr>}
    </tbody></table></div>
  </div>;
}
