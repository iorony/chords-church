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

type SerperOrganicResult = { title?: string; link?: string; snippet?: string };

class SerperSearchProvider implements SongSearchProvider {
  name = 'serper';
  canImport = false;

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<ExternalSongResult[]> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': this.apiKey },
      body: JSON.stringify({ q: `${query} letra acordes canción`, gl: 'gt', hl: 'es', num: 10 }),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Serper respondió con estado ${response.status}.`);

    const payload = (await response.json()) as { organic?: SerperOrganicResult[] };
    const retrievedAt = new Date().toISOString();
    return (payload.organic ?? []).flatMap((result, index) => {
      if (!result.title || !result.link) return [];
      const hasChords = /acorde|chord/i.test(`${result.title} ${result.snippet ?? ''}`);
      return [{
        externalId: `serper-${index}-${result.link}`,
        title: result.title,
        snippet: result.snippet ?? 'Resultado externo relacionado con la canción.',
        source: 'Google mediante Serper',
        url: result.link,
        contentType: hasChords ? 'chords' as const : 'unknown' as const,
        hasChords,
        canImport: false,
        retrievedAt
      }];
    });
  }
}

function getEnabledProviders(configuredProvider?: string | null): SongSearchProvider[] {
  const configured = (configuredProvider || process.env.SEARCH_PROVIDER)?.trim().toLowerCase();
  const apiKey = process.env.SEARCH_API_KEY?.trim();
  if (!configured || !apiKey) {
    return [new UnconfiguredSearchProvider()];
  }
  // Punto de extensión: agregar aquí proveedores reales cuando se
  // configuren credenciales, por ejemplo:
  // if (configured === 'algun_proveedor') return [new AlgunProveedorSearchProvider()];
  if (configured === 'serper') return [new SerperSearchProvider(apiKey)];
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
  const { data: searchSetting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'search_provider')
    .maybeSingle();
  const setting = searchSetting?.value as { enabled?: boolean; provider?: string | null } | null;
  if (setting?.enabled === false) {
    return { results: [], fromCache: false, searchEnabled: false };
  }

  const providers = getEnabledProviders(setting?.provider);
  const searchEnabled = !providers.every((p) => p.name === 'unconfigured');

  if (!searchEnabled) {
    return { results: [], fromCache: false, searchEnabled: false };
  }

  const { data: cached } = await supabase
    .from('external_search_cache')
    .select('*')
    .eq('query', query)
    .eq('provider', providers.map((p) => p.name).join(','))
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
