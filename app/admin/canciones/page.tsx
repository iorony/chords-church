import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminSongsTable from '@/components/admin/AdminSongsTable';

export default async function AdminSongsPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createServerSupabaseClient();
  let query = supabase
    .from('songs')
    .select('id, title, slug, status, visibility, is_deleted, created_at, artists(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.q) {
    query = query.textSearch('normalized_title', searchParams.q.split(' ').join(' | '));
  }

  const { data: songs } = await query;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gestión de canciones</h1>
      <form className="flex flex-col gap-2 max-w-md sm:flex-row">
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="Buscar..."
          className="border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2 flex-1"
        />
        <button className="border border-gray-300 dark:border-gray-700 px-4 py-2 rounded-md">Buscar</button>
      </form>
      <AdminSongsTable songs={(songs as any) || []} />
    </div>
  );
}
