import { expect, test, type Page } from '@playwright/test'
import { seedSubmittedCase } from './support/seed-case'

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
  'base64',
)

test('missing DBP → DEFICIENT with the document named → resubmission advances with progress', async ({
  page,
}) => {
  const seeded = await seedSubmittedCase({
    companyName: `Kedai Deficiency ${Date.now()}`,
    includeDbp: false,
  })

  await signIn(page, { email: seeded.applicantEmail, password: seeded.applicantPassword })
  await page.goto(`/applications/${seeded.applicationId}`)

  // the page's own polling drives the worker; intake halts the case
  await expect(page.getByTestId('pipeline-progress')).toBeVisible()
  await expect(page.getByTestId('deficiency-notice')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('deficiency-DOC-DBP')).toContainText('Dewan Bahasa dan Pustaka')
  await expect(page.locator('[data-status="DEFICIENT"]')).toBeVisible()

  // the applicant uploads the missing document and resubmits
  await page.getByTestId('file-DOC-DBP').setInputFiles({
    name: 'dbp-approval.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  })
  await page.getByTestId('upload-DOC-DBP').click()
  await expect(page.getByTestId('uploaded-DOC-DBP')).toBeVisible()
  await page.getByTestId('submit-application').click()
  await expect(page.locator('[data-status="SUBMITTED"]')).toBeVisible()

  // resubmission advances through the four agents to ASSESSED
  await expect(page.getByTestId('pipeline-progress')).toBeVisible()
  await expect(page.locator('[data-status="ASSESSED"]')).toBeVisible({ timeout: 60_000 })
})
