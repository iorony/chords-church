'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para uso en Client Components. Usa siempre la clave anónima.
 *
 * NOTA SOBRE TIPOS: hasta que generes los tipos reales de tu base de datos con
 *   npx supabase gen types typescript --project-id <tu-project-id> > lib/supabase/database.types.ts
 * este cliente no está tipado genéricamente (equivalente a Database = any) para
 * evitar falsos errores de compilación con el placeholder de tipos. Una vez que
 * generes database.types.ts con el esquema real, puedes tipar el cliente así:
 *   createBrowserClient<Database>(url, key)
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
