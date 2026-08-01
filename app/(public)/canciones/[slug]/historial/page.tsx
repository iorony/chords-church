import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import VersionHistory from '@/components/song/VersionHistory';

// Mismo patrón que /canciones/[slug]/editar: este segmento recibe el ID
// de la canción, no su slug real (ver la nota en esa página).
export default async function SongHistoryPage({ params }: { params: { slug: string } }) {
  const songId = params.slug;
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: song } = await supabase.from('songs').select('id, slug, title, created_by').eq('id', songId).single();
  if (!song) notFound();

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isOwnerOrModerator = song.created_by === user.id || ['moderator', 'admin'].includes(profile?.role || '');

  const { data: versionsRaw } = await supabase
    .from('song_versions')
    .select('id, version_number, content, key, change_summary, created_at, is_current, profiles(display_name)')
    .eq('song_id', song.id)
    .order('version_number', { ascending: false });

  const versions = (versionsRaw || []).map((v: any) => ({
    id: v.id,
    version_number: v.version_number,
    content: v.content,
    key: v.key,
    change_summary: v.change_summary,
    created_at: v.created_at,
    is_current: v.is_current,
    author_name: v.profiles?.display_name ?? null
  }));

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/canciones/${song.slug}`} className="text-sm text-gray-500 hover:text-primary">
          ← Volver a {song.title}
        </Link>
        <h1 className="text-2xl font-bold mt-1">Historial de versiones</h1>
      </div>
      <VersionHistory songId={song.id} slug={song.slug} canRestore={isOwnerOrModerator} versions={versions} />
    </div>
  );
}
