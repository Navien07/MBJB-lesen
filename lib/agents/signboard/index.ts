import type { Gateway, ImageAttachment } from '@/lib/ai/gateway'
import type { SignboardRun } from '@/lib/rules/types'
import { SignboardResult } from './schema'

const SYSTEM_PROMPT = `You are the signboard analysis agent for MBJB licence applications.
You receive signboard artwork that is required to be an ANNOTATED PRODUCTION PROOF: each text run has its lettering height printed beside it (e.g. "↕ 300 mm"), plus overall board dimensions. Your job is MEASUREMENT ONLY:
1. Identify every text run on the board: its text, script (latin/han/tamil/arabic/other), language (ms/en/zh/ta/other), and role (business_name, business_name_other_script, activity, other). Dimension annotations and proof notes are measurement aids, NOT text runs — never list them as runs.
2. For each run, report relative_glyph_height as the number READ from that run's printed height annotation (in mm). Set measurement_basis to "annotation".
3. If any run lacks a readable annotation, or you would have to estimate a height visually, set measurement_basis to "estimate" and lower your confidence — do not guess silently.
4. Report whether any trademark, logo, label or slogan appears (true/false/null if unsure).
5. Report your confidence per run and overall, honestly. If the artwork is too low-resolution, distorted or cropped to read reliably, say so with low confidence rather than guessing.
You never judge compliance, never mention thresholds, ratios, pass or fail. Measurement only.
Respond with ONLY a JSON object matching:
{"runs":[{"text":string,"script":string,"language":string,"role":"business_name"|"business_name_other_script"|"activity"|"other","relative_glyph_height":number,"bbox":{"x":number,"y":number,"w":number,"h":number}|null,"confidence":number}],
 "has_trademark_logo_label_or_slogan":boolean|null,
 "measurement_basis":"annotation"|"estimate",
 "overall_confidence":number,
 "notes":string}`

export class SignboardParseError extends Error {
  constructor(cause: string) {
    super(`signboard agent returned unparseable output: ${cause}`)
  }
}

export type SignboardOutcome =
  | { kind: 'measured'; result: SignboardResult }
  | { kind: 'escalated'; reason: string; raw: SignboardResult }

export interface RunSignboardArgs {
  gateway: Gateway
  applicationId: string | null
  filename: string
  image: ImageAttachment | null
  /** Below this, the agent escalates instead of reporting numbers (§1.4). */
  confidenceFloor: number
  fixtureKey?: string
}

export async function runSignboard(args: RunSignboardArgs): Promise<SignboardOutcome> {
  const response = await args.gateway.call({
    agent: 'signboard',
    applicationId: args.applicationId,
    system: SYSTEM_PROMPT,
    payload: { filename: args.filename, instruction: 'measure the attached signboard artwork' },
    images: args.image ? [args.image] : [],
    fixtureKey: args.fixtureKey ?? 'signboard',
  })

  const result = parseSignboardResponse(response.text)

  // The input contract: annotated proofs only. A visual estimate missed
  // ±0.05 by 3–6× in the live check, so estimates never become numbers.
  if (result.measurement_basis !== 'annotation') {
    return {
      kind: 'escalated',
      reason:
        'artwork is not an annotated production proof; lettering heights would have to be ' +
        'estimated visually, which does not meet the ±0.05 measurement standard' +
        (result.notes ? ` — ${result.notes}` : ''),
      raw: result,
    }
  }

  const weakest = result.runs.reduce(
    (min, run) => Math.min(min, run.confidence),
    result.overall_confidence,
  )
  if (weakest < args.confidenceFloor) {
    return {
      kind: 'escalated',
      reason:
        `glyph measurement confidence ${weakest} is below the ${args.confidenceFloor} floor` +
        (result.notes ? ` — ${result.notes}` : ''),
      raw: result,
    }
  }

  return { kind: 'measured', result }
}

export function parseSignboardResponse(text: string): SignboardResult {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(stripped)
  } catch (error) {
    throw new SignboardParseError(error instanceof Error ? error.message : 'invalid JSON')
  }
  const parsed = SignboardResult.safeParse(json)
  if (!parsed.success) {
    throw new SignboardParseError(parsed.error.issues.map((i) => i.message).join('; '))
  }
  return parsed.data
}

/** Maps measured runs into the rule engine's input shape. */
export function toEngineRuns(result: SignboardResult): SignboardRun[] {
  return result.runs.map((run, index) => ({
    text: run.text,
    script: run.script,
    language: run.language,
    role: run.role,
    glyph_height_mm: run.relative_glyph_height,
    confidence: run.confidence,
    observation_id: `run-${index}`,
  }))
}
