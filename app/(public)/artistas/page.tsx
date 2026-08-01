import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function ArtistsPage() {
  const supabase = createServerSupabaseClient();
  const { data: artists } = await supabase.from('artists').select('id, name, slug').order('name');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Artistas</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {artists?.map((a) => (
          <Link
            key={a.id}
            href={`/artistas/${a.slug}`}
            className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 text-center hover:border-primary"
          >
            {a.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
