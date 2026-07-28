/**
 * M10 remote seeding: a demo officer, ten synthetic applications across the
 * status spectrum, and the demo case ready to walk by hand. Decisions are
 * made the honest way — by signing in as the officer — because the database
 * physically refuses terminal transitions from the service role.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *   SMOKE_OFFICER_EMAIL=... SMOKE_OFFICER_PASSWORD=... \
 *   pnpm tsx scripts/seed-remote.ts
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY
const officerEmail = process.env.SMOKE_OFFICER_EMAIL ?? 'officer.demo@mbjb-lesen.local'
const officerPassword = process.env.SMOKE_OFFICER_PASSWORD

if (!url || !serviceKey || !anonKey || !officerPassword) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY and SMOKE_OFFICER_PASSWORD are required')
  process.exit(1)
}

const svc = createClient(url, serviceKey, { auth: { persistSession: false } })

const ACTIVITIES = [
  'Kedai runcit', 'Restoran', 'Kedai gunting rambut', 'Farmasi', 'Kedai basikal',
  'Butik pakaian', 'Kedai elektrik', 'Pusat tuisyen', 'Kedai kek', 'Bengkel motosikal',
]

async function ensureOfficer(): Promise<string> {
  const { data: created, error } = await svc.auth.admin.createUser({
    email: officerEmail,
    password: officerPassword!,
    email_confirm: true,
    user_metadata: { full_name: 'Pegawai Demo MBJB' },
  })
  let officerId = created?.user?.id
  if (error) {
    if (!/already been registered/i.test(error.message)) throw error
    const { data: list } = await svc.auth.admin.listUsers()
    officerId = list.users.find((u) => u.email === officerEmail)?.id
  }
  if (!officerId) throw new Error('could not resolve officer id')
  const { error: roleError } = await svc
    .from('profiles')
    .update({ role: 'officer', full_name: 'Pegawai Demo MBJB' })
    .eq('id', officerId)
  if (roleError) throw roleError
  console.log(`officer ready: ${officerEmail}`)
  return officerId
}

async function seedApplicant(index: number): Promise<string> {
  const email = `applicant-demo-${index}@mbjb-lesen.local`
  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password: `demo-applicant-${index}-pass`,
    email_confirm: true,
    user_metadata: { full_name: `Pemohon Demo ${index}` },
  })
  if (error) {
    if (!/already been registered/i.test(error.message)) throw error
    const { data: list } = await svc.auth.admin.listUsers()
    return list.users.find((u) => u.email === email)!.id
  }
  return created.user!.id
}

async function main() {
  const officerId = await ensureOfficer()

  // ten synthetic applications across the non-terminal statuses
  const statuses = [
    'DRAFT', 'SUBMITTED', 'SUBMITTED', 'INTAKE_CHECK', 'DEFICIENT',
    'ANALYSING', 'ASSESSED', 'OFFICER_REVIEW', 'OFFICER_REVIEW', 'OFFICER_REVIEW',
  ]
  const created: Array<{ id: string; status: string }> = []
  for (let i = 0; i < 10; i++) {
    const applicantId = await seedApplicant(i + 1)
    const { data: existing } = await svc
      .from('applications')
      .select('id, status')
      .eq('applicant_id', applicantId)
      .eq('company_name', `Syarikat Demo ${i + 1} Sdn Bhd`)
      .limit(1)
    if (existing && existing.length > 0) {
      created.push(existing[0])
      continue
    }
    const { data: app, error } = await svc
      .from('applications')
      .insert({
        applicant_id: applicantId,
        status: statuses[i],
        applicant_name: `Pemohon Demo ${i + 1}`,
        ic_or_passport: `80010${i}-01-55${10 + i}`,
        citizenship: 'warganegara',
        correspondence_address: `No ${i + 1}, Jalan Dedap ${i + 1}, Johor Bahru`,
        premise_address: `No ${10 + i}, Jalan Rosmerah 2/${i + 1}, Johor Bahru`,
        ssm_registration_no: `20230101${1000 + i}`,
        company_name: `Syarikat Demo ${i + 1} Sdn Bhd`,
        property_tax_account_no: `CH-8899${10 + i}`,
        phone: `+6012777${1000 + i}`,
        business_activity: ACTIVITIES[i],
        floor_area_m2: 60 + i * 10,
        signboard_width_m: 4 + (i % 3),
        signboard_height_m: 1 + (i % 2) * 0.2,
      })
      .select('id, status')
      .single()
    if (error) throw error
    created.push(app)

    if (statuses[i] === 'DEFICIENT') {
      const notice = {
        deficiencies: [
          {
            doc_id: 'DOC-DBP',
            label: 'Dewan Bahasa dan Pustaka (DBP) verification or approval of signboard content and visual',
            reason: 'Mandatory document not uploaded.',
          },
        ],
      }
      await svc.from('applications').update({ deficiency_notice: notice }).eq('id', app.id)
      await svc.from('audit_log').insert({
        application_id: app.id,
        actor_type: 'agent',
        actor_id: 'intake',
        action: 'deficiency.notice_issued',
        detail: notice,
      })
    }
  }
  console.log(`synthetic applications: ${created.length}`)

  // decide two OFFICER_REVIEW cases properly, as the signed-in officer
  const officerClient = createClient(url!, anonKey!, { auth: { persistSession: false } })
  const { error: signInError } = await officerClient.auth.signInWithPassword({
    email: officerEmail,
    password: officerPassword!,
  })
  if (signInError) throw signInError

  const reviewCases = created.filter((c) => c.status === 'OFFICER_REVIEW').slice(0, 2)
  const outcomes = ['APPROVED', 'REJECTED'] as const
  for (const [index, kase] of reviewCases.entries()) {
    const { data: already } = await officerClient
      .from('decisions')
      .select('id')
      .eq('application_id', kase.id)
      .limit(1)
    if (already && already.length > 0) continue
    const outcome = outcomes[index]
    const { error: decisionError } = await officerClient.from('decisions').insert({
      application_id: kase.id,
      officer_id: officerId,
      outcome,
      conditions: [],
      letter_md: `## Keputusan\n\nPermohonan ${outcome === 'APPROVED' ? 'diluluskan' : 'ditolak'} (kes demo).\n\nApplication ${outcome.toLowerCase()} (seeded demo case).`,
    })
    if (decisionError) throw decisionError
    const { error: statusError } = await officerClient
      .from('applications')
      .update({ status: outcome })
      .eq('id', kase.id)
    if (statusError) throw statusError
    await officerClient.from('audit_log').insert({
      application_id: kase.id,
      actor_type: 'human',
      actor_id: officerId,
      action: 'decision.recorded',
      detail: { outcome, seeded: true },
    })
    console.log(`decided ${kase.id}: ${outcome}`)
  }

  // the demo case, ready to walk by hand: submitted with the annotated board
  const demoApplicantId = await seedApplicant(99)
  const { data: existingDemo } = await svc
    .from('applications')
    .select('id')
    .eq('applicant_id', demoApplicantId)
    .eq('company_name', 'Kedai Runcit Aman Jaya')
    .limit(1)
  if (!existingDemo || existingDemo.length === 0) {
    const { data: demoApp, error: demoError } = await svc
      .from('applications')
      .insert({
        applicant_id: demoApplicantId,
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
    if (demoError) throw demoError

    const board = await readFile(
      path.join(process.cwd(), 'tests', 'fixtures', 'signboards', 'board-086.png'),
    )
    const artworkPath = `${demoApplicantId}/${demoApp.id}/DOC-SIGNBOARD/demo-board-086.png`
    await svc.storage.from('documents').upload(artworkPath, board, { contentType: 'image/png' })

    const docs: Array<[string, string, string]> = [
      ['DOC-SSM', 'ssm-cert.pdf', 'application/pdf'],
      ['DOC-CUKAI', 'cukai-2026.pdf', 'application/pdf'],
      ['DOC-ID', 'mykad.png', 'image/png'],
      ['DOC-SIGNBOARD', 'demo-board-086.png', 'image/png'],
      ['DOC-PREMISE', 'tenancy.pdf', 'application/pdf'],
      ['DOC-FLOORPLAN', 'floorplan.pdf', 'application/pdf'],
    ]
    for (const [docType, filename, mime] of docs) {
      await svc.from('documents').insert({
        application_id: demoApp.id,
        doc_type: docType,
        storage_path:
          docType === 'DOC-SIGNBOARD'
            ? artworkPath
            : `${demoApplicantId}/${demoApp.id}/${docType}/${filename}`,
        filename,
        mime_type: mime,
      })
    }
    await svc.from('audit_log').insert({
      application_id: demoApp.id,
      actor_type: 'human',
      actor_id: demoApplicantId,
      action: 'application.submitted',
    })
    await svc.from('jobs').insert({ application_id: demoApp.id, stage: 'intake', status: 'queued' })
    console.log(`demo case ready (missing DBP for the deficiency walk): ${demoApp.id}`)
  } else {
    console.log(`demo case already present: ${existingDemo[0].id}`)
  }

  console.log('remote seed complete')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
