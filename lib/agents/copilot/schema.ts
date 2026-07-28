import { z } from 'zod'

/**
 * What the Officer Copilot must produce (M8). It drafts from findings it may
 * not contradict, and omits rather than fills where it lacks grounding.
 */
export const CopilotResult = z.object({
  brief_md: z.string().min(1),
  risk_rank: z.enum(['low', 'medium', 'high']),
  letter_md: z.string().min(1),
  suggested_conditions: z.array(
    z.object({ rule_id: z.string(), condition: z.string() }),
  ),
})
export type CopilotResult = z.infer<typeof CopilotResult>
