import { describe, expect, test } from 'vitest'
import rulePackJson from '../../docs/rules/uuk-iklan-mbjb-2010.json'
import { evaluate } from './engine'
import { ENGINE_VERSION, type EvaluationInput, type Finding } from './types'

const pack = rulePackJson

/** Signboard runs for a fully compliant board unless overridden. */
function boardRuns(overrides?: { otherHeight?: number; activityHeight?: number }) {
  return [
    {
      text: 'KEDAI RUNCIT AMAN JAYA',
      script: 'latin',
      language: 'ms',
      role: 'business_name' as const,
      glyph_height_mm: 300,
      confidence: 1,
      observation_id: 'obs-name',
    },
    {
      text: '安泰杂货店',
      script: 'han',
      language: 'zh',
      role: 'business_name_other_script' as const,
      glyph_height_mm: overrides?.otherHeight ?? 200,
      confidence: 1,
      observation_id: 'obs-other',
    },
    {
      text: 'Barangan Runcit',
      script: 'latin',
      language: 'ms',
      role: 'activity' as const,
      glyph_height_mm: overrides?.activityHeight ?? 90,
      confidence: 1,
      observation_id: 'obs-activity',
    },
  ]
}

function findingFor(findings: Finding[], ruleId: string): Finding | undefined {
  return findings.find((f) => f.rule_id === ruleId)
}

describe('the ¾ ratio boundary (SIGN-SIZE-002)', () => {
  const ratioCases: Array<[number, string]> = [
    [74, 'compliant'],
    [75, 'compliant'], // inclusive: exactly 0.75 passes — unconfirmed with MBJB, see OPEN-QUESTIONS
    [76, 'non_compliant'],
  ]

  test.each(ratioCases)('other-language lettering at %imm of a 100mm name', (height, expected) => {
    const result = evaluate(pack, {
      signboard: {
        runs: [
          { text: 'NAMA', script: 'latin', language: 'ms', role: 'business_name', glyph_height_mm: 100 },
          { text: '字', script: 'han', language: 'zh', role: 'business_name_other_script', glyph_height_mm: height },
        ],
      },
    })
    const finding = findingFor(result.findings, 'SIGN-SIZE-002')
    expect(finding?.status).toBe(expected)
    expect((finding?.observed_value as { measured_ratio: number }).measured_ratio).toBe(height / 100)
  })

  test('the non-compliant finding carries an actionable corrective message', () => {
    const result = evaluate(pack, { signboard: { runs: boardRuns({ otherHeight: 258 }) } })
    const finding = findingFor(result.findings, 'SIGN-SIZE-002')
    expect(finding?.status).toBe('non_compliant')
    expect(finding?.corrective_action).toContain('0.86')
    expect(finding?.corrective_action).toContain('han')
  })
})

describe('the demo case reproduces its expected findings exactly', () => {
  const demo = rulePackJson.demo_case
  const input: EvaluationInput = {
    signboard: {
      runs: demo.signboard_runs.map((r) => ({
        ...r,
        role: r.role as 'business_name' | 'business_name_other_script' | 'activity',
        confidence: 1,
      })),
      dimensions_m: demo.signboard_dimensions_m,
    },
    documents: {
      // first submission: everything mandatory except the DBP verification
      present: ['DOC-SSM', 'DOC-CUKAI', 'DOC-ID', 'DOC-SIGNBOARD', 'DOC-PREMISE'],
    },
  }
  const result = evaluate(pack, input)

  test('same rule ids and same statuses, nothing extra', () => {
    const got = result.findings
      .map((f) => ({ rule_id: f.rule_id, status: f.status }))
      .sort((a, b) => a.rule_id.localeCompare(b.rule_id))
    const expected = demo.expected_findings
      .map((f) => ({ rule_id: f.rule_id, status: f.status }))
      .sort((a, b) => a.rule_id.localeCompare(b.rule_id))
    expect(got).toEqual(expected)
  })

  test('the measured ratio is 0.86', () => {
    const finding = findingFor(result.findings, 'SIGN-SIZE-002')
    expect((finding?.observed_value as { measured_ratio: number }).measured_ratio).toBe(0.86)
  })

  test('both escalate-tier rules produced escalation records', () => {
    expect(result.escalations.map((e) => e.rule_id).sort()).toEqual([
      'SIGN-LANG-002',
      'SIGN-NAME-001',
    ])
  })

  test('every finding is traceable per §1.3', () => {
    for (const f of result.findings) {
      expect(f.rule_version).toBe(pack.version)
      expect(f.produced_by.engine).toBe(ENGINE_VERSION)
      expect(f.produced_by.model).toBeNull()
      expect(f.evidence).toBeTruthy()
      expect(f.confidence).toBeGreaterThan(0)
    }
  })
})

