import { createServerSupabaseClient } from '@/lib/supabase/server';
import { searchExternalSongs } from '@/lib/services/external-search-service';

export default async function WebSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q?.trim() || '';
  const supabase = createServerSupabaseClient();

  const { results, searchEnabled } = query
    ? await searchExternalSongs(supabase, query)
    : { results: [], searchEnabled: false };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Buscar en la web</h1>
      <form className="flex flex-col gap-2 max-w-lg sm:flex-row">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Nombre de la canción o artista..."
          className="border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2 flex-1"
        />
        <button className="bg-primary text-white px-4 py-2 rounded-md">Buscar</button>
      </form>

      {!searchEnabled && (
        <div className="bg-accent-gold/10 border border-accent-gold rounded-md p-4 text-sm">
          La búsqueda web todavía no está configurada en este proyecto. Un administrador debe habilitar un
          proveedor de búsqueda autorizado en <code>/admin/fuentes</code> y las variables{' '}
          <code>SEARCH_PROVIDER</code> / <code>SEARCH_API_KEY</code>. Mientras tanto, puedes agregar una
          canción manualmente pegando contenido que tengas autorización de usar.
        </div>
      )}

      {searchEnabled && query && results.length === 0 && (
        <p className="text-gray-500 text-sm">Sin resultados externos para &quot;{query}&quot;.</p>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <div key={r.externalId} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <div className="font-medium">{r.title}</div>
            {r.artist && <div className="text-sm text-gray-500">{r.artist}</div>}
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{r.snippet}</p>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
              <span>
                Fuente: {r.source} · consultado {new Date(r.retrievedAt).toLocaleDateString('es-GT')}
              </span>
              <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline">
                Ver original
              </a>
            </div>
            {!r.canImport && (
              <p className="text-xs text-gray-400 mt-1">
                Esta fuente no permite importación automática. Copia el contenido solo si tienes autorización, y
                pégalo en &quot;Agregar canción&quot; — pasará por el mismo proceso de revisión con IA.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
