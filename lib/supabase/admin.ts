import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente administrativo con service_role. OMITE Row Level Security.
 *
 * REGLAS DE USO:
 * - Nunca importar este archivo desde un Client Component ('use client').
 * - Usar únicamente dentro de Route Handlers / Server Actions que ya
 *   validaron manualmente el rol del usuario (admin/moderador) antes de
 *   llamar a estas funciones.
 * - La import 'server-only' hace que el build falle si accidentalmente
 *   se importa desde código de cliente.
 *
 * Ver nota sobre tipado en lib/supabase/client.ts.
 */
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
