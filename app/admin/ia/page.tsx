import { createServerSupabaseClient } from '@/lib/supabase/server';

const PROVIDERS = ['groq', 'openrouter', 'gemini', 'openai', 'anthropic'] as const;
const PROVIDER_KEYS: Record<(typeof PROVIDERS)[number], string> = {
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  gemini: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY'
};

export default async function AdminAiPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: setting }, { data: reviews, error }, { count }] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'ai_provider').maybeSingle(),
    supabase.from('song_ai_reviews').select('id, provider, model, applied, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('song_ai_reviews').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 86400000).toISOString())
  ]);
  const configured = PROVIDERS.filter((provider) => Boolean(process.env[PROVIDER_KEYS[provider]]));
  const preferred = typeof (setting?.value as any)?.provider === 'string'
    ? (setting?.value as any).provider
    : process.env.AI_PROVIDER?.toLowerCase() || null;
  const limit = Number((setting?.value as any)?.daily_limit_per_user) || 30;

  return <div className="space-y-7">
    <div><h1 className="text-2xl font-bold">Inteligencia Artificial</h1><p className="mt-1 text-sm text-gray-500">Estado de proveedores, límites y actividad reciente sin exponer credenciales ni contenido.</p></div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="text-xs text-gray-500">Proveedor preferido</div><div className="mt-1 text-lg font-bold">{preferred || 'Orden automático'}</div></div>
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="text-xs text-gray-500">Proveedores configurados</div><div className="mt-1 text-lg font-bold">{configured.length}</div><div className="text-xs text-gray-500">{configured.join(', ') || 'Ninguno'}</div></div>
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="text-xs text-gray-500">Uso global (24h)</div><div className="mt-1 text-lg font-bold">{count ?? 0}</div><div className="text-xs text-gray-500">Límite por usuario: {limit}</div></div>
    </div>
    {!configured.length && <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">No hay claves de proveedor configuradas. Las revisiones utilizarán el análisis local.</p>}
    <section><h2 className="mb-3 font-semibold">Últimas revisiones</h2>{error ? <p className="text-sm text-red-600">{error.message}</p> : <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800"><table className="w-full min-w-[580px] text-sm"><thead className="bg-gray-50 text-left dark:bg-gray-900"><tr><th className="p-3">Proveedor</th><th className="p-3">Modelo</th><th className="p-3">Aplicada</th><th className="p-3">Fecha</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{reviews?.map((review) => <tr key={review.id}><td className="p-3 font-medium">{review.provider}</td><td className="p-3">{review.model}</td><td className="p-3">{review.applied ? 'Sí' : 'No'}</td><td className="p-3 text-gray-500">{new Date(review.created_at).toLocaleString('es-GT')}</td></tr>)}{!reviews?.length && <tr><td colSpan={4} className="p-6 text-center text-gray-500">Todavía no hay revisiones registradas.</td></tr>}</tbody></table></div>}</section>
  </div>;
}
