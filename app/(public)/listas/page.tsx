import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function SetlistsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/listas');

  const { data: setlists } = await supabase
    .from('setlists')
    .select('id, name, event_date, status, visibility')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Mis listas</h1>
        <Link href="/listas/nueva" className="bg-primary text-white px-4 py-2 rounded-md">
          Nueva lista
        </Link>
      </div>

      {(!setlists || setlists.length === 0) && (
        <p className="text-gray-500 text-sm">Aún no tienes repertorios. Crea el primero para tu próximo servicio.</p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {setlists?.map((s) => (
          <Link
            key={s.id}
            href={`/listas/${s.id}`}
            className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-primary transition-colors"
          >
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-gray-500 mt-1">{s.event_date || 'Sin fecha'}</div>
            <div className="text-xs text-accent-teal mt-2">{s.status === 'confirmed' ? 'Confirmada' : s.status === 'finished' ? 'Finalizada' : s.status === 'archived' ? 'Archivada' : 'Borrador'}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
