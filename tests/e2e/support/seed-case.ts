import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { localStack } from './stack'

export interface SeededCase {
  applicationId: string
  applicantEmail: string
  applicantPassword: string
}

/**
 * Seeds a submitted application directly (service role) with the demo board
 * artwork and an intake job queued — the pipeline is then driven through the
 * app's own progress endpoint / page polling.
 */
export async function seedSubmittedCase(options: {
  companyName: string
  includeDbp: boolean
}): Promise<SeededCase> {
  const stack = localStack()
  const svc = createClient(stack.apiUrl, stack.serviceRoleKey, { auth: { persistSession: false } })

  const applicantEmail = `seed-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.mbjb.local`
  const applicantPassword = 'seeded-pass-1234'
  const { data: user, error: userError } = await svc.auth.admin.createUser({
    email: applicantEmail,
    password: applicantPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Seeded Applicant' },
  })
  if (userError || !user.user) throw userError ?? new Error('seed user failed')

  const { data: application, error: appError } = await svc
    .from('applications')
    .insert({
      applicant_id: user.user.id,
      status: 'SUBMITTED',
      applicant_name: 'Seeded Applicant',
      ic_or_passport: '800101-01-5566',
      citizenship: 'warganegara',
      correspondence_address: 'No 12, Jalan Dedap 3, Johor Bahru',
      premise_address: 'No 45, Jalan Rosmerah 2/1, Johor Bahru',
      ssm_registration_no: '202301012345',
      company_name: options.companyName,
      property_tax_account_no: 'CH-889900',
      phone: '+60127778888',
      business_activity: 'Kedai runcit',
      floor_area_m2: 85,
      signboard_width_m: 6.0,
      signboard_height_m: 1.2,
    })
    .select('id')
    .single()
  if (appError || !application) throw appError ?? new Error('seed application failed')
  const applicationId = application.id

  const boardPng = await readFile(
    path.join(process.cwd(), 'tests', 'fixtures', 'signboards', 'board-086.png'),
  )
  const artworkPath = `${user.user.id}/${applicationId}/DOC-SIGNBOARD/demo-board-086.png`
  const { error: uploadError } = await svc.storage
    .from('documents')
    .upload(artworkPath, boardPng, { contentType: 'image/png' })
  if (uploadError && !/already exists/i.test(uploadError.message)) throw uploadError

  const docs: Array<[string, string, string]> = [
    ['DOC-SSM', 'ssm-cert.pdf', 'application/pdf'],
    ['DOC-CUKAI', 'cukai-2026.pdf', 'application/pdf'],
    ['DOC-ID', 'mykad.png', 'image/png'],
    ['DOC-SIGNBOARD', 'demo-board-086.png', 'image/png'],
    ['DOC-PREMISE', 'tenancy.pdf', 'application/pdf'],
    ['DOC-FLOORPLAN', 'floorplan.pdf', 'application/pdf'],
  ]
  if (options.includeDbp) docs.push(['DOC-DBP', 'dbp-approval.pdf', 'application/pdf'])

  for (const [docType, filename, mime] of docs) {
    const { error } = await svc.from('documents').insert({
      application_id: applicationId,
      doc_type: docType,
      storage_path:
        docType === 'DOC-SIGNBOARD'
          ? artworkPath
          : `${user.user.id}/${applicationId}/${docType}/${filename}`,
      filename,
      mime_type: mime,
    })
    if (error) throw new Error(`seed document ${docType}: ${error.message}`)
  }

  await svc.from('audit_log').insert({
    application_id: applicationId,
    actor_type: 'human',
    actor_id: user.user.id,
    action: 'application.submitted',
  })
  const { error: jobError } = await svc
    .from('jobs')
    .insert({ application_id: applicationId, stage: 'intake', status: 'queued' })
  if (jobError) throw new Error(`seed job: ${jobError.message}`)

  return { applicationId, applicantEmail, applicantPassword }
}
