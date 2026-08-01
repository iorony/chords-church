import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Respeta RLS mediante la sesión del usuario (clave anónima +
 * cookies), nunca usa la service role key.
 *
 * Ver nota sobre tipado en lib/supabase/client.ts — tipar con <Database>
 * una vez que generes lib/supabase/database.types.ts con el esquema real.
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Se puede ignorar en Server Components de solo lectura
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // ignorar
          }
        }
      }
    }
  );
}
