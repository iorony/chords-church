import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AdminSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: settings } = await supabase.from('app_settings').select('*').order('key');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración general</h1>
      <div className="space-y-3">
        {settings?.map((s) => (
          <div key={s.key} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <div className="font-mono text-sm font-semibold">{s.key}</div>
            <pre className="text-xs text-gray-500 mt-1">{JSON.stringify(s.value, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
