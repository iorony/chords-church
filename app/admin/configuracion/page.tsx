import { createServerSupabaseClient } from '@/lib/supabase/server';
import SettingsEditor from '@/components/admin/SettingsEditor';

export default async function AdminSettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: settings, error } = await supabase.from('app_settings').select('key, value').order('key');

  return <div className="space-y-5">
    <div>
      <h1 className="text-2xl font-bold">Configuración general</h1>
      <p className="mt-1 text-sm text-gray-500">Administra proveedores y límites operativos. Solo los administradores pueden guardar cambios.</p>
    </div>
    {error
      ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error.message}</p>
      : <SettingsEditor settings={(settings as any) || []} />}
  </div>;
}
