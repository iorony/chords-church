import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import SetlistManager from '@/components/setlist/SetlistManager';

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{setlist.name}</h1>
        {setlist.event_date && <p className="text-gray-500 text-sm">{setlist.event_date}</p>}
      </div>
      <SetlistManager setlistId={setlist.id} setlistName={setlist.name} initialStatus={setlist.status} initialItems={(items as any) || []} favoriteSongs={favoriteSongs as any} searchableSongs={searchableSongs as any} canEdit={canEdit} />
    </div>
  );
}
