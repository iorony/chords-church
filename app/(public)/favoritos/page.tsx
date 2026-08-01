import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function FavoritesPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/favoritos');

  const { data: favorites } = await supabase
    .from('song_favorites')
    .select('preferred_key, songs(id, title, slug, detected_key, original_key)')
    .eq('user_id', user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Favoritos</h1>
      {(!favorites || favorites.length === 0) && (
        <p className="text-gray-500 text-sm">Aún no tienes canciones favoritas.</p>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {favorites?.map((f: any) => (
          <Link
            key={f.songs.id}
            href={`/canciones/${f.songs.slug}`}
            className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-primary"
          >
            <div className="font-medium">{f.songs.title}</div>
            <div className="text-xs text-accent-teal mt-2">
              Tono preferido: {f.preferred_key || f.songs.detected_key || f.songs.original_key || '—'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
