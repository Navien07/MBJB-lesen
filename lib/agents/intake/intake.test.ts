import path from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Gateway, type LiveTransport } from '@/lib/ai/gateway'
import { IntakeParseError, parseIntakeResponse, runIntake } from './index'
import type { IntakeChecklistItem, IntakeDocumentInput, IntakeFormInput } from './schema'

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'ai')

interface CapturedAudit {
  action: string
  actor_type: string
  model_version: string | null
  tokens: { input: number; output: number } | null
}

function fakeDb(captured: CapturedAudit[]): SupabaseClient {
  return {
    from(table: string) {
      return {
        insert: async (row: CapturedAudit) => {
          if (table !== 'audit_log') throw new Error(`unexpected table ${table}`)
          captured.push(row)
          return { error: null }
        },
      }
    },
  } as unknown as SupabaseClient
}

const FORM: IntakeFormInput = {
  applicant_name: 'Aminah binti Salleh',
  ic_or_passport: '800101-01-5566',
  citizenship: 'warganegara',
  correspondence_address: 'No 12, Jalan Dedap 3',
  premise_address: 'No 45, Jalan Rosmerah 2/1',
  ssm_registration_no: '202301012345',
  company_name: 'Kedai Runcit Aman Jaya',
  property_tax_account_no: 'CH-889900',
  phone: '+60127778888',
  business_activity: 'Kedai runcit',
  floor_area_m2: 85,
  signboard_width_m: 6,
  signboard_height_m: 1.2,
}

const CHECKLIST: IntakeChecklistItem[] = [
  { doc_id: 'DOC-SSM', label: 'Business or company registration (SSM)', mandatory: true },
  { doc_id: 'DOC-CUKAI', label: 'Latest paid property tax (cukai harta) receipt', mandatory: true },
  { doc_id: 'DOC-ID', label: 'Identity document', mandatory: true },
  { doc_id: 'DOC-SIGNBOARD', label: 'Signboard artwork or visual', mandatory: true },
  {
    doc_id: 'DOC-DBP',
    label: 'Dewan Bahasa dan Pustaka (DBP) verification or approval of signboard content and visual',
    mandatory: true,
  },
  { doc_id: 'DOC-PREMISE', label: 'Proof of premise occupation', mandatory: true },
  { doc_id: 'DOC-FLOORPLAN', label: 'Premise floor plan', mandatory: false },
]

function docs(types: string[]): IntakeDocumentInput[] {
  return types.map((t) => ({
    doc_type: t,
    filename: `${t.toLowerCase()}.pdf`,
    mime_type: 'application/pdf',
  }))
}

beforeEach(() => {
  process.env.AI_MODEL_INTAKE = 'claude-sonnet-4-6'
})

describe('intake against recorded fixtures (replay, no network)', () => {
  test('a missing DBP document is named specifically in the deficiency list', async () => {
    const audits: CapturedAudit[] = []
    const gateway = new Gateway({ db: fakeDb(audits), mode: 'replay', fixtureDir: FIXTURE_DIR })

    const result = await runIntake({
      gateway,
      applicationId: null,
      form: FORM,
      documents: docs(['DOC-SSM', 'DOC-CUKAI', 'DOC-ID', 'DOC-SIGNBOARD', 'DOC-PREMISE', 'DOC-FLOORPLAN']),
      checklist: CHECKLIST,
      fixtureKey: 'intake-missing-dbp',
    })

    expect(result.deficiencies).toHaveLength(1)
    expect(result.deficiencies[0].doc_id).toBe('DOC-DBP')
    expect(result.deficiencies[0].label).toContain('Dewan Bahasa dan Pustaka')
    expect(result.readiness_score).toBeLessThan(0.95)
    expect(result.documents.every((d) => d.legible)).toBe(true)
  })

  test('a complete submission has no deficiencies, and fenced JSON still parses', async () => {
    const audits: CapturedAudit[] = []
    const gateway = new Gateway({ db: fakeDb(audits), mode: 'replay', fixtureDir: FIXTURE_DIR })

    const result = await runIntake({
      gateway,
      applicationId: null,
      form: FORM,
      documents: docs(CHECKLIST.map((c) => c.doc_id)),
      checklist: CHECKLIST,
      fixtureKey: 'intake-complete',
    })

    expect(result.deficiencies).toEqual([])
    expect(result.readiness_score).toBeGreaterThanOrEqual(0.9)
  })

  test('every gateway call is token-accounted to the audit log with the model version', async () => {
    const audits: CapturedAudit[] = []
    const gateway = new Gateway({ db: fakeDb(audits), mode: 'replay', fixtureDir: FIXTURE_DIR })

    await runIntake({
      gateway,
      applicationId: null,
      form: FORM,
      documents: docs(['DOC-SSM']),
      checklist: CHECKLIST,
      fixtureKey: 'intake-missing-dbp',
    })

    expect(audits).toHaveLength(1)
    expect(audits[0].action).toBe('ai.call.intake')
    expect(audits[0].actor_type).toBe('agent')
    expect(audits[0].model_version).toBe('claude-sonnet-4-6')
    expect(audits[0].tokens).toEqual({ input: 812, output: 431 })
  })

  test('with no fixture on disk the deterministic simulator still names the missing document', async () => {
    const audits: CapturedAudit[] = []
    const gateway = new Gateway({ db: fakeDb(audits), mode: 'replay', fixtureDir: FIXTURE_DIR })

    const result = await runIntake({
      gateway,
      applicationId: null,
      form: FORM,
      documents: docs(['DOC-SSM', 'DOC-CUKAI', 'DOC-ID', 'DOC-SIGNBOARD', 'DOC-PREMISE']),
      checklist: CHECKLIST,
      fixtureKey: 'intake-no-such-fixture',
    })

    expect(result.deficiencies.map((d) => d.doc_id)).toEqual(['DOC-DBP'])
    expect(result.deficiencies[0].label).toContain('Dewan Bahasa dan Pustaka')
  })
})

