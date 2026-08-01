import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

export interface ExternalSongResult {
  externalId: string;
  title: string;
  artist?: string;
  snippet: string;
  source: string;
  url: string;
  contentType: 'lyrics' | 'chords' | 'unknown';
  possibleKey?: string;
  hasChords: boolean;
  canImport: boolean;
  retrievedAt: string;
}

export interface ExternalSongDetails extends ExternalSongResult {
  fullContent?: string; // solo presente si canImport === true y la fuente lo autoriza
}

export interface SongSearchProvider {
  name: string;
  search(query: string): Promise<ExternalSongResult[]>;
  getDetails?(externalId: string): Promise<ExternalSongDetails>;
  canImport: boolean;
}

/**
 * Proveedor de ejemplo NO OPERATIVO: implementa la interfaz para que el
 * sistema quede desacoplado, pero no realiza ninguna llamada real hasta
 * que se configure un proveedor de búsqueda autorizado (ver SEARCH_PROVIDER
 * y SEARCH_API_KEY en .env). Esto evita hacer scraping no autorizado de
 * sitios de terceros y respeta robots.txt / términos de servicio.
 *
 * Para activar búsqueda web real, implementa este mismo contrato usando
 * una API de búsqueda autorizada (por ejemplo, una API de búsqueda web
 * comercial) o APIs públicas de catálogos musicales con permiso de uso,
 * y regístrala en `getEnabledProviders()`.
 */
class UnconfiguredSearchProvider implements SongSearchProvider {
  name = 'unconfigured';
  canImport = false;

  async search(_query: string): Promise<ExternalSongResult[]> {
    return [];
  }
}

function getEnabledProviders(): SongSearchProvider[] {
  const configured = process.env.SEARCH_PROVIDER;
  if (!configured || !process.env.SEARCH_API_KEY) {
    return [new UnconfiguredSearchProvider()];
  }
  // Punto de extensión: agregar aquí proveedores reales cuando se
  // configuren credenciales, por ejemplo:
  // if (configured === 'algun_proveedor') return [new AlgunProveedorSearchProvider()];
  return [new UnconfiguredSearchProvider()];
}

function dedupeResults(results: ExternalSongResult[]): ExternalSongResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.source}:${r.title.toLowerCase()}:${r.artist?.toLowerCase() ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const CACHE_TTL_DAYS = 7;

export async function searchExternalSongs(
  supabase: SupabaseClient,
  query: string
): Promise<{ results: ExternalSongResult[]; fromCache: boolean; searchEnabled: boolean }> {
  const providers = getEnabledProviders();
  const searchEnabled = !providers.every((p) => p.name === 'unconfigured');

  if (!searchEnabled) {
    return { results: [], fromCache: false, searchEnabled: false };
  }

  const { data: cached } = await supabase
    .from('external_search_cache')
    .select('*')
    .eq('query', query)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    return { results: cached.results as unknown as ExternalSongResult[], fromCache: true, searchEnabled: true };
  }

  const resultsPerProvider = await Promise.all(
    providers.map((p) =>
      p.search(query).catch(() => [] as ExternalSongResult[])
    )
  );
  const merged = dedupeResults(resultsPerProvider.flat());

  await supabase.from('external_search_cache').insert({
    query,
    provider: providers.map((p) => p.name).join(','),
    results: merged,
    expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  });

  return { results: merged, fromCache: false, searchEnabled: true };
}
