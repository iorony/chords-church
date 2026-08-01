import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const RequestSchema = z.object({
  canonicalSongId: z.string().uuid(),
  duplicateSongId: z.string().uuid()
});

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['moderator', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Solo un moderador o administrador puede fusionar canciones.' }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { canonicalSongId, duplicateSongId } = parsed.data;

  const { error } = await supabase.rpc('merge_duplicate_songs', {
    canonical_song_id: canonicalSongId,
    duplicate_song_id: duplicateSongId
  });

  if (error) {
    const missingFunction = /function .*merge_duplicate_songs.* does not exist/i.test(error.message);
    return NextResponse.json(
      {
        error: missingFunction
          ? 'La función de fusión no está instalada. Ejecuta supabase/migrations/0015_admin_merge_duplicate_songs.sql en Supabase.'
          : error.message
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