describe('the gateway in live mode (faked transport, still no network)', () => {
  test('PII is redacted before the payload leaves, and the model id comes from env', async () => {
    process.env.AI_MODEL_INTAKE = 'claude-test-model-id'
    const audits: CapturedAudit[] = []
    const seen: Array<{ model: string; userText: string }> = []
    const transport: LiveTransport = async ({ model, userText }) => {
      seen.push({ model, userText })
      return {
        text: JSON.stringify({
          documents: [],
          consistency: [],
          readiness_score: 0.5,
          deficiencies: [],
          business_activity_risk_tier: 'low',
        }),
        model,
        tokens: { input: 10, output: 5 },
      }
    }
    const gateway = new Gateway({ db: fakeDb(audits), mode: 'live', transport })

    await runIntake({
      gateway,
      applicationId: null,
      form: FORM,
      documents: docs(['DOC-SSM']),
      checklist: CHECKLIST,
    })

    expect(seen).toHaveLength(1)
    expect(seen[0].model).toBe('claude-test-model-id')
    expect(seen[0].userText).not.toContain('800101-01-5566')
    expect(seen[0].userText).not.toContain('+60127778888')
    expect(seen[0].userText).toContain('[REDACTED-NRIC]')
    expect(seen[0].userText).toContain('[REDACTED-PHONE]')
  })

  test('transient transport failures are retried with backoff, then succeed', async () => {
    const audits: CapturedAudit[] = []
    let attempts = 0
    const transport: LiveTransport = async ({ model }) => {
      attempts++
      if (attempts < 3) throw new Error('529 overloaded')
      return {
        text: JSON.stringify({
          documents: [],
          consistency: [],
          readiness_score: 0.9,
          deficiencies: [],
          business_activity_risk_tier: 'low',
        }),
        model,
        tokens: { input: 1, output: 1 },
      }
    }
    const gateway = new Gateway({
      db: fakeDb(audits),
      mode: 'live',
      transport,
      retries: 2,
      backoffMs: 1,
    })

    const result = await runIntake({
      gateway,
      applicationId: null,
      form: FORM,
      documents: docs(['DOC-SSM']),
      checklist: CHECKLIST,
    })

    expect(attempts).toBe(3)
    expect(result.readiness_score).toBe(0.9)
    expect(audits).toHaveLength(1) // one audit entry for the successful call
  })

  test('a transport that keeps failing surfaces the error and writes no audit entry', async () => {
    const audits: CapturedAudit[] = []
    const transport: LiveTransport = async () => {
      throw new Error('529 overloaded')
    }
    const gateway = new Gateway({
      db: fakeDb(audits),
      mode: 'live',
      transport,
      retries: 1,
      backoffMs: 1,
    })

    await expect(
      runIntake({
        gateway,
        applicationId: null,
        form: FORM,
        documents: docs(['DOC-SSM']),
        checklist: CHECKLIST,
      }),
    ).rejects.toThrow(/overloaded/)
    expect(audits).toEqual([])
  })
})

describe('response parsing is a boundary, not a cast', () => {
  test('non-JSON output raises IntakeParseError', () => {
    expect(() => parseIntakeResponse('I am sorry, I cannot help with that.')).toThrow(
      IntakeParseError,
    )
  })

  test('JSON with the wrong shape raises IntakeParseError', () => {
    expect(() => parseIntakeResponse('{"documents": "none"}')).toThrow(IntakeParseError)
  })
})
