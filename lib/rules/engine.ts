import { deriveParameter, type Derived } from './derive'
import {
  ENGINE_VERSION,
  EvaluationInput,
  RulePack,
  type Escalation,
  type EvaluationResult,
  type Finding,
  type FindingStatus,
  type Rule,
} from './types'

/**
 * The compliance verdict comes from here and only here (§1.2). Pure function:
 * no I/O, no network, no model. The model's job upstream is to produce the
 * observations in `EvaluationInput`; this function produces the findings.
 */
export function evaluate(packInput: unknown, observationsInput: unknown): EvaluationResult {
  const pack = RulePack.parse(packInput)
  const input = EvaluationInput.parse(observationsInput)

  const findings: Finding[] = []
  const escalations: Escalation[] = []

  for (const rule of pack.rules) {
    const derived = deriveParameter(rule.parameter, input, pack)
    if (derived === undefined) continue // not observed; never guess (§1.4)

    if (rule.tier === 'escalate') {
      const outcome = escalateOutcome(rule, derived)
      if (outcome === 'skip') continue
      findings.push(buildFinding(rule, pack, derived, 'escalated'))
      escalations.push({
        rule_id: rule.rule_id,
        reason: outcome.reason,
        context: { observed: derived.observed, evidence: derived.evidence },
      })
      continue
    }

    // Below-threshold confidence escalates rather than guesses (§1.4).
    if (derived.thresholdKey !== undefined) {
      const min = pack.confidence_thresholds[derived.thresholdKey]
      if (derived.confidence < min) {
        const reason =
          `confidence ${derived.confidence} for ${rule.parameter} is below the ` +
          `${derived.thresholdKey} threshold of ${min}`
        findings.push(buildFinding(rule, pack, derived, 'escalated'))
        escalations.push({
          rule_id: rule.rule_id,
          reason,
          context: { observed: derived.observed, evidence: derived.evidence },
        })
        continue
      }
    }

    const compliant = applyOperator(rule, derived)
    findings.push(buildFinding(rule, pack, derived, compliant ? 'compliant' : 'non_compliant'))
  }

  return {
    rule_set_id: pack.rule_set_id,
    rule_version: pack.version,
    engine_version: ENGINE_VERSION,
    findings,
    escalations,
  }
}

function escalateOutcome(rule: Rule, derived: Derived): { reason: string } | 'skip' {
  const reason = rule.escalation_reason ?? rule.title
  switch (rule.operator) {
    case 'officer_determination':
      return { reason }
    case 'if_true_then_escalate':
      return derived.value === true ? { reason } : 'skip'
    case 'if_high_then_escalate':
      return derived.value === 'high' ? { reason } : 'skip'
    default:
      // an escalate-tier rule must never produce a pass or a fail
      return { reason }
  }
}

function applyOperator(rule: Rule, derived: Derived): boolean {
  switch (rule.operator) {
    case 'is_true':
    case 'all_match':
      return derived.value === true
    case 'max_ratio': {
      const limit = rule.threshold as number
      // Inclusive boundary: exactly the limit passes. Confirmed inclusive is
      // NOT settled with MBJB — see docs/OPEN-QUESTIONS.md before changing.
      return (derived.value as number) <= limit
    }
    case 'max_dimensions': {
      const limit = rule.threshold as { width_m: number; height_m: number }
      const dims = derived.value as { width_m: number; height_m: number }
      return dims.width_m <= limit.width_m && dims.height_m <= limit.height_m
    }
    default:
      throw new Error(`operator ${rule.operator} is not decidable by the engine`)
  }
}

function buildFinding(
  rule: Rule,
  pack: RulePack,
  derived: Derived,
  status: FindingStatus,
): Finding {
  const vars: Record<string, string> = { ...derived.vars }
  const threshold = rule.threshold as { imperial_equivalent?: string } | undefined
  if (threshold && typeof threshold === 'object' && threshold.imperial_equivalent) {
    vars.threshold_imperial = threshold.imperial_equivalent
  }

  return {
    rule_id: rule.rule_id,
    rule_version: pack.version,
    status,
    severity: rule.severity,
    tier: rule.tier,
    required_value: rule.threshold ?? rule.operator,
    observed_value: derived.observed,
    confidence: derived.confidence,
    evidence: derived.evidence,
    corrective_action:
      status === 'non_compliant' && rule.corrective_action_template
        ? interpolate(rule.corrective_action_template, vars)
        : null,
    produced_by: { engine: ENGINE_VERSION, model: null },
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole)
}
