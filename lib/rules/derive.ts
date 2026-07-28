import type { EvaluationInput, EvidencePointer, RulePack, SignboardRun } from './types'

/**
 * A parameter value derived from observations, with everything a finding
 * needs to be traceable (§1.3). `undefined` from a deriver means the
 * parameter is not determinable from this input, and the rule is skipped —
 * the engine never guesses at unobserved facts.
 */
export interface Derived {
  value: unknown
  observed: unknown
  confidence: number
  evidence: EvidencePointer
  /** Values available to corrective-action templates. */
  vars: Record<string, string>
  /** Which pack confidence threshold gates this derivation, if any. */
  thresholdKey?: keyof RulePack['confidence_thresholds']
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function businessNameRun(runs: SignboardRun[]): SignboardRun | undefined {
  return runs.find((r) => r.role === 'business_name')
}

function observationIds(runs: SignboardRun[]): string[] {
  return runs.flatMap((r) => (r.observation_id ? [r.observation_id] : []))
}

function minConfidence(runs: SignboardRun[]): number {
  return runs.reduce((min, r) => Math.min(min, r.confidence), 1)
}

export function deriveParameter(
  parameter: string,
  input: EvaluationInput,
  pack: RulePack,
): Derived | undefined {
  const signboard = input.signboard
  const documents = input.documents

  switch (parameter) {
    case 'signboard.has_national_language_text': {
      if (!signboard) return undefined
      const msRuns = signboard.runs.filter((r) => r.language === 'ms')
      return {
        value: msRuns.length > 0,
        observed: { national_language_runs: msRuns.map((r) => r.text) },
        confidence: signboard.runs.length ? minConfidence(signboard.runs) : 1,
        evidence: {
          document_id: signboard.document_id,
          observation_ids: observationIds(signboard.runs),
        },
        vars: {},
        thresholdKey: 'text_extraction_min',
      }
    }

    case 'signboard.primary_display_run_is_largest': {
      if (!signboard) return undefined
      const primary = businessNameRun(signboard.runs)
      if (!primary) return undefined
      const others = signboard.runs.filter((r) => r !== primary)
      const largestOther = others.reduce<SignboardRun | null>(
        (max, r) => (max === null || r.glyph_height_mm > max.glyph_height_mm ? r : max),
        null,
      )
      const isLargest =
        largestOther === null || primary.glyph_height_mm > largestOther.glyph_height_mm
      return {
        value: isLargest,
        observed: {
          primary_run: { text: primary.text, glyph_height_mm: primary.glyph_height_mm },
          largest_other_run: largestOther
            ? { text: largestOther.text, glyph_height_mm: largestOther.glyph_height_mm }
            : null,
        },
        confidence: minConfidence(signboard.runs),
        evidence: {
          document_id: signboard.document_id,
          observation_ids: observationIds(signboard.runs),
        },
        vars: {
          primary_run: primary.text,
          largest_run: largestOther?.text ?? '',
        },
        thresholdKey: 'signboard_glyph_measurement_min',
      }
    }

    case 'signboard.max_other_language_glyph_ratio': {
      if (!signboard) return undefined
      const basis = businessNameRun(signboard.runs)
      if (!basis) return undefined
      const otherLanguage = signboard.runs.filter((r) => r.language !== 'ms')
      if (otherLanguage.length === 0) return undefined
      const worst = otherLanguage.reduce((max, r) =>
        r.glyph_height_mm > max.glyph_height_mm ? r : max,
      )
      const ratio = round2(worst.glyph_height_mm / basis.glyph_height_mm)
      return {
        value: ratio,
        observed: {
          measured_ratio: ratio,
          basis_run: { text: basis.text, glyph_height_mm: basis.glyph_height_mm },
          largest_other_language_run: {
            text: worst.text,
            script: worst.script,
            glyph_height_mm: worst.glyph_height_mm,
          },
        },
        confidence: Math.min(basis.confidence, worst.confidence),
        evidence: {
          document_id: signboard.document_id,
          observation_ids: observationIds([basis, worst]),
        },
        vars: { measured_ratio: String(ratio), script: worst.script },
        thresholdKey: 'signboard_glyph_measurement_min',
      }
    }

    case 'signboard.activity_run_in_national_language': {
      if (!signboard) return undefined
      const activityRuns = signboard.runs.filter((r) => r.role === 'activity')
      if (activityRuns.length === 0) return undefined
      const inMs = activityRuns.some((r) => r.language === 'ms')
      return {
        value: inMs,
        observed: {
          activity_runs: activityRuns.map((r) => ({ text: r.text, language: r.language })),
        },
        confidence: minConfidence(activityRuns),
        evidence: {
          document_id: signboard.document_id,
          observation_ids: observationIds(activityRuns),
        },
        vars: {},
        thresholdKey: 'text_extraction_min',
      }
    }

    case 'signboard.dimensions_m': {
      if (!signboard?.dimensions_m) return undefined
      const { width_m, height_m } = signboard.dimensions_m
      return {
        value: { width_m, height_m },
        observed: { width_m, height_m },
        confidence: 1, // declared on the form, not measured
        evidence: { detail: { source: 'application form' } },
        vars: { measured: `${width_m} m × ${height_m} m` },
      }
    }

    case 'signboard.registered_name_retained': {
      if (!signboard) return undefined
      const otherScript = signboard.runs.filter((r) => r.role === 'business_name_other_script')
      if (otherScript.length === 0) return undefined
      return {
        value: null, // an officer determination; the engine never decides this
        observed: { other_script_runs: otherScript.map((r) => r.text) },
        confidence: minConfidence(otherScript),
        evidence: {
          document_id: signboard.document_id,
          observation_ids: observationIds(otherScript),
        },
        vars: {},
      }
    }

    case 'signboard.national_language_correctness': {
      if (!signboard) return undefined
      const msRuns = signboard.runs.filter((r) => r.language === 'ms')
      if (msRuns.length === 0) return undefined // SIGN-LANG-001 already fails outright
      return {
        value: null,
        observed: { national_language_runs: msRuns.map((r) => r.text) },
        confidence: minConfidence(msRuns),
        evidence: {
          document_id: signboard.document_id,
          observation_ids: observationIds(msRuns),
        },
        vars: {},
      }
    }

    case 'signboard.has_trademark_logo_label_or_slogan': {
      if (signboard?.has_trademark_logo_label_or_slogan === undefined) return undefined
      return {
        value: signboard.has_trademark_logo_label_or_slogan,
        observed: { has_trademark_logo_label_or_slogan: signboard.has_trademark_logo_label_or_slogan },
        confidence: 1,
        evidence: { document_id: signboard.document_id },
        vars: {},
      }
    }

    case 'documents.mandatory_all_present_and_legible': {
      if (!documents?.legible) return undefined
      const mandatory = pack.document_checklist.filter((d) => d.mandatory)
      const missing = mandatory.filter(
        (d) => !documents.present.includes(d.doc_id) || documents.legible?.[d.doc_id] !== true,
      )
      return {
        value: missing.length === 0,
        observed: { missing: missing.map((d) => d.doc_id) },
        confidence: 1,
        evidence: { detail: { present: documents.present } },
        vars: { missing_list: missing.map((d) => d.label).join('; ') },
        thresholdKey: 'document_classification_min',
      }
    }

    case 'documents.cross_field_consistency': {
      if (!documents?.consistency) return undefined
      const mismatches = documents.consistency.filter((c) => !c.match)
      const first = mismatches[0]
      return {
        value: mismatches.length === 0,
        observed: { mismatches },
        confidence: documents.consistency.reduce((min, c) => Math.min(min, c.confidence), 1),
        evidence: { detail: { compared: documents.consistency.map((c) => c.field) } },
        vars: first
          ? { field: first.field, form_value: first.form_value, doc_value: first.doc_value }
          : {},
        thresholdKey: 'text_extraction_min',
      }
    }

    case 'application.business_activity_risk_tier': {
      const tier = input.application?.business_activity_risk_tier
      if (tier === undefined) return undefined
      return {
        value: tier,
        observed: { business_activity_risk_tier: tier },
        confidence: 1,
        evidence: { detail: { source: 'intake classification' } },
        vars: {},
      }
    }
  }

  // documents.<DOC-ID>.present
  const presence = parameter.match(/^documents\.([A-Z-]+)\.present$/)
  if (presence) {
    if (!documents) return undefined
    const present = documents.present.includes(presence[1])
    return {
      value: present,
      observed: { [presence[1]]: present ? 'present' : 'missing' },
      confidence: 1,
      evidence: { detail: { present: documents.present } },
      vars: {},
    }
  }

  return undefined
}
