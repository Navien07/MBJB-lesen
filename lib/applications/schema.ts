import { z } from 'zod'
import rulePack from '@/docs/rules/uuk-iklan-mbjb-2010.json'

/** The Borang Permohonan Lesen Premis Perniagaan dan Iklan fields (CLAUDE.md §4). */
export const BorangSchema = z.object({
  applicant_name: z.string().min(2, 'Applicant name is required'),
  ic_or_passport: z.string().min(4, 'MyKad / passport number is required'),
  citizenship: z.enum(['warganegara', 'bukan_warganegara'], 'Citizenship is required'),
  correspondence_address: z.string().min(5, 'Correspondence address is required'),
  premise_address: z.string().min(5, 'Premise address is required'),
  ssm_registration_no: z.string().min(4, 'SSM registration number is required'),
  company_name: z.string().min(2, 'Company or business name is required'),
  property_tax_account_no: z.string().min(2, 'Property tax account number is required'),
  phone: z.string().min(7, 'Phone number is required'),
  business_activity: z.string().min(3, 'Business activity is required'),
  floor_area_m2: z.coerce.number().positive('Floor area must be a positive number'),
  signboard_width_m: z.coerce.number().positive('Signboard width must be a positive number'),
  signboard_height_m: z.coerce.number().positive('Signboard height must be a positive number'),
})

export type BorangFields = z.infer<typeof BorangSchema>

export interface ChecklistDoc {
  docId: string
  label: string
  mandatory: boolean
  alsoAccepts: string[]
}

export const DOCUMENT_CHECKLIST: ChecklistDoc[] = rulePack.document_checklist.map((d) => ({
  docId: d.doc_id,
  label: d.label,
  mandatory: d.mandatory,
  alsoAccepts: 'also_accepts' in d ? ((d as { also_accepts?: string[] }).also_accepts ?? []) : [],
}))

export const MANDATORY_DOC_IDS = DOCUMENT_CHECKLIST.filter((d) => d.mandatory).map(
  (d) => d.docId,
)

export const ACCEPTED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
