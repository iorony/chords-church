import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import SetlistOverview from '@/components/setlist/SetlistOverview';

export default async function SetlistsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/listas');

  const { data: memberships } = await supabase
    .from('setlist_members')
    .select('setlist_id, permission')
    .eq('user_id', user.id);
  const sharedIds = (memberships || []).map((membership: any) => membership.setlist_id);
  const ownershipFilter = sharedIds.length > 0
    ? `owner_id.eq.${user.id},id.in.(${sharedIds.join(',')})`
    : `owner_id.eq.${user.id}`;
  const { data: setlists } = await supabase
    .from('setlists')
    .select('id, owner_id, name, event_date, location, visibility, setlist_items(count)')
    .or(ownershipFilter)
    .order('created_at', { ascending: false });

  const permissionByList = new Map((memberships || []).map((membership: any) => [membership.setlist_id, membership.permission]));
  const totalSongs = (setlists || []).reduce((total: number, item: any) => total + Number(item.setlist_items?.[0]?.count || 0), 0);
  const overviewSetlists = (setlists || []).map((setlist: any) => ({
    id: setlist.id,
    name: setlist.name,
    event_date: setlist.event_date,
    location: setlist.location,
    visibility: setlist.visibility,
    songCount: Number(setlist.setlist_items?.[0]?.count || 0),
    isShared: setlist.owner_id !== user.id,
    sharedPermission: permissionByList.get(setlist.id) || null
  }));

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-primary/5 p-5 shadow-sm dark:border-gray-800 dark:from-gray-950 dark:via-gray-950 dark:to-primary/10 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-blue-300">Repertorios y servicios</div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Mis listas</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300 sm:text-base">Organiza canciones, guarda el tono de cada una y abre tu repertorio directamente en modo presentación.</p>
          </div>
          <Link href="/listas/nueva" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-light hover:shadow-md"><span aria-hidden="true" className="text-xl leading-none">＋</span>Nueva lista</Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:max-w-sm sm:gap-3">
          <div className="rounded-xl border border-gray-200/80 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-900/60"><div className="text-xl font-bold">{setlists?.length || 0}</div><div className="text-xs text-gray-500">Listas</div></div>
          <div className="rounded-xl border border-gray-200/80 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-900/60"><div className="text-xl font-bold">{totalSongs}</div><div className="text-xs text-gray-500">Canciones</div></div>
        </div>
      </section>

      {!setlists || setlists.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-950 sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl text-primary">♫</div>
          <h2 className="mt-4 text-xl font-semibold">Crea tu primer repertorio</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">Agrega las canciones de tu próximo servicio, define sus tonos y preséntalas desde cualquier pantalla.</p>
          <Link href="/listas/nueva" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-light">Crear lista</Link>
        </section>
      ) : <SetlistOverview setlists={overviewSetlists} />}
    </div>
  );
}
