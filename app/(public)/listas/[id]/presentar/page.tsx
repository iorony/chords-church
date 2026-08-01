export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import PresentationMode from '@/components/song/PresentationMode';

export default async function PresentSetlistPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/listas/${params.id}/presentar`);

  const { data: setlist } = await supabase.from('setlists').select('*').eq('id', params.id).single();
  if (!setlist) notFound();

  const { data: items } = await supabase
    .from('setlist_items')
    .select('*, songs(title, content, detected_key, original_key, artists(name))')
    .eq('setlist_id', params.id)
    .order('position', { ascending: true });

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Esta lista no tiene canciones todavía.</p>
      </div>
    );
  }

  const songs = items.map((item: any) => {
    const baseKey = item.songs.detected_key || item.songs.original_key || 'C';
    return {
      title: item.songs.title,
      artist: item.songs.artists?.name || 'Artista desconocido',
      baseKey,
      selectedKey: item.selected_key || baseKey,
      capo: item.capo || 0,
      content: item.songs.content as string
    };
  });

  return <PresentationMode songs={songs} />;
}