describe('document rules', () => {
  test('a missing DBP document is a critical SIGN-DBP-001 failure', () => {
    const result = evaluate(pack, { documents: { present: ['DOC-SSM'] } })
    const finding = findingFor(result.findings, 'SIGN-DBP-001')
    expect(finding?.status).toBe('non_compliant')
    expect(finding?.severity).toBe('critical')
  })

  test('a present DBP document passes SIGN-DBP-001', () => {
    const result = evaluate(pack, { documents: { present: ['DOC-DBP'] } })
    expect(findingFor(result.findings, 'SIGN-DBP-001')?.status).toBe('compliant')
  })

  test('missing mandatory documents fail DOC-COMPLETE-001 and are named', () => {
    const result = evaluate(pack, {
      documents: {
        present: ['DOC-SSM', 'DOC-CUKAI'],
        legible: { 'DOC-SSM': true, 'DOC-CUKAI': false },
      },
    })
    const finding = findingFor(result.findings, 'DOC-COMPLETE-001')
    expect(finding?.status).toBe('non_compliant')
    // the illegible receipt and the absent identity document are both named
    expect(finding?.corrective_action).toContain('property tax')
    expect(finding?.corrective_action).toContain('Identity document')
  })

  test('all mandatory documents present and legible passes DOC-COMPLETE-001', () => {
    const legible = Object.fromEntries(
      pack.document_checklist.map((d) => [d.doc_id, true]),
    )
    const result = evaluate(pack, {
      documents: { present: pack.document_checklist.map((d) => d.doc_id), legible },
    })
    expect(findingFor(result.findings, 'DOC-COMPLETE-001')?.status).toBe('compliant')
  })

  test('a field mismatch fails DOC-CONSIST-001 with both values in the message', () => {
    const result = evaluate(pack, {
      documents: {
        present: [],
        consistency: [
          { field: 'company_name', form_value: 'Aman Jaya', doc_value: 'Aman Jaya Sdn Bhd', match: false, confidence: 1 },
          { field: 'premise_address', form_value: 'No 1', doc_value: 'No 1', match: true, confidence: 1 },
        ],
      },
    })
    const finding = findingFor(result.findings, 'DOC-CONSIST-001')
    expect(finding?.status).toBe('non_compliant')
    expect(finding?.corrective_action).toContain('Aman Jaya Sdn Bhd')
    expect(finding?.tier).toBe('recommend') // never auto-reject on this
  })

  test('consistent fields pass DOC-CONSIST-001', () => {
    const result = evaluate(pack, {
      documents: {
        present: [],
        consistency: [
          { field: 'company_name', form_value: 'X', doc_value: 'X', match: true, confidence: 1 },
        ],
      },
    })
    expect(findingFor(result.findings, 'DOC-CONSIST-001')?.status).toBe('compliant')
  })
})

describe('signboard language and size rules', () => {
  test('artwork with no Bahasa Melayu run is a critical SIGN-LANG-001 failure', () => {
    const result = evaluate(pack, {
      signboard: {
        runs: [
          { text: '安泰杂货店', script: 'han', language: 'zh', role: 'business_name', glyph_height_mm: 300 },
        ],
      },
    })
    const finding = findingFor(result.findings, 'SIGN-LANG-001')
    expect(finding?.status).toBe('non_compliant')
    expect(finding?.severity).toBe('critical')
    // no BM runs exist, so BM-correctness has nothing to escalate about
    expect(findingFor(result.findings, 'SIGN-LANG-002')).toBeUndefined()
  })

  test('activity text larger than the business name is a SIGN-SIZE-001 failure', () => {
    const result = evaluate(pack, { signboard: { runs: boardRuns({ activityHeight: 400 }) } })
    const finding = findingFor(result.findings, 'SIGN-SIZE-001')
    expect(finding?.status).toBe('non_compliant')
    expect(finding?.corrective_action).toContain('KEDAI RUNCIT AMAN JAYA')
    expect(finding?.corrective_action).toContain('Barangan Runcit')
  })

  test('an activity run not in the national language fails SIGN-ACT-001', () => {
    const result = evaluate(pack, {
      signboard: {
        runs: [
          { text: 'NAMA KEDAI', script: 'latin', language: 'ms', role: 'business_name', glyph_height_mm: 300 },
          { text: 'Daily Groceries', script: 'latin', language: 'en', role: 'activity', glyph_height_mm: 90 },
        ],
      },
    })
    expect(findingFor(result.findings, 'SIGN-ACT-001')?.status).toBe('non_compliant')
  })

  test('oversized signboard dimensions fail SIGN-DIM-001 with the imperial limit named', () => {
    const result = evaluate(pack, {
      signboard: { runs: boardRuns(), dimensions_m: { width_m: 7.5, height_m: 1.2 } },
    })
    const finding = findingFor(result.findings, 'SIGN-DIM-001')
    expect(finding?.status).toBe('non_compliant')
    expect(finding?.corrective_action).toContain('20 ft x 4 ft')
    expect(finding?.corrective_action).toContain('7.5')
  })

  test('a board with only Bahasa Melayu runs produces no ratio finding at all', () => {
    const result = evaluate(pack, {
      signboard: {
        runs: [
          { text: 'KEDAI SAYA', script: 'latin', language: 'ms', role: 'business_name', glyph_height_mm: 300 },
        ],
      },
    })
    expect(findingFor(result.findings, 'SIGN-SIZE-002')).toBeUndefined()
  })
})

