import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function ArtistPage({ params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: artist } = await supabase.from('artists').select('*').eq('slug', params.slug).single();
  if (!artist) notFound();

  const { data: songs } = await supabase
    .from('songs')
    .select('id, title, slug, detected_key, original_key')
    .eq('artist_id', artist.id)
    .eq('visibility', 'public')
    .eq('status', 'published');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{artist.name}</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {songs?.map((s) => (
          <Link key={s.id} href={`/canciones/${s.slug}`} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-primary">
            <div className="font-medium">{s.title}</div>
            <div className="text-xs text-accent-teal mt-2">Tono {s.detected_key || s.original_key || '—'}</div>
          </Link>
        ))}
        {(!songs || songs.length === 0) && <p className="text-gray-500 text-sm">Sin canciones publicadas todavía.</p>}
      </div>
    </div>
  );
}
