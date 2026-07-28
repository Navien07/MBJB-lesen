/**
 * The honest half of M6: run the REAL signboard model against the generated
 * boards and report measured ratios vs SVG ground truth. Three API calls.
 *
 *   pnpm tsx --env-file=.env.local scripts/measure-signboard-live.ts
 *
 * Pass criteria (BUILD-PLAN M6): |measured - truth| <= 0.05 on board-070 and
 * board-086, and board-lowres escalates rather than returning a number.
 * If this fails, DO NOT widen the tolerance — change the input contract and
 * record it in docs/OPEN-QUESTIONS.md.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anthropicTransport } from '../lib/ai/anthropic'
import { Gateway } from '../lib/ai/gateway'
import { runSignboard } from '../lib/agents/signboard'
import rulePack from '../docs/rules/uuk-iklan-mbjb-2010.json'

process.env.AI_MODEL_SIGNBOARD ??= 'claude-opus-4-8'

const BOARD_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'signboards')
const FLOOR = rulePack.confidence_thresholds.signboard_glyph_measurement_min

const auditStub = {
  from: () => ({
    insert: async (row: { action: string; model_version: string | null; tokens: unknown }) => {
      console.log(`  audit: ${row.action} model=${row.model_version} tokens=${JSON.stringify(row.tokens)}`)
      return { error: null }
    },
  }),
} as unknown as SupabaseClient

async function measure(boardId: string) {
  const png = await readFile(path.join(BOARD_DIR, `${boardId}.png`))
  const gateway = new Gateway({ db: auditStub, mode: 'live', transport: anthropicTransport() })

  const outcome = await runSignboard({
    gateway,
    applicationId: null,
    filename: `${boardId}.png`,
    image: { mediaType: 'image/png', base64: png.toString('base64') },
    confidenceFloor: FLOOR,
    fixtureKey: `live-${boardId}`,
  })
  return outcome
}

async function main() {
  let failures = 0

  for (const boardId of ['board-070', 'board-086']) {
    const truth = JSON.parse(await readFile(path.join(BOARD_DIR, `${boardId}.json`), 'utf8'))
    console.log(`\n=== ${boardId} (truth ratio ${truth.expected_ratio}) ===`)
    const outcome = await measure(boardId)

    if (outcome.kind !== 'measured') {
      console.log(`  ESCALATED on a clean board: ${outcome.reason}`)
      failures++
      continue
    }
    const runs = outcome.result.runs
    const basis = runs.find((r) => r.role === 'business_name')
    const others = runs.filter((r) => r.language !== 'ms')
    if (!basis || others.length === 0) {
      console.log('  FAIL: model did not identify the business name / other-language runs')
      console.log(JSON.stringify(runs, null, 2))
      failures++
      continue
    }
    const worst = others.reduce((max, r) =>
      r.relative_glyph_height > max.relative_glyph_height ? r : max,
    )
    const ratio = Math.round((worst.relative_glyph_height / basis.relative_glyph_height) * 1000) / 1000
    const delta = Math.abs(ratio - truth.expected_ratio)
    const ok = delta <= truth.tolerance
    console.log(
      `  measured ${worst.relative_glyph_height}/${basis.relative_glyph_height} = ${ratio}` +
        ` | truth ${truth.expected_ratio} | Δ ${Math.round(delta * 1000) / 1000} | ` +
        (ok ? 'WITHIN ±0.05' : 'OUT OF TOLERANCE'),
    )
    console.log(`  confidence: overall ${outcome.result.overall_confidence}`)
    if (!ok) failures++
  }

  console.log('\n=== board-lowres (must escalate) ===')
  const low = await measure('board-lowres')
  if (low.kind === 'escalated') {
    console.log(`  ESCALATED as required: ${low.reason}`)
  } else {
    console.log('  FAIL: returned a measurement instead of escalating:')
    console.log(JSON.stringify(low.result.runs, null, 2))
    failures++
  }

  console.log(failures === 0 ? '\nM6 LIVE CHECK PASS' : `\nM6 LIVE CHECK: ${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
