import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { exportSongToDocx, exportSetlistToDocx } from '@/lib/services/export-docx-service';
import { transposeSongContent, semitoneDifference } from '@/lib/chords/transposition';
import { buildSetlistExportFilename, contentDisposition } from '@/lib/services/export-filename';

const RequestSchema = z.object({
  scope: z.enum(['song', 'setlist']),
  scopeId: z.string().uuid()
});

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión para exportar.' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { scope, scopeId } = parsed.data;

  try {
    if (scope === 'song') {
      const { data: song, error } = await supabase.from('songs').select('*, artists(name)').eq('id', scopeId).single();
      if (error || !song) return NextResponse.json({ error: 'Canción no encontrada.' }, { status: 404 });

      const buffer = await exportSongToDocx({
        title: song.title,
        artist: (song as any).artists?.name,
        displayKey: song.detected_key || song.original_key,
        content: song.content
      });

      await supabase.from('exports').insert({
        requested_by: user.id,
        export_type: 'docx',
        scope: 'song',
        scope_id: scopeId,
        status: 'ready'
      });

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${song.slug}.docx"`
        }
      });
    }

    const { data: setlist, error: setlistError } = await supabase.from('setlists').select('*').eq('id', scopeId).single();
    if (setlistError || !setlist) return NextResponse.json({ error: 'Repertorio no encontrado.' }, { status: 404 });

    const { data: items, error: itemsError } = await supabase
      .from('setlist_items')
      .select('*, songs(*, artists(name))')
      .eq('setlist_id', scopeId)
      .order('position', { ascending: true });
    if (itemsError) return NextResponse.json({ error: 'No se pudieron cargar las canciones del repertorio.' }, { status: 500 });

    const songs = (items || []).map((item: any) => {
      const song = item.songs;
      const baseKey = song.detected_key || song.original_key || 'C';
      const targetKey = item.selected_key || baseKey;
      const semitones = semitoneDifference(baseKey, targetKey);
      const content = semitones !== 0 ? transposeSongContent(song.content, { semitones }) : song.content;
      return {
        title: song.title,
        artist: song.artists?.name || undefined,
        displayKey: targetKey,
        capo: item.capo,
        content,
        notes: item.private_notes
      };
    });

    const buffer = await exportSetlistToDocx({
      name: setlist.name,
      eventDate: setlist.event_date,
      location: setlist.location,
      songs,
      includeCoverPage: true,
      includeIndex: true
    });

    await supabase.from('exports').insert({
      requested_by: user.id,
      export_type: 'docx',
      scope: 'setlist',
      scope_id: scopeId,
      status: 'ready'
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': contentDisposition(
          buildSetlistExportFilename({ name: setlist.name, eventDate: setlist.event_date, location: setlist.location }),
          'docx'
        )
      }
    });
  } catch (err) {
    return NextResponse.json({ error: 'Error generando el DOCX.', details: String(err) }, { status: 500 });
  }
}
