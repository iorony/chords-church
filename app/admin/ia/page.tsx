import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AdminAiPage() {
  const supabase = createServerSupabaseClient();
  const { data: settings } = await supabase.from('app_settings').select('*').eq('key', 'ai_provider').single();

  const { data: recentReviews } = await supabase
    .from('song_ai_reviews')
    .select('id, provider, model, applied, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const { count: reviewsLast24h } = await supabase
    .from('song_ai_reviews')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Inteligencia Artificial</h1>

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 max-w-lg">
        <h2 className="font-semibold mb-2">Proveedor activo</h2>
        <p className="text-sm text-gray-500 mb-2">
          El proveedor se define con la variable de entorno <code>AI_PROVIDER</code> (openai, gemini o
          anthropic) y no se puede cambiar en caliente desde aquí por seguridad — requiere redeploy con la
          variable actualizada.
        </p>
        <pre className="text-xs bg-gray-100 dark:bg-gray-900 rounded-md p-3 overflow-x-auto">
          {JSON.stringify(settings?.value ?? {}, null, 2)}
        </pre>
        <p className="text-sm mt-2">
          Consultas de IA en las últimas 24h: <strong>{reviewsLast24h ?? 0}</strong>
        </p>
      </div>

      <div>
        <h2 className="font-semibold mb-2">Últimas revisiones (sin exponer contenido sensible)</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-4">Proveedor</th>
              <th className="py-2 pr-4">Modelo</th>
              <th className="py-2 pr-4">Aplicada</th>
              <th className="py-2 pr-4">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {recentReviews?.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2 pr-4">{r.provider}</td>
                <td className="py-2 pr-4">{r.model}</td>
                <td className="py-2 pr-4">{r.applied ? 'Sí' : 'No'}</td>
                <td className="py-2 pr-4 text-gray-500">{new Date(r.created_at).toLocaleString('es-GT')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