describe('escalate-tier rules never pass or fail', () => {
  test('every escalate-tier finding across varied inputs has status escalated', () => {
    const inputs: EvaluationInput[] = [
      { signboard: { runs: boardRuns(), has_trademark_logo_label_or_slogan: true } },
      { application: { business_activity_risk_tier: 'high' } },
      { signboard: { runs: boardRuns() } },
    ]
    const escalateRuleIds = new Set(
      pack.rules.filter((r) => r.tier === 'escalate').map((r) => r.rule_id),
    )
    for (const input of inputs) {
      for (const finding of evaluate(pack, input).findings) {
        if (escalateRuleIds.has(finding.rule_id)) {
          expect(finding.status).toBe('escalated')
        }
      }
    }
  })

  test('SIGN-IP-001 escalates when a logo is present and stays silent when not', () => {
    const withLogo = evaluate(pack, {
      signboard: { runs: boardRuns(), has_trademark_logo_label_or_slogan: true },
    })
    expect(findingFor(withLogo.findings, 'SIGN-IP-001')?.status).toBe('escalated')

    const withoutLogo = evaluate(pack, {
      signboard: { runs: boardRuns(), has_trademark_logo_label_or_slogan: false },
    })
    expect(findingFor(withoutLogo.findings, 'SIGN-IP-001')).toBeUndefined()
  })

  test('BIZ-RISK-001 escalates high-risk activities and stays silent for low', () => {
    const high = evaluate(pack, { application: { business_activity_risk_tier: 'high' } })
    expect(findingFor(high.findings, 'BIZ-RISK-001')?.status).toBe('escalated')

    const low = evaluate(pack, { application: { business_activity_risk_tier: 'low' } })
    expect(findingFor(low.findings, 'BIZ-RISK-001')).toBeUndefined()
  })
})

describe('low confidence escalates rather than guesses (§1.4)', () => {
  test('a glyph measurement below the confidence threshold becomes an escalation', () => {
    const result = evaluate(pack, {
      signboard: {
        runs: [
          { text: 'NAMA', script: 'latin', language: 'ms', role: 'business_name', glyph_height_mm: 100, confidence: 0.6 },
          { text: '字', script: 'han', language: 'zh', role: 'business_name_other_script', glyph_height_mm: 90, confidence: 0.6 },
        ],
      },
    })
    const finding = findingFor(result.findings, 'SIGN-SIZE-002')
    expect(finding?.status).toBe('escalated')
    expect(result.escalations.some((e) => e.rule_id === 'SIGN-SIZE-002' && /below/.test(e.reason))).toBe(true)
  })
})

describe('rule versions and determinism', () => {
  test('a second rule-pack version leaves historical findings unchanged', () => {
    const input: EvaluationInput = {
      signboard: {
        runs: [
          { text: 'NAMA', script: 'latin', language: 'ms', role: 'business_name', glyph_height_mm: 100, confidence: 1 },
          { text: '字', script: 'han', language: 'zh', role: 'business_name_other_script', glyph_height_mm: 76, confidence: 1 },
        ],
      },
    }
    const v1 = evaluate(pack, input)
    const historical = structuredClone(v1.findings)

    // a later pack version relaxes the ratio to 0.80
    const v2pack = structuredClone(rulePackJson) as typeof rulePackJson & { version: string }
    v2pack.version = '2010.2-draft'
    const ratioRule = v2pack.rules.find((r) => r.rule_id === 'SIGN-SIZE-002')!
    ;(ratioRule as { threshold: unknown }).threshold = 0.8

    const v2 = evaluate(v2pack, input)
    expect(findingFor(v2.findings, 'SIGN-SIZE-002')?.status).toBe('compliant')
    expect(findingFor(v2.findings, 'SIGN-SIZE-002')?.rule_version).toBe('2010.2-draft')

    // the historical findings still reproduce exactly against the version in force
    const v1again = evaluate(pack, input)
    expect(v1again.findings).toEqual(historical)
    expect(findingFor(historical, 'SIGN-SIZE-002')?.status).toBe('non_compliant')
    expect(findingFor(historical, 'SIGN-SIZE-002')?.rule_version).toBe('2010.1-draft')
  })

  test('a malformed pack is rejected at the boundary, not cast', () => {
    expect(() => evaluate({ nonsense: true }, {})).toThrow()
    expect(() => evaluate(pack, { signboard: { runs: [{ bad: 'run' }] } })).toThrow()
  })

  test('an empty input produces no findings and no escalations', () => {
    const result = evaluate(pack, {})
    expect(result.findings).toEqual([])
    expect(result.escalations).toEqual([])
    expect(result.engine_version).toBe(ENGINE_VERSION)
  })
})

