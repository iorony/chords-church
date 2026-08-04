import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha definida';
  return new Intl.DateTimeFormat('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function SetlistsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
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

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-primary/5 p-5 shadow-sm dark:border-gray-800 dark:from-gray-950 dark:via-gray-950 dark:to-primary/10 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-blue-300">
              Repertorios y servicios
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Mis listas</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300 sm:text-base">
              Organiza canciones, guarda el tono de cada una y abre tu repertorio directamente en modo presentación.
            </p>
          </div>

          <Link
            href="/listas/nueva"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-light hover:shadow-md"
          >
            <span aria-hidden="true" className="text-xl leading-none">＋</span>
            Nueva lista
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:max-w-sm sm:gap-3">
          <div className="rounded-xl border border-gray-200/80 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-900/60">
            <div className="text-xl font-bold">{setlists?.length || 0}</div>
            <div className="text-xs text-gray-500">Listas</div>
          </div>
          <div className="rounded-xl border border-gray-200/80 bg-white/70 p-3 dark:border-gray-800 dark:bg-gray-900/60">
            <div className="text-xl font-bold">{totalSongs}</div>
            <div className="text-xs text-gray-500">Canciones</div>
          </div>
        </div>
      </section>

      {!setlists || setlists.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-950 sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl text-primary">♫</div>
          <h2 className="mt-4 text-xl font-semibold">Crea tu primer repertorio</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
            Agrega las canciones de tu próximo servicio, define sus tonos y preséntalas desde cualquier pantalla.
          </p>
          <Link href="/listas/nueva" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-light">
            Crear lista
          </Link>
        </section>
      ) : (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Tus repertorios</h2>
              <p className="text-sm text-gray-500">Incluye tus listas y las que otros usuarios compartieron contigo.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {setlists.map((setlist: any) => {
              const songCount = Number(setlist.setlist_items?.[0]?.count || 0);
              const isShared = setlist.owner_id !== user.id;
              const sharedPermission = permissionByList.get(setlist.id);
              return (
                <Link
                  key={setlist.id}
                  href={`/listas/${setlist.id}`}
                  className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg dark:border-gray-800 dark:bg-gray-950 dark:hover:border-primary/60"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-accent-teal opacity-70 transition group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold group-hover:text-primary">{setlist.name}</h3>
                      <p className="mt-1 text-sm text-gray-500">{formatDate(setlist.event_date)}</p>
                    </div>
                    {isShared && <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900">{sharedPermission === 'edit' ? 'Compartida · edición' : 'Compartida · lectura'}</span>}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
                      <div className="text-xs text-gray-500">Canciones</div>
                      <div className="mt-0.5 font-semibold">{songCount}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
                      <div className="text-xs text-gray-500">Lugar</div>
                      <div className="mt-0.5 truncate font-semibold">{setlist.location || 'Sin definir'}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 text-sm dark:border-gray-800">
                    <span className="text-gray-500">{isShared ? 'Compartida contigo' : setlist.visibility === 'public' ? 'Pública' : setlist.visibility === 'link_only' ? 'Solo con enlace' : 'Privada'}</span>
                    <span className="font-semibold text-primary transition group-hover:translate-x-1">Abrir →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
