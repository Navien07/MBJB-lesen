import type { Gateway } from '@/lib/ai/gateway'
import type { Escalation, Finding } from '@/lib/rules/types'
import { CopilotResult } from './schema'

const SYSTEM_PROMPT = `You are the officer copilot for MBJB business licence applications.
You receive the settled findings from the deterministic rule engine, the open escalations, and application context. The findings are facts you MUST NOT contradict, re-derive or second-guess.
Produce:
1. brief_md — a concise officer brief in Markdown: what passed, what failed (with the finding's measured values), what awaits officer determination. Group by severity. Reference findings by rule id.
2. risk_rank — low/medium/high, justified only by the findings and escalations given.
3. letter_md — a decision-support letter draft in Bahasa Melayu followed by English, citing the specific rule id behind every condition or refusal reason. Formal Malaysian local-government register.
4. suggested_conditions — one entry per non-compliant finding, citing its rule id.
Where you lack grounding, omit rather than fill. Never invent measurements, rule ids or by-law citations not present in the input.
Respond with ONLY a JSON object matching:
{"brief_md":string,"risk_rank":"low"|"medium"|"high","letter_md":string,
 "suggested_conditions":[{"rule_id":string,"condition":string}]}`

export class CopilotParseError extends Error {
  constructor(cause: string) {
    super(`copilot returned unparseable output: ${cause}`)
  }
}

export interface RunCopilotArgs {
  gateway: Gateway
  applicationId: string | null
  applicationSummary: {
    company_name: string
    business_activity: string
    premise_address: string
    status: string
  }
  findings: Array<
    Pick<Finding, 'rule_id' | 'status' | 'severity' | 'observed_value' | 'corrective_action'>
  >
  escalations: Array<Pick<Escalation, 'rule_id' | 'reason'>>
  fixtureKey?: string
}

export async function runCopilot(args: RunCopilotArgs): Promise<CopilotResult> {
  const response = await args.gateway.call({
    agent: 'copilot',
    applicationId: args.applicationId,
    system: SYSTEM_PROMPT,
    payload: {
      application: args.applicationSummary,
      findings: args.findings,
      escalations: args.escalations,
    },
    fixtureKey: args.fixtureKey ?? 'copilot',
  })
  return parseCopilotResponse(response.text)
}

export function parseCopilotResponse(text: string): CopilotResult {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(stripped)
  } catch (error) {
    throw new CopilotParseError(error instanceof Error ? error.message : 'invalid JSON')
  }
  const parsed = CopilotResult.safeParse(json)
  if (!parsed.success) {
    throw new CopilotParseError(parsed.error.issues.map((i) => i.message).join('; '))
  }
  return parsed.data
}
