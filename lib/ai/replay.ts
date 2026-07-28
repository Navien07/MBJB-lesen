import type { IntakePayload, IntakeResult } from '@/lib/agents/intake/schema'
import type { SignboardResult } from '@/lib/agents/signboard/schema'
import type { CopilotResult } from '@/lib/agents/copilot/schema'
import type { AgentName, GatewayResponse } from './gateway'

/**
 * Deterministic stand-ins for the three agents, used when
 * AI_GATEWAY_MODE=replay and no recorded fixture matches. Filename markers
 * steer the scenarios the E2E plan needs (demo board, low-res board):
 *   - a signboard file containing "demo-board" reproduces the demo case runs
 *   - a signboard file containing "lowres" comes back below the confidence floor
 * Everything else is a clean, compliant reading. The rule engine — the part
 * whose verdicts matter — always runs for real.
 */

const REPLAY_MODEL = 'replay-simulator'
const ZERO_TOKENS = { input: 0, output: 0 }

export function simulate(agent: AgentName, redactedPayload: unknown): GatewayResponse {
  const result =
    agent === 'intake'
      ? simulateIntake(redactedPayload as IntakePayload)
      : agent === 'signboard'
        ? simulateSignboard(redactedPayload as { filename?: string })
        : simulateCopilot(redactedPayload as { findings?: Array<{ rule_id: string; status: string }> })
  return { text: JSON.stringify(result), model: REPLAY_MODEL, tokens: ZERO_TOKENS }
}

function simulateIntake(payload: IntakePayload): IntakeResult {
  const present = new Set(payload.documents.map((d) => d.doc_type))
  const deficiencies = payload.checklist
    .filter((item) => item.mandatory && !present.has(item.doc_id))
    .map((item) => ({
      doc_id: item.doc_id,
      label: item.label,
      reason: `Mandatory document not uploaded: ${item.label}`,
    }))

  const highRisk = /urut|spa|hotel|hiburan|karaoke|massage|entertainment/i.test(
    payload.form.business_activity,
  )

  return {
    documents: payload.documents.map((doc) => ({
      doc_type: doc.doc_type,
      classified_type: doc.doc_type,
      legible: !/lowres|blurry|illegible/i.test(doc.filename),
      confidence: /lowres|blurry|illegible/i.test(doc.filename) ? 0.4 : 0.95,
      notes: '',
    })),
    consistency: [
      'company_name',
      'premise_address',
      'applicant_name',
      'property_tax_account_no',
    ].map((field) => ({
      field,
      form_value: String(
        (payload.form as unknown as Record<string, unknown>)[
          field === 'applicant_name' ? 'applicant_name' : field
        ] ?? '',
      ),
      doc_value: String(
        (payload.form as unknown as Record<string, unknown>)[
          field === 'applicant_name' ? 'applicant_name' : field
        ] ?? '',
      ),
      match: true,
      confidence: 0.9,
    })),
    readiness_score: deficiencies.length === 0 ? 0.95 : Math.max(0.1, 0.95 - 0.25 * deficiencies.length),
    deficiencies,
    business_activity_risk_tier: highRisk ? 'high' : 'low',
  }
}

function simulateSignboard(payload: { filename?: string }): SignboardResult {
  const filename = payload.filename ?? ''

  if (/lowres/i.test(filename)) {
    return {
      runs: [
        {
          text: 'KEDAI (unreadable)',
          script: 'latin',
          language: 'ms',
          role: 'business_name',
          relative_glyph_height: 1,
          bbox: null,
          confidence: 0.35,
        },
      ],
      has_trademark_logo_label_or_slogan: null,
      overall_confidence: 0.35,
      notes: 'Artwork resolution too low for reliable glyph measurement.',
    }
  }

  if (/demo-board/i.test(filename)) {
    // the scripted demo case: 258/300 = 0.86 ratio, ms activity run
    return {
      runs: [
        {
          text: 'KEDAI RUNCIT AMAN JAYA',
          script: 'latin',
          language: 'ms',
          role: 'business_name',
          relative_glyph_height: 300,
          bbox: { x: 60, y: 40, w: 1080, h: 300 },
          confidence: 0.97,
        },
        {
          text: '安泰杂货店',
          script: 'han',
          language: 'zh',
          role: 'business_name_other_script',
          relative_glyph_height: 258,
          bbox: { x: 60, y: 380, w: 900, h: 258 },
          confidence: 0.95,
        },
        {
          text: 'Barangan Runcit & Keperluan Harian',
          script: 'latin',
          language: 'ms',
          role: 'activity',
          relative_glyph_height: 90,
          bbox: { x: 60, y: 680, w: 980, h: 90 },
          confidence: 0.96,
        },
      ],
      has_trademark_logo_label_or_slogan: false,
      overall_confidence: 0.95,
      notes: '',
    }
  }

  return {
    runs: [
      {
        text: 'KEDAI CONTOH',
        script: 'latin',
        language: 'ms',
        role: 'business_name',
        relative_glyph_height: 200,
        bbox: { x: 50, y: 30, w: 800, h: 200 },
        confidence: 0.96,
      },
      {
        text: '示例商店',
        script: 'han',
        language: 'zh',
        role: 'business_name_other_script',
        relative_glyph_height: 140,
        bbox: { x: 50, y: 260, w: 600, h: 140 },
        confidence: 0.95,
      },
      {
        text: 'Perniagaan Runcit',
        script: 'latin',
        language: 'ms',
        role: 'activity',
        relative_glyph_height: 70,
        bbox: { x: 50, y: 430, w: 700, h: 70 },
        confidence: 0.96,
      },
    ],
    has_trademark_logo_label_or_slogan: false,
    overall_confidence: 0.95,
    notes: '',
  }
}

function simulateCopilot(payload: {
  findings?: Array<{ rule_id: string; status: string }>
}): CopilotResult {
  const findings = payload.findings ?? []
  const failures = findings.filter((f) => f.status === 'non_compliant')
  const escalations = findings.filter((f) => f.status === 'escalated')

  const brief = [
    '## Officer brief',
    '',
    `Findings: ${findings.length} total — ${failures.length} non-compliant, ${escalations.length} escalated for determination.`,
    '',
    ...failures.map((f) => `- **${f.rule_id}** is non-compliant; see the finding's evidence.`),
    ...escalations.map((f) => `- **${f.rule_id}** requires officer determination.`),
  ].join('\n')

  const letter = [
    '## Keputusan Permohonan / Application Outcome',
    '',
    'Tuan/Puan,',
    '',
    'Permohonan lesen premis perniagaan dan iklan tuan/puan telah disemak.',
    'Your application for a business premise and advertisement licence has been reviewed.',
    '',
    ...failures.map(
      (f) => `- Syarat berkaitan peraturan ${f.rule_id} hendaklah dipatuhi. / The condition under rule ${f.rule_id} must be met.`,
    ),
    '',
    'Yang benar,',
    'Majlis Bandaraya Johor Bahru',
  ].join('\n')

  return {
    brief_md: brief,
    risk_rank: failures.length > 1 ? 'high' : failures.length === 1 ? 'medium' : 'low',
    letter_md: letter,
    suggested_conditions: failures.map((f) => ({
      rule_id: f.rule_id,
      condition: `Comply with ${f.rule_id} before licence issuance.`,
    })),
  }
}
