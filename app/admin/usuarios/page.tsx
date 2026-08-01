import UsersTable from '@/components/admin/UsersTable';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AdminUsersPage() {
  const supabase = createServerSupabaseClient();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, role, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Usuarios</h1>
      <UsersTable users={(profiles as any) || []} />
    </div>
  );
}
