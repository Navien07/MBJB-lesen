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

test('the replay lists the full ordered history with versions, actors and reasons', async ({
  page,
}) => {
  const seeded = await seedSubmittedCase({
    companyName: `Kedai Replay ${Date.now()}`,
    includeDbp: true,
  })

  await signIn(page, TEST_USERS.officer)
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/applications/${seeded.applicationId}/progress`)
        return res.ok() ? ((await res.json()) as { status: string }).status : 'error'
      },
      { timeout: 60_000, intervals: [750] },
    )
    .toBe('ASSESSED')

  // one human override so the replay carries a reasoned human action
  const stack = localStack()
  const svc = createClient(stack.apiUrl, stack.serviceRoleKey, { auth: { persistSession: false } })
  const { data: finding } = await svc
    .from('findings')
    .select('id')
    .eq('application_id', seeded.applicationId)
    .eq('rule_id', 'SIGN-SIZE-002')
    .single()
  const { data: officerProfile } = await svc
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'officer')
    .limit(1)
    .single()
  await svc.from('audit_log').insert({
    application_id: seeded.applicationId,
    actor_type: 'human',
    actor_id: officerProfile!.id,
    action: 'finding.overridden',
    detail: {
      finding_id: finding!.id,
      rule_id: 'SIGN-SIZE-002',
      from_status: 'non_compliant',
      to_status: 'acceptable',
      reason: 'replay test: measured board accepted for the renewal period',
    },
  })

  await page.goto(`/officer/cases/${seeded.applicationId}/replay`)

  const timeline = page.getByTestId('replay-timeline')
  await expect(timeline).toBeVisible()

  // the pipeline's whole trail, in order
  for (const action of [
    'application.submitted',
    'ai.call.intake',
    'intake.completed',
    'ai.call.signboard',
    'signboard.measured',
    'compliance.evaluated',
    'ai.call.copilot',
    'copilot.completed',
  ]) {
    await expect(timeline.getByTestId(`replay-${action}`).first()).toBeVisible()
  }

  // entries are ordered: submission strictly before the copilot completion
  const actions = await timeline.locator('[data-testid^="replay-"]').all()
  const ids = await Promise.all(actions.map((a) => a.getAttribute('data-testid')))
  expect(ids.indexOf('replay-application.submitted')).toBeLessThan(
    ids.indexOf('replay-copilot.completed'),
  )

  // model and rule versions are on the record
  await expect(timeline.getByTestId('model-version').first()).toContainText('replay-simulator')
  await expect(timeline.getByTestId('rule-version').first()).toContainText('2010.1-draft')

  // the human action carries its actor and reason
  const override = timeline.getByTestId('replay-finding.overridden')
  await expect(override).toContainText(officerProfile!.full_name)
  await expect(override.getByTestId('replay-reason')).toContainText('renewal period')

  // findings appear with confidence and provenance
  await expect(page.getByTestId('replay-findings')).toContainText('SIGN-SIZE-002')
  await expect(page.getByTestId('replay-findings')).toContainText('mbjb-rule-engine')
})
