import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import SongDetailClient from '@/components/song/SongDetailClient';

export default async function SongDetailPage({ params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.slug);

  let songQuery = supabase
    .from('songs')
    .select('*, artists(name), song_sources(source_url)')
    .eq('is_deleted', false);

  songQuery = isUuid
    ? songQuery.eq('id', params.slug)
    : songQuery.eq('slug', params.slug);

  const { data: song } = await songQuery.maybeSingle();

  if (!song) notFound();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let isFavorite = false;
  if (user) {
    const { data: fav } = await supabase
      .from('song_favorites')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('song_id', song.id)
      .maybeSingle();
    isFavorite = !!fav;
  }

  let canManageSong = user?.id === song.created_by;
  if (user && !canManageSong) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    canManageSong = ['moderator', 'admin'].includes(profile?.role || '');
  }
  const canEditDirectly = canManageSong;

  let canSetPrivate = false;
  if (canManageSong) {
    const { data: canSetPrivateResult } = await (supabase as any).rpc('song_can_be_private', {
      target_song_id: song.id
    });
    canSetPrivate = Boolean(canSetPrivateResult);
  }

  return (
    <div className="space-y-4">
      <SongDetailClient
        songId={song.id}
        title={song.title}
        artistName={(song as any).artists?.name}
        originalKey={song.detected_key || song.original_key || 'C'}
        content={song.content}
        sourceUrl={song.source_url || (song as any).song_sources?.find((source: any) => source.source_url)?.source_url || null}
        isFavorite={isFavorite}
        isLoggedIn={!!user}
        status={song.status}
        visibility={song.visibility === 'private' ? 'private' : 'public'}
        canManageSong={canManageSong}
        canSetPrivate={canSetPrivate}
      />

      <div className="text-sm text-gray-500 flex gap-4">
        {canEditDirectly ? (
          <>
            <Link href={`/canciones/${song.id}/editar`} className="text-primary underline">
              Editar canción
            </Link>
            <Link href={`/canciones/${song.id}/historial`} className="text-primary underline">
              Ver historial
            </Link>
          </>
        ) : (
          user && (
            <Link href={`/canciones/${song.id}/editar?proposal=1`} className="text-primary underline">
              Proponer corrección
            </Link>
          )
        )}
      </div>
    </div>
  );
}