describe('defensive paths', () => {
  function packWithRules(rules: unknown[]): unknown {
    return { ...structuredClone(rulePackJson), rules }
  }

  test('a rule naming a parameter the engine cannot derive is skipped, not guessed', () => {
    const synthetic = packWithRules([
      {
        rule_id: 'SYN-UNKNOWN-001',
        title: 'Unknown parameter',
        parameter: 'signboard.paranormal_activity',
        operator: 'is_true',
        threshold: true,
        tier: 'auto',
        severity: 'major',
        verification_status: 'synthetic',
      },
    ])
    const result = evaluate(synthetic, { signboard: { runs: boardRuns() } })
    expect(result.findings).toEqual([])
  })

  test('an escalate-tier rule with a decidable operator still only escalates', () => {
    const synthetic = packWithRules([
      {
        rule_id: 'SYN-ESC-001',
        title: 'Escalate despite a boolean parameter',
        parameter: 'signboard.has_national_language_text',
        operator: 'is_true',
        threshold: true,
        tier: 'escalate',
        severity: 'major',
        escalation_reason: 'synthetic escalation',
        verification_status: 'synthetic',
      },
    ])
    const result = evaluate(synthetic, { signboard: { runs: boardRuns() } })
    expect(result.findings[0]?.status).toBe('escalated')
    expect(result.escalations[0]?.reason).toBe('synthetic escalation')
  })

  test('an auto-tier rule with an officer-determination operator is a hard error', () => {
    const synthetic = packWithRules([
      {
        rule_id: 'SYN-BAD-001',
        title: 'Auto tier cannot decide officer determinations',
        parameter: 'signboard.registered_name_retained',
        operator: 'officer_determination',
        tier: 'auto',
        severity: 'major',
        verification_status: 'synthetic',
      },
    ])
    expect(() => evaluate(synthetic, { signboard: { runs: boardRuns() } })).toThrow(/not decidable/)
  })

  test('a board with a single business-name run is trivially the largest', () => {
    const result = evaluate(pack, {
      signboard: {
        runs: [
          { text: 'KEDAI SAYA', script: 'latin', language: 'ms', role: 'business_name', glyph_height_mm: 300 },
        ],
      },
    })
    expect(findingFor(result.findings, 'SIGN-SIZE-001')?.status).toBe('compliant')
  })

  test('a signboard section with no runs at all still fails the language rule', () => {
    const result = evaluate(pack, { signboard: { runs: [] } })
    const finding = findingFor(result.findings, 'SIGN-LANG-001')
    expect(finding?.status).toBe('non_compliant')
    expect(finding?.confidence).toBe(1)
    // no business-name run: size and ratio rules are indeterminable, not failed
    expect(findingFor(result.findings, 'SIGN-SIZE-001')).toBeUndefined()
    expect(findingFor(result.findings, 'SIGN-SIZE-002')).toBeUndefined()
  })

  test('within-limit dimensions pass SIGN-DIM-001', () => {
    const result = evaluate(pack, {
      signboard: { runs: boardRuns(), dimensions_m: { width_m: 3, height_m: 1 } },
    })
    expect(findingFor(result.findings, 'SIGN-DIM-001')?.status).toBe('compliant')
  })

  test('a template placeholder with no variable survives uninterpolated', () => {
    const synthetic = packWithRules([
      {
        rule_id: 'SYN-TPL-001',
        title: 'Template with unknown placeholder',
        parameter: 'documents.DOC-DBP.present',
        operator: 'is_true',
        threshold: true,
        tier: 'auto',
        severity: 'major',
        corrective_action_template: 'Missing {no_such_var} here.',
        verification_status: 'synthetic',
      },
    ])
    const result = evaluate(synthetic, { documents: { present: [] } })
    expect(result.findings[0]?.corrective_action).toBe('Missing {no_such_var} here.')
  })
})
