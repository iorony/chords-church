import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) {
    return NextResponse.json({ songs: [] });
  }

  const { data, error } = await (supabase as any).rpc('search_song_catalog', {
    search_query: query,
    result_limit: 24
  });

  if (error) {
    console.error('[songs/search]', error);
    const message = String(error.message || '');
    const setupProblem =
      message.includes('Could not find the function') ||
      message.includes('schema cache') ||
      message.includes('PGRST202') ||
      message.includes('42883');

    return NextResponse.json(
      {
        error: setupProblem
          ? 'La búsqueda ampliada no está instalada. Ejecuta la migración 0013 en Supabase.'
          : `No se pudo buscar canciones: ${message || 'error de base de datos'}.`
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ songs: data ?? [] });
}
