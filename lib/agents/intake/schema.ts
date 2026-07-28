import { z } from 'zod'

/** What the Intake & Classification agent must produce (M5). */
export const IntakeResult = z.object({
  documents: z.array(
    z.object({
      doc_type: z.string(),
      classified_type: z.string(),
      legible: z.boolean(),
      confidence: z.number().min(0).max(1),
      notes: z.string().default(''),
    }),
  ),
  consistency: z.array(
    z.object({
      field: z.string(),
      form_value: z.string(),
      doc_value: z.string(),
      match: z.boolean(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  readiness_score: z.number().min(0).max(1),
  deficiencies: z.array(
    z.object({
      doc_id: z.string(),
      label: z.string(),
      reason: z.string(),
    }),
  ),
  business_activity_risk_tier: z.enum(['low', 'high']),
})
export type IntakeResult = z.infer<typeof IntakeResult>

export interface IntakeDocumentInput {
  doc_type: string
  filename: string
  mime_type: string
}

export interface IntakeFormInput {
  applicant_name: string
  ic_or_passport: string
  citizenship: string
  correspondence_address: string
  premise_address: string
  ssm_registration_no: string
  company_name: string
  property_tax_account_no: string
  phone: string
  business_activity: string
  floor_area_m2: number | null
  signboard_width_m: number | null
  signboard_height_m: number | null
}

export interface IntakeChecklistItem {
  doc_id: string
  label: string
  mandatory: boolean
}

export interface IntakePayload {
  form: IntakeFormInput
  documents: IntakeDocumentInput[]
  checklist: IntakeChecklistItem[]
}
