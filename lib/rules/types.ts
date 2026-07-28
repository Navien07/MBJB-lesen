import { z } from 'zod'

/**
 * Engine version. Recorded on every finding it produces (§1.3).
 * Bump on any behavioural change so historical findings stay attributable.
 */
export const ENGINE_VERSION = 'mbjb-rule-engine@1.0.0'

// ---------------------------------------------------------------- rule pack

export const RuleTier = z.enum(['auto', 'recommend', 'escalate'])

export const Rule = z.object({
  rule_id: z.string(),
  title: z.string(),
  parameter: z.string(),
  operator: z.enum([
    'is_true',
    'max_ratio',
    'max_dimensions',
    'all_match',
    'officer_determination',
    'if_true_then_escalate',
    'if_high_then_escalate',
  ]),
  threshold: z.unknown().optional(),
  basis: z.string().optional(),
  tier: RuleTier,
  severity: z.enum(['critical', 'major', 'advisory']),
  citation: z.string().optional(),
  corrective_action_template: z.string().optional(),
  escalation_reason: z.string().optional(),
  fields: z.array(z.string()).optional(),
  notes: z.string().optional(),
  verification_status: z.string(),
})
export type Rule = z.infer<typeof Rule>

export const DocumentChecklistItem = z.object({
  doc_id: z.string(),
  label: z.string(),
  also_accepts: z.array(z.string()).optional(),
  mandatory: z.boolean(),
  notes: z.string().optional(),
  verification_status: z.string(),
})
export type DocumentChecklistItem = z.infer<typeof DocumentChecklistItem>

export const RulePack = z.object({
  rule_set_id: z.string(),
  version: z.string(),
  document_checklist: z.array(DocumentChecklistItem),
  rules: z.array(Rule),
  confidence_thresholds: z.object({
    signboard_glyph_measurement_min: z.number(),
    document_classification_min: z.number(),
    text_extraction_min: z.number(),
  }),
})
export type RulePack = z.infer<typeof RulePack>

// ------------------------------------------------------------ observations

export const SignboardRun = z.object({
  text: z.string(),
  script: z.string(),
  language: z.string(),
  role: z.enum(['business_name', 'business_name_other_script', 'activity', 'other']),
  glyph_height_mm: z.number().positive(),
  confidence: z.number().min(0).max(1).default(1),
  observation_id: z.string().optional(),
})
export type SignboardRun = z.infer<typeof SignboardRun>

export const FieldComparison = z.object({
  field: z.string(),
  form_value: z.string(),
  doc_value: z.string(),
  match: z.boolean(),
  confidence: z.number().min(0).max(1).default(1),
})
export type FieldComparison = z.infer<typeof FieldComparison>

/**
 * Everything the engine may evaluate. Every section is optional: an absent
 * section means "not observed", and rules needing it produce no finding at
 * all rather than a guess. A present section with low confidence escalates.
 */
export const EvaluationInput = z.object({
  signboard: z
    .object({
      runs: z.array(SignboardRun),
      has_trademark_logo_label_or_slogan: z.boolean().optional(),
      dimensions_m: z
        .object({ width_m: z.number().positive(), height_m: z.number().positive() })
        .optional(),
      document_id: z.string().optional(),
    })
    .optional(),
  documents: z
    .object({
      present: z.array(z.string()),
      legible: z.record(z.string(), z.boolean()).optional(),
      consistency: z.array(FieldComparison).optional(),
    })
    .optional(),
  application: z
    .object({
      business_activity_risk_tier: z.enum(['low', 'high']).optional(),
    })
    .optional(),
})
export type EvaluationInput = z.infer<typeof EvaluationInput>

// ---------------------------------------------------------------- findings

export const FindingStatus = z.enum(['compliant', 'non_compliant', 'escalated'])
export type FindingStatus = z.infer<typeof FindingStatus>

export interface EvidencePointer {
  document_id?: string
  observation_ids?: string[]
  detail?: Record<string, unknown>
}

export interface Finding {
  rule_id: string
  rule_version: string
  status: FindingStatus
  severity: Rule['severity']
  tier: z.infer<typeof RuleTier>
  required_value: unknown
  observed_value: unknown
  confidence: number
  evidence: EvidencePointer
  corrective_action: string | null
  produced_by: { engine: string; model: null }
}

export interface Escalation {
  rule_id: string
  reason: string
  context: Record<string, unknown>
}

export interface EvaluationResult {
  rule_set_id: string
  rule_version: string
  engine_version: string
  findings: Finding[]
  escalations: Escalation[]
}
