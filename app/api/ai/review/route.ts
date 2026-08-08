import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reviewSongLocally, reviewSongWithAi } from '@/lib/services/ai-review-service';

const RequestSchema = z.object({
  title: z.string().max(200).optional(),
  artist: z.string().max(200).optional(),
  mode: z.enum(['ai', 'local']).default('ai'),
  content: z.string().min(1, 'El contenido no puede estar vacío').max(20000, 'El contenido es demasiado largo')
});

const DEFAULT_DAILY_LIMIT_PER_USER = 30;

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Debes iniciar sesión para reestructurar canciones.' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.mode === 'local') {
    const { mode: _mode, ...songInput } = parsed.data;
    const local = reviewSongLocally(songInput);
    return NextResponse.json({ ...local, error: null });
  }

  // Límite diario simple contando registros de song_ai_reviews de las últimas 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('song_ai_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('requested_by', user.id)
    .gte('created_at', since);

  const { data: aiSetting } = await supabase.from('app_settings').select('value').eq('key', 'ai_provider').maybeSingle();
  const configuredLimit = Number((aiSetting?.value as any)?.daily_limit_per_user);
  const preferredProvider = typeof (aiSetting?.value as any)?.provider === 'string'
    ? (aiSetting?.value as any).provider
    : null;
  const dailyLimit = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.floor(configuredLimit)
    : DEFAULT_DAILY_LIMIT_PER_USER;

  if ((count ?? 0) >= dailyLimit) {
    return NextResponse.json(
      { error: `Alcanzaste el límite diario de ${dailyLimit} revisiones con IA. Intenta de nuevo mañana.` },
      { status: 429 }
    );
  }

  const { mode: _mode, ...songInput } = parsed.data;
  const { result, aiAvailable, providerName, error, alternateKey } = await reviewSongWithAi(songInput, preferredProvider);

  // Registrar la revisión (éxito o degradación) para auditoría y límites
  await supabase.from('song_ai_reviews').insert({
    requested_by: user.id,
    provider: providerName,
    model: process.env[`${providerName.toUpperCase()}_MODEL`] || 'desconocido',
    input_content: parsed.data.content,
    output_json: result,
    warnings: result.warnings,
    applied: false
  });

  return NextResponse.json({ result, aiAvailable, providerName, error: error ?? null, alternateKey });
}
