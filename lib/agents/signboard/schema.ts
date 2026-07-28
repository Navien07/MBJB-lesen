import { z } from 'zod'

/**
 * What the Signboard Analysis agent must produce (M6). Measurement only —
 * it never judges compliance; the rule engine does that (§1.2).
 */
export const SignboardResult = z.object({
  runs: z.array(
    z.object({
      text: z.string(),
      script: z.string(),
      language: z.string(),
      role: z.enum(['business_name', 'business_name_other_script', 'activity', 'other']),
      relative_glyph_height: z.number().positive(),
      bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  has_trademark_logo_label_or_slogan: z.boolean().nullable(),
  overall_confidence: z.number().min(0).max(1),
  notes: z.string().default(''),
})
export type SignboardResult = z.infer<typeof SignboardResult>
