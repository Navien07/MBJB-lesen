'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { writeAudit } from '@/lib/audit'
import { requireOfficer } from '@/lib/auth'
import { supabaseServer } from '@/lib/supabase/server'

export interface OfficerActionState {
  error: string | null
}

export async function startReview(formData: FormData): Promise<void> {
  const session = await requireOfficer()
  const applicationId = String(formData.get('applicationId') ?? '')
  const supabase = await supabaseServer()

  const { data, error } = await supabase
    .from('applications')
    .update({ status: 'OFFICER_REVIEW' })
    .eq('id', applicationId)
    .eq('status', 'ASSESSED')
    .select('id')
  if (error || !data?.length) throw new Error(error?.message ?? 'case is not ASSESSED')

  await writeAudit(supabase, {
    application_id: applicationId,
    actor_type: 'human',
    actor_id: session.userId,
    action: 'review.started',
  })
  revalidatePath(`/officer/cases/${applicationId}`)
}

const OverrideInput = z.object({
  applicationId: z.uuid(),
  findingId: z.uuid(),
  ruleId: z.string().min(1),
  fromStatus: z.string().min(1),
  toStatus: z.enum(['acceptable', 'not_acceptable']),
  reason: z
    .string()
    .trim()
    .min(10, 'A written reason of at least 10 characters is required to override a finding.'),
})

export async function overrideFinding(
  _prev: OfficerActionState,
  formData: FormData,
): Promise<OfficerActionState> {
  const session = await requireOfficer()
  const parsed = OverrideInput.safeParse({
    applicationId: formData.get('applicationId'),
    findingId: formData.get('findingId'),
    ruleId: formData.get('ruleId'),
    fromStatus: formData.get('fromStatus'),
    toStatus: formData.get('toStatus'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid override' }
  }

  const supabase = await supabaseServer()
  // the finding row itself is never mutated — the override lives in the
  // append-only audit log, which is also what the dashboard measures
  await writeAudit(supabase, {
    application_id: parsed.data.applicationId,
    actor_type: 'human',
    actor_id: session.userId,
    action: 'finding.overridden',
    detail: {
      finding_id: parsed.data.findingId,
      rule_id: parsed.data.ruleId,
      from_status: parsed.data.fromStatus,
      to_status: parsed.data.toStatus,
      reason: parsed.data.reason,
    },
  })

  revalidatePath(`/officer/cases/${parsed.data.applicationId}`)
  return { error: null }
}

const DecisionInput = z.object({
  applicationId: z.uuid(),
  outcome: z.enum(['APPROVED', 'APPROVED_WITH_CONDITIONS', 'AMENDMENT_REQUESTED', 'REJECTED']),
  letter: z.string().trim().min(20, 'The decision letter cannot be empty.'),
  conditions: z.string().default(''),
})

export async function decide(
  _prev: OfficerActionState,
  formData: FormData,
): Promise<OfficerActionState> {
  const session = await requireOfficer()
  const parsed = DecisionInput.safeParse({
    applicationId: formData.get('applicationId'),
    outcome: formData.get('outcome'),
    letter: formData.get('letter'),
    conditions: formData.get('conditions'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid decision' }
  }

  const supabase = await supabaseServer()
  const conditions = parsed.data.conditions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ruleId, ...rest] = line.split('::')
      return { rule_id: ruleId.trim(), condition: rest.join('::').trim() }
    })

  const { error: decisionError } = await supabase.from('decisions').insert({
    application_id: parsed.data.applicationId,
    officer_id: session.userId,
    outcome: parsed.data.outcome,
    conditions,
    letter_md: parsed.data.letter,
  })
  if (decisionError) return { error: `decision write failed: ${decisionError.message}` }

  // the trigger enforces: human officer, and only from OFFICER_REVIEW
  const { data: updated, error: statusError } = await supabase
    .from('applications')
    .update({ status: parsed.data.outcome })
    .eq('id', parsed.data.applicationId)
    .select('status')
  if (statusError || !updated?.length) {
    return { error: `status transition failed: ${statusError?.message ?? 'not in OFFICER_REVIEW'}` }
  }

  await writeAudit(supabase, {
    application_id: parsed.data.applicationId,
    actor_type: 'human',
    actor_id: session.userId,
    action: 'decision.recorded',
    detail: { outcome: parsed.data.outcome, conditions },
  })

  revalidatePath(`/officer/cases/${parsed.data.applicationId}`)
  return { error: null }
}
