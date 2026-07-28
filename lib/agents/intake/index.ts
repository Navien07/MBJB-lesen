import type { Gateway } from '@/lib/ai/gateway'
import {
  IntakeResult,
  type IntakeChecklistItem,
  type IntakeDocumentInput,
  type IntakeFormInput,
  type IntakePayload,
} from './schema'

const SYSTEM_PROMPT = `You are the intake and classification agent for MBJB business licence applications.
You receive the application form fields, the uploaded document list, and the mandatory checklist.
Your job, strictly:
1. Classify each uploaded document against the checklist types and judge whether it is legible.
2. Cross-check consistency between the form and the documents for: company_name, premise_address, applicant_name, property_tax_account_no.
3. Produce a readiness score between 0 and 1.
4. Name every missing or inadequate mandatory document specifically in "deficiencies", using the checklist label.
5. Classify business_activity_risk_tier as "high" only for health-service or entertainment category activities (urut/spa/hotel bajet/karaoke/pusat hiburan), otherwise "low".
You never judge signboard compliance and you never decide the application.
Personally identifying values arrive redacted; reason about structure, not identity.
Respond with ONLY a JSON object matching:
{"documents":[{"doc_type":string,"classified_type":string,"legible":boolean,"confidence":number,"notes":string}],
 "consistency":[{"field":string,"form_value":string,"doc_value":string,"match":boolean,"confidence":number}],
 "readiness_score":number,
 "deficiencies":[{"doc_id":string,"label":string,"reason":string}],
 "business_activity_risk_tier":"low"|"high"}`

export class IntakeParseError extends Error {
  constructor(cause: string) {
    super(`intake agent returned unparseable output: ${cause}`)
  }
}

export interface RunIntakeArgs {
  gateway: Gateway
  applicationId: string | null
  form: IntakeFormInput
  documents: IntakeDocumentInput[]
  checklist: IntakeChecklistItem[]
  fixtureKey?: string
}

export async function runIntake(args: RunIntakeArgs): Promise<IntakeResult> {
  const payload: IntakePayload = {
    form: args.form,
    documents: args.documents,
    checklist: args.checklist,
  }

  const response = await args.gateway.call({
    agent: 'intake',
    applicationId: args.applicationId,
    system: SYSTEM_PROMPT,
    payload,
    fixtureKey: args.fixtureKey ?? 'intake',
  })

  return parseIntakeResponse(response.text)
}

export function parseIntakeResponse(text: string): IntakeResult {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(stripped)
  } catch (error) {
    throw new IntakeParseError(error instanceof Error ? error.message : 'invalid JSON')
  }
  const parsed = IntakeResult.safeParse(json)
  if (!parsed.success) {
    throw new IntakeParseError(parsed.error.issues.map((i) => i.message).join('; '))
  }
  return parsed.data
}
