import { NextRequest, NextResponse } from 'next/server';
import { searchExternalSongs } from '@/lib/services/external-search-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return NextResponse.json({ results: [], searchEnabled: false });

  try {
    return NextResponse.json(await searchExternalSongs(supabase, query));
  } catch (error) {
    console.error('[songs/external-search]', error);
    return NextResponse.json({ error: 'No se pudo consultar el proveedor externo.' }, { status: 502 });
  }
}
