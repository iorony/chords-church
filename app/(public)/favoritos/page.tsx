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
    <div className="favorites-page">
      <header className="favorites-hero">
        <div>
          <span className="favorites-eyebrow">Tu biblioteca personal</span>
          <h1>Favoritos</h1>
          <p>Las canciones que quieres tener siempre a mano, guardadas en tu tono preferido.</p>
        </div>
        <div className="favorites-count" aria-label={`${favorites?.length || 0} canciones favoritas`}>
          <span aria-hidden="true">♥</span>
          <strong>{favorites?.length || 0}</strong>
          <small>canciones</small>
        </div>
      </header>
      {(!favorites || favorites.length === 0) && (
        <div className="favorites-empty">
          <span className="favorites-empty-icon" aria-hidden="true">♪</span>
          <h2>Aún no tienes favoritos</h2>
          <p>Explora el cancionero y guarda las canciones que utilizas con frecuencia.</p>
          <Link href="/canciones" className="favorites-browse">Explorar canciones</Link>
        </div>
      )}
      <div className="favorites-grid">
        {favorites?.map((f: any, index: number) => (
          <Link
            key={f.songs.id}
            href={`/canciones/${f.songs.slug}`}
            className="favorite-card"
          >
            <div className="favorite-card-top">
              <span className="favorite-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="favorite-heart" aria-hidden="true">♥</span>
            </div>
            <div className="favorite-card-body">
              <h2>{f.songs.title}</h2>
              <span className="favorite-open">Abrir canción <span aria-hidden="true">→</span></span>
            </div>
            <div className="favorite-key">
              <span>Tono preferido</span>
              <strong>{f.preferred_key || f.songs.detected_key || f.songs.original_key || '—'}</strong>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
