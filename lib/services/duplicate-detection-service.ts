import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';
import { normalizeText, jaccardSimilarity } from './text-utils';

export interface DuplicateCandidate {
  id: string;
  title: string;
  artist: string | null;
  slug: string;
  similarity: number;
  reason: 'title_artist' | 'content';
}

function normalizedArtist(value?: string | null): string {
  return normalizeText(value || '');
}

/**
 * Detecta canciones duplicadas antes de crear o editar.
 *
 * Se considera duplicado cuando:
 * - coinciden exactamente título y artista normalizados; o
 * - la letra/contenido tiene una similitud muy alta (>= 0.84), siempre que el artista también coincida.
 *
 * El artista es obligatorio en el formulario. Una canción con el mismo título
 * o una letra parecida, pero atribuida a otro artista, se considera una versión
 * distinta y no bloquea la creación.
 */
export async function findSongDuplicates(
  supabase: SupabaseClient,
  input: { title: string; artist?: string | null; content: string; excludeId?: string }
): Promise<DuplicateCandidate[]> {
  const title = normalizeText(input.title);
  const artist = normalizedArtist(input.artist);
  const excludeId = input.excludeId || '00000000-0000-0000-0000-000000000000';

  const { data, error } = await supabase
    .from('songs')
    .select('id, title, slug, normalized_title, content, artist_id, artists(name)')
    .eq('is_deleted', false)
    .neq('id', excludeId)
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  const duplicates: DuplicateCandidate[] = [];

  for (const row of data || []) {
    const relatedArtist = Array.isArray((row as any).artists)
      ? (row as any).artists[0]?.name
      : (row as any).artists?.name;
    const candidateArtist = normalizedArtist(relatedArtist);
    const candidateTitle = normalizeText((row as any).normalized_title || row.title);
    const contentSimilarity = jaccardSimilarity(input.content, row.content || '');

    const exactTitle = Boolean(title) && candidateTitle === title;
    const sameArtist = artist ? candidateArtist === artist : !candidateArtist;
    const titleArtistDuplicate = exactTitle && sameArtist;
    // La coincidencia de artista es obligatoria para cualquier tipo de duplicado.
    // Esto permite registrar versiones o interpretaciones de la misma canción
    // cuando pertenecen a artistas distintos.
    const contentDuplicate = sameArtist && contentSimilarity >= 0.84;

    if (!titleArtistDuplicate && !contentDuplicate) continue;

    duplicates.push({
      id: row.id,
      title: row.title,
      artist: relatedArtist || null,
      slug: row.slug,
      similarity: titleArtistDuplicate ? 1 : contentSimilarity,
      reason: titleArtistDuplicate ? 'title_artist' : 'content'
    });
  }

  return duplicates
    .sort((a, b) => b.similarity - a.similarity)
    .filter((candidate, index, list) => list.findIndex((item) => item.id === candidate.id) === index)
    .slice(0, 5);
}
