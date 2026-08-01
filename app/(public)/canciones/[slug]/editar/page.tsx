import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import SongEditForm from '@/components/song/SongEditForm';

// NOTA: Next.js exige que todos los segmentos dinámicos al mismo nivel de
// /canciones/ usen el mismo nombre de parámetro que la ruta hermana
// /canciones/[slug] (detalle). Por eso este segmento también se llama
// [slug], aunque aquí el valor que se recibe realmente es el ID de la
// canción (ver los enlaces que apuntan a /canciones/{song.id}/editar).
export default async function EditSongPage({ params }: { params: { slug: string } }) {
  const songId = params.slug;
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: song } = await supabase.from('songs').select('*, artists(name)').eq('id', songId).single();
  if (!song) notFound();

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isOwnerOrModerator = song.created_by === user.id || ['moderator', 'admin'].includes(profile?.role || '');
  const { data: canSetPrivateResult } = await (supabase as any).rpc('song_can_be_private', {
    target_song_id: song.id
  });
  const canSetPrivate = Boolean(canSetPrivateResult);

  return (
    <SongEditForm
      songId={song.id}
      slug={song.slug}
      isOwnerOrModerator={isOwnerOrModerator}
      initialContent={song.content}
      initialTitle={song.title}
      initialArtistName={(song as any).artists?.name || ''}
      initialKey={song.detected_key || song.original_key || ''}
      initialVisibility={song.visibility === 'private' ? 'private' : 'public'}
      canSetPrivate={canSetPrivate}
    />
  );
}
