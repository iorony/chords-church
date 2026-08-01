import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { findSongDuplicates } from '@/lib/services/duplicate-detection-service';

const RequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  content: z.string().max(30000).optional().default(''),
  promote: z.boolean().optional().default(false),
  excludeId: z.string().uuid().optional()
});

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos para comprobar duplicados.' }, { status: 400 });
  }

  try {
    // Primero busca una coincidencia exacta mediante una función SECURITY DEFINER.
    // Esto permite detectar una canción privada que el usuario aún no puede ver.
    // La función conserva la privacidad si el acceso proviene de una lista compartida;
    // de lo contrario, la publica automáticamente para evitar copias paralelas.
    if (!parsed.data.excludeId) {
      const rpcName = parsed.data.promote
        ? 'resolve_existing_song_for_creation'
        : 'preview_existing_song_for_creation';

      const { data: resolved, error: resolveError } = await (supabase as any).rpc(
        rpcName,
        {
          requested_title: parsed.data.title,
          requested_artist: parsed.data.artist,
          requested_content: parsed.data.content || null
        }
      );

      if (resolveError) {
        console.error(`[songs/duplicates:${rpcName}]`, resolveError);
        const message = String(resolveError.message || '');
        const setupProblem =
          message.includes('Could not find the function') ||
          message.includes('schema cache') ||
          message.includes('PGRST202') ||
          message.includes('42883');

        return NextResponse.json(
          {
            error: setupProblem
              ? 'La detección de canciones privadas no está instalada o Supabase aún no actualizó su caché. Ejecuta las migraciones de Supabase hasta la 0012 (inclusive) y vuelve a intentarlo.'
              : `No se pudo comprobar la canción existente: ${message || 'error de base de datos'}.`
          },
          { status: 500 }
        );
      }

      const exactMatch = Array.isArray(resolved) ? resolved[0] : resolved;
      if (exactMatch?.id) {
        return NextResponse.json({
          duplicate: true,
          duplicates: [
            {
              id: exactMatch.id,
              title: exactMatch.title,
              artist: exactMatch.artist || null,
              slug: exactMatch.slug,
              similarity: Number(exactMatch.match_score ?? 1),
              reason: exactMatch.match_reason || 'title_artist',
              visibility: exactMatch.visibility,
              promotedToPublic: Boolean(exactMatch.promoted_to_public),
              sharedListAccess: Boolean(exactMatch.shared_list_access),
              canProposeCorrection: exactMatch.visibility === 'public' || Boolean(exactMatch.promoted_to_public)
            }
          ]
        });
      }
    }

    if (!parsed.data.content.trim()) {
      return NextResponse.json({ duplicate: false, duplicates: [] });
    }

    const duplicates = await findSongDuplicates(supabase, parsed.data);
    return NextResponse.json({ duplicate: duplicates.length > 0, duplicates });
  } catch (error: any) {
    console.error('[songs/duplicates]', error?.message || error);
    return NextResponse.json({ error: 'No se pudo comprobar si la canción ya existe.' }, { status: 500 });
  }
}
