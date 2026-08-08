import UsersTable from '@/components/admin/UsersTable';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AdminUsersPage() {
  const supabase = createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser();
  const { data: currentProfile } = user ? await supabase.from('profiles').select('role').eq('id', user.id).single() : { data: null };
  const { data, error } = await supabase.from('profiles').select('id, display_name, role, is_active, created_at').order('created_at', { ascending: false }).limit(200);
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Usuarios</h1><p className="mt-1 text-sm text-gray-500">Administra roles y acceso de hasta 200 cuentas recientes.</p></div>{error || !user ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error?.message || 'No se pudo identificar al administrador.'}</p> : <UsersTable users={(data as any) || []} currentUserId={user.id} canManage={currentProfile?.role === 'admin'} />}</div>;
}
