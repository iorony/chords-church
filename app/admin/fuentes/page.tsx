import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AdminSourcesPage() {
  const supabase = createServerSupabaseClient();
  const { data: sources } = await supabase.from('external_sources').select('*').order('name');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fuentes externas de búsqueda</h1>
      <div className="bg-accent-gold/10 border border-accent-gold rounded-md p-4 text-sm max-w-2xl">
        La búsqueda web (sección 19 del diseño) está implementada como una interfaz de proveedores
        (<code>SongSearchProvider</code> en <code>lib/services/external-search-service.ts</code>) pero sin
        ningún proveedor real conectado todavía, para no hacer scraping no autorizado. Para activarla,
        implementa un proveedor concreto contra una API de búsqueda autorizada o un catálogo con permiso de
        uso, y configura <code>SEARCH_PROVIDER</code> / <code>SEARCH_API_KEY</code>.
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-gray-200 dark:border-gray-800">
            <th className="py-2 pr-4">Nombre</th>
            <th className="py-2 pr-4">Puede importar</th>
            <th className="py-2 pr-4">Habilitada</th>
          </tr>
        </thead>
        <tbody>
          {sources?.map((s) => (
            <tr key={s.id} className="border-b border-gray-100 dark:border-gray-900">
              <td className="py-2 pr-4">{s.name}</td>
              <td className="py-2 pr-4">{s.can_import ? 'Sí' : 'No'}</td>
              <td className="py-2 pr-4">{s.is_enabled ? 'Sí' : 'No'}</td>
            </tr>
          ))}
          {(!sources || sources.length === 0) && (
            <tr>
              <td colSpan={3} className="py-4 text-gray-500 text-center">
                No hay fuentes configuradas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
