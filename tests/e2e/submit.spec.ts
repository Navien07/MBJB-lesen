import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { localStack, TEST_USERS } from './support/stack'

const BORANG: Array<[string, string]> = [
  ['Applicant full name', 'Aminah binti Salleh'],
  ['MyKad / passport number', '800101-01-5566'],
  ['Phone number', '+60127778888'],
  ['Correspondence address', 'No 12, Jalan Dedap 3, Taman Johor Jaya, 81100 Johor Bahru'],
  ['Company / business name', 'Kedai Runcit Aman Jaya'],
  ['SSM registration number', '202301012345'],
  ['Business activity', 'Kedai runcit'],
  ['Property tax account number', 'CH-889900'],
  ['Premise address', 'No 45, Jalan Rosmerah 2/1, Taman Johor Jaya, 81100 Johor Bahru'],
  ['Floor area (m²)', '85'],
  ['Signboard width (m)', '6.0'],
  ['Signboard height (m)', '1.2'],
]

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
  'base64',
)

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('the empty form validates rather than submits', async ({ page }) => {
  await signIn(page, TEST_USERS.applicant)
  await page.goto('/applications/new')
  await page.getByTestId('save-draft').click()
  await expect(page.getByTestId('form-error')).toBeVisible()
  await expect(page.getByTestId('error-applicant_name')).toBeVisible()
  await expect(page.getByTestId('error-citizenship')).toBeVisible()
  await expect(page).toHaveURL(/\/applications\/new/)
})

test('an application can be submitted with its documents', async ({ page }) => {
  await signIn(page, TEST_USERS.applicant)
  await page.goto('/applications/new')

  for (const [label, value] of BORANG) {
    await page.getByLabel(label).fill(value)
  }
  await page.getByLabel('Citizenship').selectOption('warganegara')
  await page.getByTestId('save-draft').click()

  // draft created, now on the detail page
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}/)
  const applicationId = page.url().match(/applications\/([0-9a-f-]{36})/)![1]
  await expect(page.getByTestId('submit-application')).toBeDisabled()

  // upload all seven checklist document types
  const docIds = [
    'DOC-SSM',
    'DOC-CUKAI',
    'DOC-ID',
    'DOC-SIGNBOARD',
    'DOC-DBP',
    'DOC-PREMISE',
    'DOC-FLOORPLAN',
  ]
  for (const docId of docIds) {
    await page.getByTestId(`file-${docId}`).setInputFiles({
      name: `${docId.toLowerCase()}.png`,
      mimeType: 'image/png',
      buffer: PNG_1PX,
    })
    await page.getByTestId(`upload-${docId}`).click()
    await expect(page.getByTestId(`uploaded-${docId}`)).toBeVisible()
  }

  // submit: DRAFT → SUBMITTED
  await expect(page.getByTestId('submit-hint')).toContainText('ready to submit')
  await page.getByTestId('submit-application').click()
  await expect(page.locator('[data-status="SUBMITTED"]')).toBeVisible()

  // and the database agrees: status, one row per document, audit trail, queued job
  const stack = localStack()
  const svc = createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: application } = await svc
    .from('applications')
    .select('status')
    .eq('id', applicationId)
    .single()
  expect(application?.status).toBe('SUBMITTED')

  const { data: documents } = await svc
    .from('documents')
    .select('doc_type')
    .eq('application_id', applicationId)
  expect(documents?.map((d) => d.doc_type).sort()).toEqual([...docIds].sort())

  const { data: audit } = await svc
    .from('audit_log')
    .select('action, actor_type')
    .eq('application_id', applicationId)
    .order('id', { ascending: true })
  const actions = audit?.map((a) => a.action) ?? []
  expect(actions).toContain('application.draft_created')
  expect(actions.filter((a) => a === 'document.uploaded')).toHaveLength(7)
  expect(actions).toContain('application.submitted')
  expect(audit?.every((a) => a.actor_type === 'human')).toBe(true)

  const { data: jobs } = await svc
    .from('jobs')
    .select('stage, status')
    .eq('application_id', applicationId)
  expect(jobs).toEqual([{ stage: 'intake', status: 'queued' }])
})
