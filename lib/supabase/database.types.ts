/**
 * Tipos generados de la base de datos Supabase.
 *
 * Este archivo es un placeholder mínimo para que el proyecto compile
 * localmente sin necesitar una instancia de Supabase ya desplegada.
 *
 * Una vez que hayas aplicado las migraciones en tu proyecto de Supabase,
 * regenera este archivo con el tipado real ejecutando:
 *
 *   npx supabase gen types typescript --project-id <tu-project-id> > lib/supabase/database.types.ts
 *
 * o, si usas Supabase local:
 *
 *   npx supabase gen types typescript --local > lib/supabase/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> }>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'visitor' | 'user' | 'moderator' | 'admin';
      song_visibility: 'public' | 'private' | 'link_only';
      song_status: 'draft' | 'pending_review' | 'published' | 'reported' | 'archived';
      setlist_status: 'draft' | 'confirmed' | 'finished' | 'archived';
      setlist_visibility: 'private' | 'link_only' | 'public';
    };
  };
}
