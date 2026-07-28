import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { seedSubmittedCase } from './support/seed-case'
import { localStack, TEST_USERS } from './support/stack'

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Drives the pipeline through the app's own progress endpoint. */
async function driveToAssessed(page: Page, applicationId: string) {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/applications/${applicationId}/progress`)
        if (!res.ok()) return `http ${res.status()}`
        return ((await res.json()) as { status: string }).status
      },
      { timeout: 60_000, intervals: [750] },
    )
    .toBe('ASSESSED')
}

test('an officer can review evidence, override with a reason, and decide', async ({ page }) => {
  const seeded = await seedSubmittedCase({
    companyName: `Kedai Runcit Aman Jaya ${Date.now()}`,
    includeDbp: true,
  })

  await signIn(page, TEST_USERS.officer)
  await expect(page).toHaveURL(/\/officer/)

  await driveToAssessed(page, seeded.applicationId)

  await page.goto(`/officer/cases/${seeded.applicationId}`)
  await expect(page.getByTestId('case-title')).toBeVisible()

  // findings are grouped by severity
  await expect(page.getByTestId('severity-critical')).toBeVisible()
  await expect(page.getByTestId('severity-major')).toBeVisible()
  await expect(page.getByTestId('severity-major').getByTestId('finding-SIGN-SIZE-002')).toBeVisible()

  // clicking a finding opens its evidence at the signboard region
  await page.getByTestId('finding-SIGN-SIZE-002').click()
  await expect(page.getByTestId('evidence-artwork')).toBeVisible()
  await expect(page.getByTestId('evidence-observations')).toContainText('安泰杂货店')
  await expect(page.getByTestId('evidence-observed')).toContainText('0.86')

  // an override without a written reason is rejected
  await page.getByTestId('override-submit-SIGN-SIZE-002').click()
  await expect(page.getByTestId('override-error-SIGN-SIZE-002')).toContainText(/written reason/i)

  // with a reason it is recorded
  await page
    .getByTestId('override-reason-SIGN-SIZE-002')
    .fill('Board is grandfathered under the 2008 licence; ratio accepted for renewal period.')
  await page.getByTestId('override-submit-SIGN-SIZE-002').click()
  await expect(page.getByTestId('overridden-SIGN-SIZE-002')).toBeVisible()
  await page.keyboard.press('Escape')

  // start the review, then decide with conditions
  await page.getByTestId('start-review').click()
  await expect(page.getByTestId('decision-form')).toBeVisible()

  const letter = page.getByTestId('decision-letter')
  await expect(letter).toContainText(/SIGN-SIZE-002/) // the draft cites the rule
  await page.getByTestId('decision-outcome').selectOption('APPROVED_WITH_CONDITIONS')
  await page.getByTestId('decision-submit').click()

  await expect(page.getByTestId('decision-recorded')).toBeVisible()
  await expect(page.locator('[data-status="APPROVED_WITH_CONDITIONS"]')).toBeVisible()

  // and the database backs all of it
  const stack = localStack()
  const svc = createClient(stack.apiUrl, stack.serviceRoleKey, { auth: { persistSession: false } })

  const { data: decision } = await svc
    .from('decisions')
    .select('outcome, letter_md, conditions, officer_id')
    .eq('application_id', seeded.applicationId)
    .single()
  expect(decision?.outcome).toBe('APPROVED_WITH_CONDITIONS')
  expect(decision?.letter_md).toContain('SIGN-SIZE-002')
  const conditions = decision?.conditions as Array<{ rule_id: string }>
  expect(conditions.some((c) => c.rule_id === 'SIGN-SIZE-002')).toBe(true)

  const { data: audit } = await svc
    .from('audit_log')
    .select('action, actor_type, detail')
    .eq('application_id', seeded.applicationId)
    .in('action', ['finding.overridden', 'decision.recorded'])
  const overrideEntries = audit?.filter((a) => a.action === 'finding.overridden') ?? []
  expect(overrideEntries).toHaveLength(1) // the reasonless attempt wrote nothing
  expect(overrideEntries[0].actor_type).toBe('human')
  expect((overrideEntries[0].detail as { reason: string }).reason).toContain('grandfathered')
  const decisionEntries = audit?.filter((a) => a.action === 'decision.recorded') ?? []
  expect(decisionEntries).toHaveLength(1)
  expect(decisionEntries[0].actor_type).toBe('human')
})
