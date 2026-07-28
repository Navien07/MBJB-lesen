import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Gateway } from '@/lib/ai/gateway'
import { evaluate } from '@/lib/rules'
import rulePack from '@/docs/rules/uuk-iklan-mbjb-2010.json'
import {
  parseSignboardResponse,
  runSignboard,
  SignboardParseError,
  toEngineRuns,
  type SignboardOutcome,
} from './index'

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'ai')
const BOARD_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'signboards')
const CONFIDENCE_FLOOR = rulePack.confidence_thresholds.signboard_glyph_measurement_min

function fakeDb(): SupabaseClient {
  return {
    from: () => ({ insert: async () => ({ error: null }) }),
  } as unknown as SupabaseClient
}

function replayGateway(): Gateway {
  return new Gateway({ db: fakeDb(), mode: 'replay', fixtureDir: FIXTURE_DIR })
}

interface GroundTruth {
  board_id: string
  runs: Array<{ role: string; glyph_height_mm: number; language: string }>
  expected_ratio: number
  tolerance: number
}

async function groundTruth(boardId: string): Promise<GroundTruth> {
  return JSON.parse(await readFile(path.join(BOARD_DIR, `${boardId}.json`), 'utf8'))
}

function measuredRatio(outcome: SignboardOutcome): number {
  if (outcome.kind !== 'measured') throw new Error(`expected a measurement, got ${outcome.kind}`)
  const runs = outcome.result.runs
  const basis = runs.find((r) => r.role === 'business_name')!
  const other = runs
    .filter((r) => r.language !== 'ms')
    .reduce((max, r) => (r.relative_glyph_height > max.relative_glyph_height ? r : max))
  return other.relative_glyph_height / basis.relative_glyph_height
}

describe('glyph-height ratios land within ±0.05 of SVG ground truth', () => {
  for (const boardId of ['board-070', 'board-086']) {
    test(`${boardId} measures within tolerance of its generated truth`, async () => {
      const truth = await groundTruth(boardId)
      const outcome = await runSignboard({
        gateway: replayGateway(),
        applicationId: null,
        filename: `${boardId}.png`,
        image: null,
        confidenceFloor: CONFIDENCE_FLOOR,
        fixtureKey: `signboard-${boardId.replace('board-', '')}`,
      })
      const ratio = measuredRatio(outcome)
      expect(Math.abs(ratio - truth.expected_ratio)).toBeLessThanOrEqual(truth.tolerance)
    })
  }
})

describe('the low-resolution board escalates rather than returning a number', () => {
  test('board-lowres comes back as an escalation with the reason attached', async () => {
    const outcome = await runSignboard({
      gateway: replayGateway(),
      applicationId: null,
      filename: 'board-lowres.png',
      image: null,
      confidenceFloor: CONFIDENCE_FLOOR,
      fixtureKey: 'signboard-lowres',
    })
    expect(outcome.kind).toBe('escalated')
    if (outcome.kind === 'escalated') {
      // unreadable annotations trip the input contract before the floor does
      expect(outcome.reason).toMatch(/annotated production proof|below the 0.85 floor/)
      expect(outcome.reason).toMatch(/resolved|resolution|96px|annotation/i)
    }
  })

  test('the simulator fallback also escalates lowres filenames', async () => {
    const outcome = await runSignboard({
      gateway: replayGateway(),
      applicationId: null,
      filename: 'photo-lowres-site.png',
      image: null,
      confidenceFloor: CONFIDENCE_FLOOR,
      fixtureKey: 'signboard-no-such-fixture-lowres',
    })
    // fixtureKey misses; the simulator keys off the filename
    expect(outcome.kind).toBe('escalated')
  })
})

describe('measurement only — compliance stays with the rule engine', () => {
  test('the agent result carries no verdicts, thresholds or pass/fail language', async () => {
    const outcome = await runSignboard({
      gateway: replayGateway(),
      applicationId: null,
      filename: 'board-086.png',
      image: null,
      confidenceFloor: CONFIDENCE_FLOOR,
      fixtureKey: 'signboard-086',
    })
    expect(outcome.kind).toBe('measured')
    if (outcome.kind === 'measured') {
      const keys = Object.keys(outcome.result)
      expect(keys.sort()).toEqual(
        [
          'has_trademark_logo_label_or_slogan',
          'measurement_basis',
          'notes',
          'overall_confidence',
          'runs',
        ].sort(),
      )
      const serialised = JSON.stringify(outcome.result).toLowerCase()
      for (const forbidden of ['compliant', 'verdict', 'pass', 'fail', 'threshold']) {
        expect(serialised).not.toContain(forbidden)
      }
    }
  })

  test('measured 0.86 runs flow into the engine and produce the SIGN-SIZE-002 failure', async () => {
    const outcome = await runSignboard({
      gateway: replayGateway(),
      applicationId: null,
      filename: 'board-086.png',
      image: null,
      confidenceFloor: CONFIDENCE_FLOOR,
      fixtureKey: 'signboard-086',
    })
    if (outcome.kind !== 'measured') throw new Error('expected measurement')

    const result = evaluate(rulePack, { signboard: { runs: toEngineRuns(outcome.result) } })
    const finding = result.findings.find((f) => f.rule_id === 'SIGN-SIZE-002')
    expect(finding?.status).toBe('non_compliant')
    const observed = finding?.observed_value as { measured_ratio: number }
    expect(Math.abs(observed.measured_ratio - 0.86)).toBeLessThanOrEqual(0.05)
    // the verdict was produced by the engine, not the model (§1.2)
    expect(finding?.produced_by.engine).toBeTruthy()
    expect(finding?.produced_by.model).toBeNull()
  })
})

describe('parsing is a boundary', () => {
  test('prose output raises SignboardParseError', () => {
    expect(() => parseSignboardResponse('The sign looks compliant to me.')).toThrow(
      SignboardParseError,
    )
  })

  test('wrong-shape JSON raises SignboardParseError', () => {
    expect(() => parseSignboardResponse('{"runs": [{"text": 1}]}')).toThrow(SignboardParseError)
  })
})
