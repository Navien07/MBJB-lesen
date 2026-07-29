/**
 * Resets the remote environment to a single clean, working demo case.
 * Deletes ALL applications (children cascade; audit entries persist by design
 * with application_id nulled), keeps the demo auth accounts, then seeds one
 * SUBMITTED case for applicant-demo-99 with the DBP document missing and an
 * intake job queued — the full deficiency → resubmit → ASSESSED walk.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/reset-demo.ts
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}
const svc = createClient(url, serviceKey, { auth: { persistSession: false } })

async function main() {
  // wipe every application; findings/documents/jobs/escalations/decisions cascade
  const { data: apps } = await svc.from('applications').select('id')
  if (apps && apps.length > 0) {
    const { error } = await svc
      .from('applications')
      .delete()
      .in('id', apps.map((a) => a.id))
    if (error) throw new Error(`cleanup failed: ${error.message}`)
  }
  console.log(`removed ${apps?.length ?? 0} applications`)

  // demo applicant (created by seed-remote; recreate if missing)
  const email = 'applicant-demo-99@mbjb-lesen.local'
  let applicantId: string | undefined
  const { data: created, error: userError } = await svc.auth.admin.createUser({
    email,
    password: 'demo-applicant-99-pass',
    email_confirm: true,
    user_metadata: { full_name: 'Aminah binti Salleh' },
  })
  if (userError) {
    if (!/already been registered/i.test(userError.message)) throw userError
    const { data: list } = await svc.auth.admin.listUsers()
    applicantId = list.users.find((u) => u.email === email)?.id
  } else {
    applicantId = created.user?.id
  }
  if (!applicantId) throw new Error('could not resolve demo applicant')
  await svc.from('profiles').update({ full_name: 'Aminah binti Salleh' }).eq('id', applicantId)

  const { data: app, error: appError } = await svc
    .from('applications')
    .insert({
      applicant_id: applicantId,
      status: 'SUBMITTED',
      applicant_name: 'Aminah binti Salleh',
      ic_or_passport: '800101-01-5566',
      citizenship: 'warganegara',
      correspondence_address: 'No 12, Jalan Dedap 3, Taman Johor Jaya, 81100 Johor Bahru',
      premise_address: 'No 45, Jalan Rosmerah 2/1, Taman Johor Jaya, 81100 Johor Bahru',
      ssm_registration_no: '202301012345',
      company_name: 'Kedai Runcit Aman Jaya',
      property_tax_account_no: 'CH-889900',
      phone: '+60127778888',
      business_activity: 'Kedai runcit',
      floor_area_m2: 85,
      signboard_width_m: 6.0,
      signboard_height_m: 1.2,
    })
    .select('id')
    .single()
  if (appError || !app) throw new Error(`demo case insert: ${appError?.message}`)

  const board = await readFile(path.join(process.cwd(), 'public', 'demo-docs', 'demo-board-086.png'))
  const artworkPath = `${applicantId}/${app.id}/DOC-SIGNBOARD/demo-board-086.png`
  const { error: uploadError } = await svc.storage
    .from('documents')
    .upload(artworkPath, board, { contentType: 'image/png', upsert: true })
  if (uploadError) throw new Error(`artwork upload: ${uploadError.message}`)

  // first submission: everything mandatory except the DBP verification
  const docs: Array<[string, string, string]> = [
    ['DOC-SSM', 'ssm-cert.png', 'image/png'],
    ['DOC-CUKAI', 'cukai-harta-2026.png', 'image/png'],
    ['DOC-ID', 'mykad.png', 'image/png'],
    ['DOC-SIGNBOARD', 'demo-board-086.png', 'image/png'],
    ['DOC-PREMISE', 'tenancy.png', 'image/png'],
    ['DOC-FLOORPLAN', 'floorplan.png', 'image/png'],
  ]
  for (const [docType, filename, mime] of docs) {
    const { error } = await svc.from('documents').insert({
      application_id: app.id,
      doc_type: docType,
      storage_path:
        docType === 'DOC-SIGNBOARD' ? artworkPath : `${applicantId}/${app.id}/${docType}/${filename}`,
      filename,
      mime_type: mime,
    })
    if (error) throw new Error(`document ${docType}: ${error.message}`)
  }

  await svc.from('audit_log').insert({
    application_id: app.id,
    actor_type: 'human',
    actor_id: applicantId,
    action: 'application.submitted',
  })
  const { error: jobError } = await svc
    .from('jobs')
    .insert({ application_id: app.id, stage: 'intake', status: 'queued' })
  if (jobError) throw new Error(`enqueue: ${jobError.message}`)

  console.log(`demo case ready: ${app.id} (SUBMITTED, DBP missing, intake queued)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
