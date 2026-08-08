import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import AdminSongsTable from '@/components/admin/AdminSongsTable';

export default async function AdminSongsPage({ searchParams }: { searchParams: { q?: string; state?: string; status?: string } }) {
  const supabase = createServerSupabaseClient();
  let query = supabase.from('songs').select('id, title, slug, status, visibility, is_deleted, created_at, artists(name)').order('created_at', { ascending: false }).limit(200);
  const term = searchParams.q?.trim(); const state = searchParams.state || 'active'; const status = searchParams.status || '';
  if (term) query = query.ilike('title', `%${term.replace(/[%_]/g, '')}%`);
  if (state === 'active') query = query.eq('is_deleted', false);
  if (state === 'deleted') query = query.eq('is_deleted', true);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Gestión de canciones</h1><p className="mt-1 text-sm text-gray-500">Busca, edita, desactiva, restaura o fusiona duplicados.</p></div><Link href="/canciones/nueva" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Agregar canción</Link></div>
    <form className="grid gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-800 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto]">
      <input name="q" defaultValue={term} placeholder="Buscar por título..." className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700" />
      <select name="status" defaultValue={status} className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"><option value="">Todos los estados</option><option value="draft">Borrador</option><option value="pending_review">Pendiente</option><option value="published">Publicada</option><option value="reported">Reportada</option><option value="archived">Archivada</option></select>
      <select name="state" defaultValue={state} className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"><option value="active">Activas</option><option value="deleted">Desactivadas</option><option value="all">Todas</option></select>
      <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary dark:border-gray-700">Filtrar</button>
    </form>
    {error ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error.message}</p> : <AdminSongsTable songs={(data as any) || []} />}
  </div>;
}
