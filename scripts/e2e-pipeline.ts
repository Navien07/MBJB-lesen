/**
 * M7 gate: the demo case walks the whole pipeline end to end against the
 * local Supabase stack, one worker stage per invocation, gateway in replay.
 *
 *   pnpm tsx scripts/e2e-pipeline.ts --fixture demo-case
 *
 * Proves: submission enqueues a job; the worker advances ONE stage per call;
 * first submission (no DBP) halts DEFICIENT with a notice naming the DBP
 * document; resubmission advances; the case reaches ASSESSED; the findings
 * match the rule pack's demo_case expectations exactly; a failing stage
 * retries then parks rather than looping.
 */
import { execSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Gateway } from '../lib/ai/gateway'
import { advanceOnce, type WorkerDeps } from '../lib/pipeline/worker'
import rulePack from '../docs/rules/uuk-iklan-mbjb-2010.json'

process.env.AI_GATEWAY_MODE = 'replay'

function fail(message: string): never {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function ok(message: string): void {
  console.log(`  ok: ${message}`)
}

async function main() {
  const fixture = process.argv.includes('--fixture')
    ? process.argv[process.argv.indexOf('--fixture') + 1]
    : null
  if (fixture !== 'demo-case') fail(`unknown fixture ${fixture}; only demo-case is defined`)

  const env = execSync('supabase status -o env', { encoding: 'utf8' })
  const get = (key: string) => env.match(new RegExp(`^${key}="?([^"\n]+)"?$`, 'm'))![1]
  const db: SupabaseClient = createClient(get('API_URL'), get('SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
  const deps: WorkerDeps = { db, gateway: new Gateway({ db, mode: 'replay' }) }

  // ---- arrange: applicant, application, documents (no DBP), submission ----
  const email = `pipeline-${Date.now()}@e2e.mbjb.local`
  const { data: user, error: userError } = await db.auth.admin.createUser({
    email,
    password: 'pipeline-pass-123',
    email_confirm: true,
    user_metadata: { full_name: 'Demo Pipeline Applicant' },
  })
  if (userError || !user.user) fail(`user creation: ${userError?.message}`)

  const demo = rulePack.demo_case
  const { data: application, error: appError } = await db
    .from('applications')
    .insert({
      applicant_id: user.user.id,
      status: 'SUBMITTED',
      applicant_name: 'Demo Pipeline Applicant',
      ic_or_passport: '800101-01-5566',
      citizenship: 'warganegara',
      correspondence_address: 'No 12, Jalan Dedap 3, Johor Bahru',
      premise_address: 'No 45, Jalan Rosmerah 2/1, Johor Bahru',
      ssm_registration_no: '202301012345',
      company_name: demo.business_name_registered,
      property_tax_account_no: 'CH-889900',
      phone: '+60127778888',
      business_activity: 'Kedai runcit',
      floor_area_m2: 85,
      signboard_width_m: demo.signboard_dimensions_m.width_m,
      signboard_height_m: demo.signboard_dimensions_m.height_m,
    })
    .select('id')
    .single()
  if (appError || !application) fail(`application insert: ${appError?.message}`)
  const appId = application.id
  console.log(`\napplication ${appId}`)

  // upload the real demo board so live mode later has actual artwork
  const boardPng = await readFile(
    path.join(process.cwd(), 'tests', 'fixtures', 'signboards', 'board-086.png'),
  )
  const storagePath = `${user.user.id}/${appId}/DOC-SIGNBOARD/demo-board-086.png`
  const { error: uploadError } = await db.storage
    .from('documents')
    .upload(storagePath, boardPng, { contentType: 'image/png' })
  if (uploadError) fail(`artwork upload: ${uploadError.message}`)

  const firstDocs = [
    ['DOC-SSM', 'ssm-cert.pdf', 'application/pdf'],
    ['DOC-CUKAI', 'cukai-2026.pdf', 'application/pdf'],
    ['DOC-ID', 'mykad.png', 'image/png'],
    ['DOC-SIGNBOARD', 'demo-board-086.png', 'image/png'],
    ['DOC-PREMISE', 'tenancy.pdf', 'application/pdf'],
  ] as const
  for (const [docType, filename, mime] of firstDocs) {
    const { error } = await db.from('documents').insert({
      application_id: appId,
      doc_type: docType,
      storage_path: docType === 'DOC-SIGNBOARD' ? storagePath : `${user.user.id}/${appId}/${docType}/${filename}`,
      filename,
      mime_type: mime,
    })
    if (error) fail(`document insert ${docType}: ${error.message}`)
  }

  await db.from('audit_log').insert({
    application_id: appId,
    actor_type: 'human',
    actor_id: user.user.id,
    action: 'application.submitted',
  })
  const { error: enqueueError } = await db
    .from('jobs')
    .insert({ application_id: appId, stage: 'intake', status: 'queued' })
  if (enqueueError) fail(`enqueue: ${enqueueError.message}`)
  ok('submission enqueued an intake job')

  // ---- act 1: first pass halts DEFICIENT with the DBP document named ----
  console.log('\nfirst pass (missing DBP):')
  const tick1 = await advanceOnce(deps)
  if (!tick1.advanced || tick1.stage !== 'intake' || tick1.outcome !== 'done') {
    fail(`expected one intake stage, got ${JSON.stringify(tick1)}`)
  }
  ok('one invocation advanced exactly the intake stage')

  const idle = await advanceOnce(deps)
  if (idle.advanced) fail('no further stage should be queued after a deficiency halt')
  ok('pipeline halted — no further jobs')

  const { data: afterIntake } = await db
    .from('applications')
    .select('status, deficiency_notice')
    .eq('id', appId)
    .single()
  if (afterIntake?.status !== 'DEFICIENT') fail(`status ${afterIntake?.status}, expected DEFICIENT`)
  const notice = afterIntake.deficiency_notice as {
    deficiencies: Array<{ doc_id: string; label: string }>
  }
  const dbpNamed = notice?.deficiencies?.some(
    (d) => d.doc_id === 'DOC-DBP' && /Dewan Bahasa dan Pustaka/.test(d.label),
  )
  if (!dbpNamed) fail(`notice does not name the DBP document: ${JSON.stringify(notice)}`)
  ok('DEFICIENT with a notice naming the DBP verification document')

  // ---- act 2: resubmission (applicant proceeds without DBP) advances ----
  console.log('\nresubmission:')
  await db.from('applications').update({ status: 'SUBMITTED' }).eq('id', appId)
  await db.from('audit_log').insert({
    application_id: appId,
    actor_type: 'human',
    actor_id: user.user.id,
    action: 'application.resubmitted',
  })
  await db.from('jobs').insert({ application_id: appId, stage: 'intake', status: 'queued' })

  const stagesRun: string[] = []
  for (let i = 0; i < 12; i++) {
    const tick = await advanceOnce(deps)
    if (!tick.advanced) break
    if (tick.outcome !== 'done') fail(`stage ${tick.stage} did not complete: ${tick.detail}`)
    stagesRun.push(tick.stage!)
  }
  if (stagesRun.join(',') !== 'intake,signboard,compliance,copilot') {
    fail(`stages ran as [${stagesRun.join(',')}], expected one per invocation in order`)
  }
  ok('four invocations advanced four stages, one each, in order')

  const { data: finalApp } = await db
    .from('applications')
    .select('status, copilot_result')
    .eq('id', appId)
    .single()
  if (finalApp?.status !== 'ASSESSED') fail(`status ${finalApp?.status}, expected ASSESSED`)
  ok('case reached ASSESSED')

  // ---- assert: findings match the rule pack demo_case expectations ----
  console.log('\nfindings vs demo_case expectations:')
  const { data: findings } = await db
    .from('findings')
    .select('rule_id, status, observed_value, produced_by')
    .eq('application_id', appId)

  // demo_case.expected_findings was authored on signboard scope. The full
  // pipeline also carries intake's legibility and consistency data, so the
  // two document rules legitimately evaluate too — with statuses forced by
  // the same causes (DBP missing ⇒ DOC-COMPLETE-001 non-compliant). Every
  // expected finding must match exactly; only those two extras are lawful.
  const got = new Map((findings ?? []).map((f) => [f.rule_id, f.status]))
  for (const exp of demo.expected_findings) {
    if (got.get(exp.rule_id) !== exp.status) {
      fail(`${exp.rule_id}: got ${got.get(exp.rule_id) ?? 'missing'}, expected ${exp.status}`)
    }
  }
  ok(`all ${demo.expected_findings.length} expected findings match (rule ids and statuses)`)

  const expectedIds = new Set(demo.expected_findings.map((f) => f.rule_id))
  const LAWFUL_EXTRAS = new Map([
    ['DOC-COMPLETE-001', 'non_compliant'], // the same missing DBP document
    ['DOC-CONSIST-001', 'compliant'], // intake found the four fields consistent
  ])
  for (const [ruleId, status] of got) {
    if (expectedIds.has(ruleId)) continue
    if (LAWFUL_EXTRAS.get(ruleId) !== status) {
      fail(`unexpected finding ${ruleId}:${status}`)
    }
  }
  const completeness = (findings ?? []).find((f) => f.rule_id === 'DOC-COMPLETE-001')
  ok(`document rules evaluated from real intake data (${[...got.keys()].length} findings total)`)
  if (completeness) {
    const observed = completeness.observed_value as { missing?: string[] }
    if (!observed.missing?.includes('DOC-DBP')) {
      fail('DOC-COMPLETE-001 does not name DOC-DBP as the missing document')
    }
    ok('DOC-COMPLETE-001 names DOC-DBP as the missing document')
  }

  const ratioFinding = (findings ?? []).find((f) => f.rule_id === 'SIGN-SIZE-002')
  const measured = (ratioFinding?.observed_value as { measured_ratio?: number })?.measured_ratio
  if (measured !== 0.86) fail(`SIGN-SIZE-002 measured_ratio ${measured}, expected 0.86`)
  ok('SIGN-SIZE-002 measured ratio is 0.86')

  const badProvenance = (findings ?? []).filter(
    (f) =>
      !(f.produced_by as { engine?: string }).engine ||
      (f.produced_by as { model?: string | null }).model !== null,
  )
  if (badProvenance.length > 0) fail('a finding has model provenance or no engine (§1.2)')
  ok('every finding: produced_by.engine set, produced_by.model null')

  const { data: escalations } = await db
    .from('escalations')
    .select('rule_id')
    .eq('application_id', appId)
  const escalated = (escalations ?? []).map((e) => e.rule_id).sort()
  if (!escalated.includes('SIGN-LANG-002') || !escalated.includes('SIGN-NAME-001')) {
    fail(`escalations ${escalated.join(',')} missing the two escalate-tier rules`)
  }
  ok('escalation rows exist for SIGN-LANG-002 and SIGN-NAME-001')

  if (!finalApp.copilot_result) fail('copilot_result missing')
  ok('officer brief and letter drafted')

  // ---- assert: a failing stage retries, then parks — never loops ----
  console.log('\nfailure handling (signboard stage with no artwork):')
  const { data: brokenApp } = await db
    .from('applications')
    .insert({
      applicant_id: user.user.id,
      status: 'ANALYSING',
      company_name: 'Broken Case Sdn Bhd',
      applicant_name: 'x',
      ic_or_passport: 'x',
      citizenship: 'warganegara',
      correspondence_address: 'x',
      premise_address: 'x',
      ssm_registration_no: 'x',
      property_tax_account_no: 'x',
      phone: 'x',
      business_activity: 'kedai',
    })
    .select('id')
    .single()
  await db.from('jobs').insert({ application_id: brokenApp!.id, stage: 'signboard', status: 'queued' })

  const outcomes: string[] = []
  for (let i = 0; i < 6; i++) {
    const tick = await advanceOnce(deps)
    if (!tick.advanced) break
    if (tick.applicationId === brokenApp!.id) outcomes.push(tick.outcome!)
  }
  if (outcomes.join(',') !== 'retry,retry,parked') {
    fail(`failure path ran [${outcomes.join(',')}], expected retry,retry,parked`)
  }
  const { data: parkedJob } = await db
    .from('jobs')
    .select('status, attempts, last_error')
    .eq('application_id', brokenApp!.id)
    .single()
  if (parkedJob?.status !== 'parked' || parkedJob.attempts !== 3) {
    fail(`job ${JSON.stringify(parkedJob)}, expected parked after 3 attempts`)
  }
  ok(`failed stage retried twice then parked (attempts=3, error: ${parkedJob.last_error})`)

  const idleEnd = await advanceOnce(deps)
  if (idleEnd.advanced) fail('parked job must not be re-claimed')
  ok('parked job stays parked — no loop')

  console.log('\nM7 PASS')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
