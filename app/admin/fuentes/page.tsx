import { createServerSupabaseClient } from '@/lib/supabase/server';
import SourcesManager from '@/components/admin/SourcesManager';

export default async function AdminSourcesPage() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from('external_sources').select('id, name, base_url, can_import, is_enabled, notes').order('name');
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Fuentes externas</h1><p className="mt-1 text-sm text-gray-500">Administra los catálogos autorizados. Registrar una fuente no conecta automáticamente una API: el proveedor correspondiente debe existir en el servidor.</p></div>{error ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error.message}</p> : <SourcesManager sources={(data as any) || []} />}</div>;
}
