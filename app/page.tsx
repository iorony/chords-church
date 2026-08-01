import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = createServerSupabaseClient();
  const { data: recentSongs } = await supabase
    .from('songs')
    .select('id, title, slug, detected_key, original_key, artists(name)')
    .eq('visibility', 'public')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(8);

  return (
    <div className="space-y-10">
      <section className="text-center py-6 sm:py-10">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">Canciones y acordes para tu iglesia</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto mb-6">
          Estructura tus canciones con ayuda de IA, cambia el tono al instante, arma tu repertorio y
          proyéctalo en modo presentación.
        </p>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link href="/canciones/nueva" className="bg-primary text-white px-5 py-2.5 rounded-md hover:bg-primary-light">
            Agregar canción
          </Link>
          <Link href="/canciones" className="border border-gray-300 dark:border-gray-700 px-5 py-2.5 rounded-md">
            Explorar canciones
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Agregadas recientemente</h2>
        {!recentSongs || recentSongs.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Aún no hay canciones públicas. Sé el primero en agregar una.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentSongs.map((song: any) => (
              <Link
                key={song.id}
                href={`/canciones/${song.slug}`}
                className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-primary transition-colors"
              >
                <div className="font-medium">{song.title}</div>
                <div className="text-xs text-gray-500 mt-1">{song.artists?.name || 'Artista desconocido'}</div>
                <div className="text-xs text-accent-teal mt-2">
                  Tono {song.detected_key || song.original_key || '—'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
