import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type RecentSong = {
  id: string;
  title: string;
  slug: string;
  detected_key: string | null;
  original_key: string | null;
  artists: { name: string } | { name: string }[] | null;
};

const FEATURES = [
  { number: '01', title: 'Ordena en segundos', description: 'Pega la letra y obtén una estructura clara, lista para ensayar.' },
  { number: '02', title: 'Transpón sin errores', description: 'Cambia el tono al instante y conserva acordes y letra alineados.' },
  { number: '03', title: 'Dirige con confianza', description: 'Arma repertorios y presenta cada canción con una vista limpia.' }
];

export default async function HomePage() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('songs')
    .select('id, title, slug, detected_key, original_key, artists(name)')
    .eq('visibility', 'public')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(6);
  const recentSongs = (data ?? []) as RecentSong[];

  return (
    <div className="home-shell">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="page-eyebrow">Cancionero para equipos de alabanza</p>
          <h1>Menos tiempo editando.<br /><span>Más tiempo adorando.</span></h1>
          <p className="home-lead">
            Organiza canciones, ajusta acordes y prepara el repertorio del domingo
            en un solo lugar, desde cualquier dispositivo.
          </p>
          <div className="home-actions">
            <Link href="/canciones/nueva" className="btn-primary">Agregar una canción <span aria-hidden="true">→</span></Link>
            <Link href="/canciones" className="btn-secondary">Explorar el catálogo</Link>
          </div>
          <p className="home-helper">Gratis para comenzar · Diseñado para músicos y líderes</p>
        </div>

        <div className="home-demo" aria-label="Vista previa de una canción">
          <div className="home-demo-top">
            <span className="home-demo-mark" aria-hidden="true">♪</span>
            <div><strong>Tu fidelidad</strong><small>Equipo de alabanza</small></div>
            <span className="home-key">Tono G</span>
          </div>
          <div className="home-song-lines" aria-hidden="true">
            <p><b>G</b><b>D/F#</b><b>Em7</b><b>C</b></p>
            <p>Grande es tu fidelidad</p>
            <p><b>G</b><b>D</b><b>C</b></p>
            <p>Nunca me dejarás</p>
          </div>
          <div className="home-demo-bottom">
            <span>–</span><strong>G</strong><span>+</span><span className="home-demo-spacer" /><span>Presentar</span><span aria-hidden="true">↗</span>
          </div>
        </div>
      </section>

      <section className="home-features" aria-labelledby="features-title">
        <div><p className="page-eyebrow">Un flujo sencillo</p><h2 id="features-title">Del borrador al escenario</h2></div>
        <div className="home-feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.number}>
              <span>{feature.number}</span><h3>{feature.title}</h3><p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-recent" aria-labelledby="recent-title">
        <div className="home-section-heading">
          <div><p className="page-eyebrow">Catálogo de la comunidad</p><h2 id="recent-title">Canciones recientes</h2></div>
          <Link href="/canciones">Ver todas <span aria-hidden="true">→</span></Link>
        </div>
        {recentSongs.length === 0 ? (
          <div className="home-empty"><span aria-hidden="true">♫</span><div><h3>El repertorio empieza contigo</h3><p>Agrega la primera canción y déjala lista para tu equipo.</p></div><Link href="/canciones/nueva" className="btn-secondary">Agregar canción</Link></div>
        ) : (
          <div className="home-song-grid">
            {recentSongs.map((song) => {
              const artist = Array.isArray(song.artists) ? song.artists[0]?.name : song.artists?.name;
              return <Link key={song.id} href={`/canciones/${song.slug}`}><span className="home-song-icon" aria-hidden="true">♪</span><span><strong>{song.title}</strong><small>{artist || 'Artista desconocido'}</small></span><em>{song.detected_key || song.original_key || '—'}</em></Link>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
