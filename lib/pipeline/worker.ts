import type { SupabaseClient } from '@supabase/supabase-js'
import { runCopilot } from '@/lib/agents/copilot'
import { runIntake } from '@/lib/agents/intake'
import { runSignboard } from '@/lib/agents/signboard'
import type { Gateway } from '@/lib/ai/gateway'
import { DOCUMENT_CHECKLIST } from '@/lib/applications/schema'
import { writeAudit } from '@/lib/audit'
import { evaluate, RulePack, type EvaluationInput } from '@/lib/rules'
import rulePackJson from '@/docs/rules/uuk-iklan-mbjb-2010.json'

/**
 * The pipeline worker (M7). One invocation advances exactly ONE stage of ONE
 * job. A failed stage retries up to max_attempts, then parks for a human —
 * it never loops. All writes go through the service role; status changes
 * here can never reach a terminal state (the M1 trigger guarantees it).
 */

export interface WorkerDeps {
  db: SupabaseClient // service role
  gateway: Gateway
}

export interface TickResult {
  advanced: boolean
  jobId?: string
  applicationId?: string
  stage?: string
  outcome?: 'done' | 'retry' | 'parked'
  detail?: string
}

const STAGE_ORDER = ['intake', 'signboard', 'compliance', 'copilot'] as const
type Stage = (typeof STAGE_ORDER)[number]

