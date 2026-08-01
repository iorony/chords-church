import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transposeSongContent, semitoneDifference } from '@/lib/chords/transposition';

const RequestSchema = z.object({
  content: z.string().min(1),
  fromKey: z.string().optional(),
  toKey: z.string().optional(),
  semitones: z.number().int().optional()
});

/**
 * La transposición también se puede (y normalmente se debe) hacer
 * enteramente en el cliente para que sea instantánea, ya que
 * transposeSongContent es una función pura sin dependencias del
 * servidor. Este endpoint existe para integraciones externas o
 * exportación server-side.
 *
 * La salida siempre usa la notación general fija de la app (ver
 * lib/chords/types.ts → CHROMATIC_GENERAL): no se puede pedir "todo
 * sostenidos" ni "todo bemoles".
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { content, fromKey, toKey, semitones } = parsed.data;
  const resolvedSemitones = semitones ?? (fromKey && toKey ? semitoneDifference(fromKey, toKey) : 0);

  const transposed = transposeSongContent(content, { semitones: resolvedSemitones });
  return NextResponse.json({ content: transposed, semitones: resolvedSemitones });
}
