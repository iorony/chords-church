import { z } from 'zod';

/** Esquema de la respuesta estructurada que debe devolver cualquier proveedor de IA */
export const AiSectionSchema = z.object({
  type: z.enum([
    'INTRO', 'VERSE', 'PRECHORUS', 'CHORUS', 'POSTCHORUS', 'BRIDGE',
    'INTERLUDE', 'INSTRUMENTAL', 'SOLO', 'SPONTANEOUS', 'FINAL_CHORUS',
    'OUTRO', 'END', 'UNKNOWN'
  ]),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  content: z.string()
});

export const AiReviewResponseSchema = z.object({
  detectedTitle: z.string().nullable().default(null),
  detectedArtist: z.string().nullable().default(null),
  detectedArtistConfidence: z.number().min(0).max(1).default(0),
  artistAlternatives: z.array(z.object({ name: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  detectedKey: z.string().min(1),
  keyConfidence: z.number().min(0).max(1),
  hasModulation: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
  corrections: z
    .array(
      z.object({
        original: z.string(),
        corrected: z.string(),
        reason: z.string().optional()
      })
    )
    .default([]),
  sections: z.array(AiSectionSchema).min(1)
});

export type AiReviewResponse = z.infer<typeof AiReviewResponseSchema>;