export async function advanceOnce(deps: WorkerDeps): Promise<TickResult> {
  const { db } = deps

  const { data: candidates } = await db
    .from('jobs')
    .select('id, application_id, stage, status, attempts, max_attempts')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
  const job = candidates?.[0]
  if (!job) return { advanced: false }

  // optimistic claim: only one worker wins the update
  const { data: claimed } = await db
    .from('jobs')
    .update({ status: 'running', attempts: job.attempts + 1, updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('id')
  if (!claimed || claimed.length === 0) return { advanced: false }

  try {
    const next = await runStage(deps, job.stage as Stage, job.application_id)
    await db.from('jobs').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', job.id)
    if (next) {
      await db.from('jobs').insert({ application_id: job.application_id, stage: next, status: 'queued' })
    }
    return {
      advanced: true,
      jobId: job.id,
      applicationId: job.application_id,
      stage: job.stage,
      outcome: 'done',
      detail: next ? `enqueued ${next}` : 'pipeline complete for this submission',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const willPark = job.attempts + 1 >= job.max_attempts
    await db
      .from('jobs')
      .update({
        status: willPark ? 'parked' : 'queued',
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    await writeAudit(db, {
      application_id: job.application_id,
      actor_type: 'system',
      actor_id: 'pipeline-worker',
      action: willPark ? 'job.parked' : 'job.retry',
      detail: { stage: job.stage, attempt: job.attempts + 1, error: message },
    })
    return {
      advanced: true,
      jobId: job.id,
      applicationId: job.application_id,
      stage: job.stage,
      outcome: willPark ? 'parked' : 'retry',
      detail: message,
    }
  }
}

async function runStage(deps: WorkerDeps, stage: Stage, applicationId: string): Promise<Stage | null> {
  switch (stage) {
    case 'intake':
      return stageIntake(deps, applicationId)
    case 'signboard':
      return stageSignboard(deps, applicationId)
    case 'compliance':
      return stageCompliance(deps, applicationId)
    case 'copilot':
      return stageCopilot(deps, applicationId)
  }
}

async function setStatus(db: SupabaseClient, applicationId: string, status: string): Promise<void> {
  const { error } = await db.from('applications').update({ status }).eq('id', applicationId)
  if (error) throw new Error(`status update to ${status} failed: ${error.message}`)
}

async function loadApplication(db: SupabaseClient, applicationId: string) {
  const { data, error } = await db.from('applications').select('*').eq('id', applicationId).single()
  if (error || !data) throw new Error(`application ${applicationId} not found`)
  return data
}

async function stageIntake(deps: WorkerDeps, applicationId: string): Promise<Stage | null> {
  const { db, gateway } = deps
  const application = await loadApplication(db, applicationId)
  await setStatus(db, applicationId, 'INTAKE_CHECK')

  const { data: documents } = await db
    .from('documents')
    .select('id, doc_type, filename, mime_type')
    .eq('application_id', applicationId)

  const result = await runIntake({
    gateway,
    applicationId,
    form: {
      applicant_name: application.applicant_name,
      ic_or_passport: application.ic_or_passport,
      citizenship: application.citizenship,
      correspondence_address: application.correspondence_address,
      premise_address: application.premise_address,
      ssm_registration_no: application.ssm_registration_no,
      company_name: application.company_name,
      property_tax_account_no: application.property_tax_account_no,
      phone: application.phone,
      business_activity: application.business_activity,
      floor_area_m2: application.floor_area_m2,
      signboard_width_m: application.signboard_width_m,
      signboard_height_m: application.signboard_height_m,
    },
    documents: (documents ?? []).map((d) => ({
      doc_type: d.doc_type,
      filename: d.filename,
      mime_type: d.mime_type,
    })),
    checklist: DOCUMENT_CHECKLIST.map((d) => ({
      doc_id: d.docId,
      label: d.label,
      mandatory: d.mandatory,
    })),
  })

  for (const doc of result.documents) {
    const row = (documents ?? []).find((d) => d.doc_type === doc.doc_type)
    if (row) {
      await db
        .from('documents')
        .update({
          classified_type: doc.classified_type,
          legible: doc.legible,
          classification_confidence: doc.confidence,
        })
        .eq('id', row.id)
    }
  }

  await db
    .from('applications')
    .update({
      intake_result: result,
      readiness_score: result.readiness_score,
      risk_tier: result.business_activity_risk_tier,
      deficiency_notice: result.deficiencies.length > 0 ? { deficiencies: result.deficiencies } : null,
    })
    .eq('id', applicationId)

  await writeAudit(db, {
    application_id: applicationId,
    actor_type: 'agent',
    actor_id: 'intake',
    action: 'intake.completed',
    detail: {
      readiness_score: result.readiness_score,
      deficiencies: result.deficiencies.map((d) => d.doc_id),
      risk_tier: result.business_activity_risk_tier,
    },
  })

  // Deficiency policy: a first submission with missing mandatory documents
  // halts as DEFICIENT with a notice naming them. A RESUBMISSION always
  // advances — unresolved deficiencies become findings for the officer
  // instead of bouncing the applicant forever (mirrors counter practice).
  if (result.deficiencies.length > 0) {
    const { data: priorNotice } = await db
      .from('audit_log')
      .select('id')
      .eq('application_id', applicationId)
      .eq('action', 'application.resubmitted')
      .limit(1)
    const isResubmission = (priorNotice?.length ?? 0) > 0
    if (!isResubmission) {
      await setStatus(db, applicationId, 'DEFICIENT')
      await writeAudit(db, {
        application_id: applicationId,
        actor_type: 'agent',
        actor_id: 'intake',
        action: 'deficiency.notice_issued',
        detail: { deficiencies: result.deficiencies },
      })
      return null
    }
  }

  await setStatus(db, applicationId, 'ANALYSING')
  return 'signboard'
}

async function stageSignboard(deps: WorkerDeps, applicationId: string): Promise<Stage | null> {
  const { db, gateway } = deps

  const { data: artworkRows } = await db
    .from('documents')
    .select('id, filename, mime_type, storage_path')
    .eq('application_id', applicationId)
    .eq('doc_type', 'DOC-SIGNBOARD')
    .order('uploaded_at', { ascending: false })
    .limit(1)
  const artwork = artworkRows?.[0]
  if (!artwork) throw new Error('no signboard artwork document on this application')

  let image: { mediaType: 'image/png' | 'image/jpeg'; base64: string } | null = null
  if (process.env.AI_GATEWAY_MODE === 'live') {
    const { data: blob, error } = await db.storage.from('documents').download(artwork.storage_path)
    if (error || !blob) throw new Error(`artwork download failed: ${error?.message}`)
    const buffer = Buffer.from(await blob.arrayBuffer())
    image = {
      mediaType: artwork.mime_type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
      base64: buffer.toString('base64'),
    }
  }

  const pack = RulePack.parse(rulePackJson)
  const outcome = await runSignboard({
    gateway,
    applicationId,
    filename: artwork.filename,
    image,
    confidenceFloor: pack.confidence_thresholds.signboard_glyph_measurement_min,
  })

  if (outcome.kind === 'escalated') {
    await db.from('escalations').insert({
      application_id: applicationId,
      rule_id: 'SIGNBOARD-MEASUREMENT',
      reason: outcome.reason,
      context: { runs: outcome.raw.runs, notes: outcome.raw.notes },
    })
    await writeAudit(db, {
      application_id: applicationId,
      actor_type: 'agent',
      actor_id: 'signboard',
      action: 'signboard.escalated',
      detail: { reason: outcome.reason },
    })
    return 'compliance' // compliance still runs on documents; signboard rules simply skip
  }

  for (const run of outcome.result.runs) {
    const { error } = await db.from('signboard_observations').insert({
      application_id: applicationId,
      document_id: artwork.id,
      run_text: run.text,
      script: run.script,
      language: run.language,
      role: run.role,
      relative_glyph_height: run.relative_glyph_height,
      bbox: run.bbox,
      confidence: run.confidence,
      model_version: process.env.AI_MODEL_SIGNBOARD ?? 'replay-simulator',
    })
    if (error) throw new Error(`observation insert failed: ${error.message}`)
  }

  await writeAudit(db, {
    application_id: applicationId,
    actor_type: 'agent',
    actor_id: 'signboard',
    action: 'signboard.measured',
    detail: {
      runs: outcome.result.runs.length,
      measurement_basis: outcome.result.measurement_basis,
      overall_confidence: outcome.result.overall_confidence,
    },
  })
  return 'compliance'
}

async function stageCompliance(deps: WorkerDeps, applicationId: string): Promise<Stage | null> {
  const { db } = deps
  const application = await loadApplication(db, applicationId)

  const pack = await ensureRulePack(db)

  const { data: documents } = await db
    .from('documents')
    .select('doc_type, legible')
    .eq('application_id', applicationId)
  const { data: observations } = await db
    .from('signboard_observations')
    .select('id, run_text, script, language, role, relative_glyph_height, confidence, document_id')
    .eq('application_id', applicationId)

  const intake = application.intake_result as {
    consistency?: Array<{ field: string; form_value: string; doc_value: string; match: boolean; confidence: number }>
  } | null

  const input: EvaluationInput = {
    documents: {
      present: [...new Set((documents ?? []).map((d) => d.doc_type))],
      legible: Object.fromEntries(
        (documents ?? []).filter((d) => d.legible !== null).map((d) => [d.doc_type, d.legible]),
      ),
      consistency: intake?.consistency,
    },
    application: application.risk_tier
      ? { business_activity_risk_tier: application.risk_tier as 'low' | 'high' }
      : undefined,
    signboard:
      observations && observations.length > 0
        ? {
            runs: observations.map((o) => ({
              text: o.run_text,
              script: o.script,
              language: o.language,
              role: o.role as 'business_name' | 'business_name_other_script' | 'activity' | 'other',
              glyph_height_mm: Number(o.relative_glyph_height),
              confidence: Number(o.confidence),
              observation_id: o.id,
            })),
            dimensions_m:
              application.signboard_width_m && application.signboard_height_m
                ? {
                    width_m: Number(application.signboard_width_m),
                    height_m: Number(application.signboard_height_m),
                  }
                : undefined,
            document_id: observations[0].document_id ?? undefined,
          }
        : undefined,
  }

  const result = evaluate(pack, input)

  for (const finding of result.findings) {
    const { error } = await db.from('findings').insert({
      application_id: applicationId,
      rule_id: finding.rule_id,
      rule_version: finding.rule_version,
      status: finding.status,
      severity: finding.severity,
      required_value: finding.required_value as never,
      observed_value: finding.observed_value as never,
      confidence: finding.confidence,
      evidence: finding.evidence as never,
      corrective_action: finding.corrective_action,
      produced_by: finding.produced_by,
    })
    if (error) throw new Error(`finding insert failed: ${error.message}`)
  }

  for (const escalation of result.escalations) {
    const { error } = await db.from('escalations').insert({
      application_id: applicationId,
      rule_id: escalation.rule_id,
      reason: escalation.reason,
      context: escalation.context as never,
    })
    if (error) throw new Error(`escalation insert failed: ${error.message}`)
  }

  await writeAudit(db, {
    application_id: applicationId,
    actor_type: 'agent',
    actor_id: 'compliance',
    action: 'compliance.evaluated',
    detail: {
      findings: result.findings.length,
      escalations: result.escalations.length,
      engine_version: result.engine_version,
    },
    rule_version: result.rule_version,
  })
  return 'copilot'
}

async function stageCopilot(deps: WorkerDeps, applicationId: string): Promise<Stage | null> {
  const { db, gateway } = deps
  const application = await loadApplication(db, applicationId)

  const { data: findings } = await db
    .from('findings')
    .select('rule_id, status, severity, observed_value, corrective_action')
    .eq('application_id', applicationId)
  const { data: escalations } = await db
    .from('escalations')
    .select('rule_id, reason')
    .eq('application_id', applicationId)
    .eq('status', 'open')

  const result = await runCopilot({
    gateway,
    applicationId,
    applicationSummary: {
      company_name: application.company_name,
      business_activity: application.business_activity,
      premise_address: application.premise_address,
      status: application.status,
    },
    findings: findings ?? [],
    escalations: escalations ?? [],
  })

  await db.from('applications').update({ copilot_result: result }).eq('id', applicationId)
  await setStatus(db, applicationId, 'ASSESSED')
  await writeAudit(db, {
    application_id: applicationId,
    actor_type: 'agent',
    actor_id: 'copilot',
    action: 'copilot.completed',
    detail: { risk_rank: result.risk_rank },
  })
  return null
}

/** Loads the rule pack in force; seeds the file pack on first use (§1.6). */
export async function ensureRulePack(db: SupabaseClient): Promise<RulePack> {
  const { data: rows } = await db
    .from('rules')
    .select('pack')
    .eq('rule_set_id', rulePackJson.rule_set_id)
    .eq('version', rulePackJson.version)
    .limit(1)
  if (rows && rows.length > 0) return RulePack.parse(rows[0].pack)

  const { error } = await db.from('rules').insert({
    rule_set_id: rulePackJson.rule_set_id,
    version: rulePackJson.version,
    pack: rulePackJson,
  })
  // a concurrent insert of the same version is fine — the unique key holds
  if (error && !/duplicate key/.test(error.message)) {
    throw new Error(`rule pack seed failed: ${error.message}`)
  }
  return RulePack.parse(rulePackJson)
}
