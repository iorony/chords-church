import { createServerSupabaseClient } from '@/lib/supabase/server';
import SongCatalogClient from '@/components/song/SongCatalogClient';

export default async function SongsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: songs } = await supabase
    .from('songs')
    .select('id, title, slug, detected_key, original_key, status, artists(name)')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(100);

  let favoriteSongIds = new Set<string>();

  if (user && songs?.length) {
    const songIds = songs.map((song: any) => song.id);
    const { data: favorites } = await supabase
      .from('song_favorites')
      .select('song_id')
      .eq('user_id', user.id)
      .in('song_id', songIds);

    favoriteSongIds = new Set((favorites ?? []).map((favorite: any) => favorite.song_id));
  }

  const initialSongs = (songs ?? []).map((song: any) => ({
    id: song.id,
    title: song.title,
    slug: song.slug,
    artist: song.artists?.name ?? null,
    detected_key: song.detected_key,
    original_key: song.original_key,
    status: song.status,
    is_favorite: favoriteSongIds.has(song.id)
  }));

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Biblioteca musical</p>
          <h1 className="page-title">Canciones</h1>
          <p className="page-description">
            Busca por título o artista, consulta tus favoritas y encuentra rápidamente el tono que necesitas.
          </p>
        </div>
      </div>

      <SongCatalogClient initialSongs={initialSongs} />
    </div>
  );
}
