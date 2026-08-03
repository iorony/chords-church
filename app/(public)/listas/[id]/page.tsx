import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import SetlistManager from '@/components/setlist/SetlistManager';

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

export default async function SetlistDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/listas/${params.id}`);

  const { data: setlist } = await supabase.from('setlists').select('*').eq('id', params.id).single();
  if (!setlist) notFound();

  const { data: member } = await supabase
    .from('setlist_members')
    .select('permission')
    .eq('setlist_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  const canEdit = setlist.owner_id === user.id || member?.permission === 'edit';

  const { data: items } = await supabase
    .from('setlist_items')
    .select('*, songs(title, slug, detected_key, original_key)')
    .eq('setlist_id', params.id)
    .order('position', { ascending: true });

  const { data: favorites } = await supabase
    .from('song_favorites')
    .select('preferred_key, songs(id, title, slug, detected_key, original_key, artists(name))')
    .eq('user_id', user.id);

  const favoriteSongs = (favorites || [])
    .map((favorite: any) => favorite.songs ? ({
      ...favorite.songs,
      artist_name: favorite.songs.artists?.name || null,
      preferred_key: favorite.preferred_key
    }) : null)
    .filter(Boolean);

  const { data: songsForSearch } = await supabase
    .from('songs')
    .select('id, title, slug, detected_key, original_key, artists(name)')
    .eq('is_deleted', false)
    .order('title', { ascending: true });

  const searchableSongs = (songsForSearch || []).map((song: any) => ({
    id: song.id,
    title: song.title,
    slug: song.slug,
    detected_key: song.detected_key,
    original_key: song.original_key,
    artist_name: song.artists?.name || null
  }));

  const formattedDate = formatDate(setlist.event_date);

  return (
    <div className="space-y-6">
      <Link href="/listas" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-primary">
        ← Volver a Mis listas
      </Link>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-primary/5 p-5 shadow-sm dark:border-gray-800 dark:from-gray-950 dark:to-primary/10 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-blue-300">
                {setlist.status === 'confirmed' ? 'Lista confirmada' : setlist.status === 'finished' ? 'Lista finalizada' : setlist.status === 'archived' ? 'Lista archivada' : 'Borrador'}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {setlist.visibility === 'public' ? 'Pública' : 'Privada'}
              </span>
            </div>
            <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{setlist.name}</h1>
            <div className="mt-3 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 sm:flex-row sm:flex-wrap sm:gap-x-5">
              {formattedDate && <span>📅 {formattedDate}</span>}
              {setlist.location && <span>📍 {setlist.location}</span>}
              <span>🎵 {(items || []).length} {(items || []).length === 1 ? 'canción' : 'canciones'}</span>
            </div>
          </div>
          {!canEdit && (
            <div className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300">
              Tienes acceso de lectura a esta lista.
            </div>
          )}
        </div>
      </section>

      <SetlistManager
        setlistId={setlist.id}
        setlistName={setlist.name}
        initialStatus={setlist.status}
        initialItems={(items as any) || []}
        favoriteSongs={favoriteSongs as any}
        searchableSongs={searchableSongs as any}
        canEdit={canEdit}
      />
    </div>
  );
}
