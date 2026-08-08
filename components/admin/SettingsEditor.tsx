'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Setting = { key: string; value: unknown };
type AiSetting = { provider: string; daily_limit_per_user: number };
type SearchSetting = { enabled: boolean; provider: string | null };
const AI_PROVIDERS = ['groq', 'openrouter', 'gemini', 'openai', 'anthropic'];

export default function SettingsEditor({ settings }: { settings: Setting[] }) {
  const supabase = createClient();
  const initial = Object.fromEntries(settings.map((item) => [item.key, item.value])) as Record<string, any>;
  const [ai, setAi] = useState<AiSetting>({ provider: initial.ai_provider?.provider || 'groq', daily_limit_per_user: Number(initial.ai_provider?.daily_limit_per_user) || 30 });
  const [search, setSearch] = useState<SearchSetting>({ enabled: initial.search_provider?.enabled === true, provider: initial.search_provider?.provider || 'serper' });
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function save(key: string, value: AiSetting | SearchSetting) {
    if (key === 'ai_provider' && (ai.daily_limit_per_user < 1 || ai.daily_limit_per_user > 1000)) {
      setMessage({ error: true, text: 'El límite diario debe estar entre 1 y 1000.' });
      return;
    }
    setSaving(key);
    setMessage(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('app_settings').update({ value, updated_by: user?.id, updated_at: new Date().toISOString() }).eq('key', key);
    setSaving(null);
    setMessage(error ? { error: true, text: error.message } : { error: false, text: 'Configuración guardada y aplicada.' });
  }

  return <div className="space-y-4">
    {message && <p className={`rounded-lg px-4 py-3 text-sm ${message.error ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'}`}>{message.text}</p>}

    <section className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
      <h2 className="font-semibold">Inteligencia artificial</h2>
      <p className="mt-1 text-sm text-gray-500">Selecciona el proveedor principal y el máximo de consultas por usuario durante 24 horas.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Proveedor principal
          <select className="ui-input mt-1" value={ai.provider} onChange={(event) => setAi((current) => ({ ...current, provider: event.target.value }))}>
            {AI_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Límite diario por usuario
          <input className="ui-input mt-1" type="number" min={1} max={1000} value={ai.daily_limit_per_user} onChange={(event) => setAi((current) => ({ ...current, daily_limit_per_user: Number(event.target.value) }))} />
        </label>
      </div>
      <p className="mt-3 text-xs text-gray-500">El proveedor funcionará si su clave privada está configurada en el servidor. Si falla, se probarán los proveedores de respaldo.</p>
      <button type="button" onClick={() => save('ai_provider', ai)} disabled={saving === 'ai_provider'} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving === 'ai_provider' ? 'Guardando...' : 'Guardar IA'}</button>
    </section>

    <section className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
      <h2 className="font-semibold">Búsqueda externa</h2>
      <p className="mt-1 text-sm text-gray-500">Controla si el buscador consulta fuentes externas cuando no encuentra una canción en el catálogo.</p>
      <label className="mt-4 flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" checked={search.enabled} onChange={(event) => setSearch((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4" />
        Habilitar búsqueda externa
      </label>
      <label className="mt-4 block max-w-md text-sm font-medium">Proveedor
        <select className="ui-input mt-1" value={search.provider || 'serper'} onChange={(event) => setSearch((current) => ({ ...current, provider: event.target.value }))} disabled={!search.enabled}>
          <option value="serper">Serper</option>
        </select>
      </label>
      <p className="mt-3 text-xs text-gray-500">La clave SEARCH_API_KEY permanece protegida en el servidor y no se muestra aquí.</p>
      <button type="button" onClick={() => save('search_provider', search)} disabled={saving === 'search_provider'} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving === 'search_provider' ? 'Guardando...' : 'Guardar búsqueda'}</button>
    </section>
  </div>;
}
