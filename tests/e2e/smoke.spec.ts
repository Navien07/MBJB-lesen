import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

/**
 * Layer 3 @live smoke — one path against the deployed production URL with
 * real API calls. Strict on structure, tolerant on prose (E2E-PLAN).
 *
 *   PLAYWRIGHT_BASE_URL="https://<prod>" \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SMOKE_OFFICER_EMAIL=... SMOKE_OFFICER_PASSWORD=... \
 *   pnpm test:e2e:smoke
 */

const BOARD = readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'signboards', 'board-086.png'),
)
const PDF_STUB = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF',
)

const BORANG: Array<[string, string]> = [
  ['Applicant full name', 'Aminah binti Salleh'],
  ['MyKad / passport number', '800101-01-5566'],
  ['Phone number', '+60127778888'],
  ['Correspondence address', 'No 12, Jalan Dedap 3, Taman Johor Jaya, 81100 Johor Bahru'],
  ['Company / business name', 'Kedai Runcit Aman Jaya (Live Smoke)'],
  ['SSM registration number', '202301012345'],
  ['Business activity', 'Kedai runcit'],
  ['Property tax account number', 'CH-889900'],
  ['Premise address', 'No 45, Jalan Rosmerah 2/1, Taman Johor Jaya, 81100 Johor Bahru'],
  ['Floor area (m²)', '85'],
  ['Signboard width (m)', '6.0'],
  ['Signboard height (m)', '1.2'],
]

test('@live the applicant-to-decision flow completes in production with real API calls', async ({
  page,
}) => {
  test.setTimeout(600_000) // live multimodal stages take tens of seconds each

  const officer = {
    email: process.env.SMOKE_OFFICER_EMAIL ?? 'officer.demo@mbjb-lesen.local',
    password: process.env.SMOKE_OFFICER_PASSWORD ?? '',
  }
  expect(officer.password, 'SMOKE_OFFICER_PASSWORD must be set').toBeTruthy()
  const svcUrl = process.env.SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  expect(svcUrl && svcKey, 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set').toBeTruthy()
  const svc = createClient(svcUrl!, svcKey!, { auth: { persistSession: false } })

  // -- applicant registers and submits the demo case --------------------
  const applicantEmail = `smoke-${Date.now()}@mbjb-lesen.local`
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Aminah binti Salleh')
  await page.getByLabel('Email').fill(applicantEmail)
  await page.getByLabel('Password').fill('smoke-pass-12345')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })

  await page.goto('/applications/new')
  for (const [label, value] of BORANG) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByLabel('Citizenship').selectOption('warganegara')
  await page.getByTestId('save-draft').click()
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}/, { timeout: 30_000 })
  const applicationId = page.url().match(/applications\/([0-9a-f-]{36})/)![1]

  const uploads: Array<[string, string, Buffer, string]> = [
    ['DOC-SSM', 'ssm-cert.pdf', PDF_STUB, 'application/pdf'],
    ['DOC-CUKAI', 'cukai-2026.pdf', PDF_STUB, 'application/pdf'],
    ['DOC-ID', 'mykad.png', BOARD.subarray(0, 4096), 'image/png'],
    ['DOC-SIGNBOARD', 'demo-board-086.png', BOARD, 'image/png'],
    ['DOC-DBP', 'dbp-approval.pdf', PDF_STUB, 'application/pdf'],
    ['DOC-PREMISE', 'tenancy.pdf', PDF_STUB, 'application/pdf'],
    ['DOC-FLOORPLAN', 'floorplan.pdf', PDF_STUB, 'application/pdf'],
  ]
  for (const [docId, name, buffer, mimeType] of uploads) {
    await page.getByTestId(`file-${docId}`).setInputFiles({ name, mimeType, buffer })
    await page.getByTestId(`upload-${docId}`).click()
    await expect(page.getByTestId(`uploaded-${docId}`)).toBeVisible({ timeout: 30_000 })
  }
  await page.getByTestId('submit-application').click()
  await expect(page.locator('[data-status="SUBMITTED"]')).toBeVisible({ timeout: 30_000 })

  // -- the page's polling drives the live pipeline to ASSESSED ----------
  await expect(page.locator('[data-status="ASSESSED"]')).toBeVisible({ timeout: 420_000 })

  // -- structural assertions against the database -----------------------
  const { data: ratioFinding } = await svc
    .from('findings')
    .select('status, observed_value, produced_by')
    .eq('application_id', applicationId)
    .eq('rule_id', 'SIGN-SIZE-002')
    .single()
  expect(ratioFinding?.status).toBe('non_compliant')
  const measured = (ratioFinding?.observed_value as { measured_ratio: number }).measured_ratio
  expect(Math.abs(measured - 0.86)).toBeLessThanOrEqual(0.05)
  expect((ratioFinding?.produced_by as { model: string | null }).model).toBeNull()

  const { data: escalated } = await svc
    .from('findings')
    .select('rule_id, status')
    .eq('application_id', applicationId)
    .in('rule_id', ['SIGN-LANG-002', 'SIGN-NAME-001'])
  expect(escalated?.every((f) => f.status === 'escalated')).toBe(true)
  expect(escalated).toHaveLength(2)

  const { data: aiCalls } = await svc
    .from('audit_log')
    .select('action, model_version, tokens')
    .eq('application_id', applicationId)
    .like('action', 'ai.call.%')
  expect(aiCalls!.length).toBeGreaterThanOrEqual(3) // intake, signboard, copilot
  for (const call of aiCalls!) {
    expect(call.model_version, `${call.action} has a model version`).toBeTruthy()
    expect(call.model_version).not.toBe('replay-simulator')
  }

  // -- officer decides ---------------------------------------------------
  await page.goto('/login')
  await page.getByLabel('Email').fill(officer.email)
  await page.getByLabel('Password').fill(officer.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/officer/, { timeout: 30_000 })

  await page.goto(`/officer/cases/${applicationId}`)
  await page.getByTestId('start-review').click()
  await expect(page.getByTestId('decision-form')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('decision-outcome').selectOption('APPROVED_WITH_CONDITIONS')
  await page.getByTestId('decision-submit').click()
  await expect(page.getByTestId('decision-recorded')).toBeVisible({ timeout: 30_000 })

  // tolerant on prose: non-empty letter of sane length naming a rule id
  const { data: decision } = await svc
    .from('decisions')
    .select('letter_md, outcome')
    .eq('application_id', applicationId)
    .single()
  expect(decision?.outcome).toBe('APPROVED_WITH_CONDITIONS')
  expect(decision!.letter_md.length).toBeGreaterThan(100)
  expect(decision!.letter_md.length).toBeLessThan(20_000)
  expect(decision!.letter_md).toMatch(/SIGN-[A-Z]+-\d+/)

  // -- and the audit replays ---------------------------------------------
  await page.goto(`/officer/cases/${applicationId}/replay`)
  await expect(page.getByTestId('replay-timeline')).toBeVisible()
  await expect(page.getByTestId('replay-decision.recorded')).toBeVisible()
})
