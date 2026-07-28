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

test('the dashboard shows volume, deficiencies, decision mix, and a correct override rate', async ({
  page,
}) => {
  const stack = localStack()
  const svc = createClient(stack.apiUrl, stack.serviceRoleKey, { auth: { persistSession: false } })

  // a fresh assessed case, then one recorded override on its ratio finding
  const seeded = await seedSubmittedCase({
    companyName: `Kedai Dashboard ${Date.now()}`,
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

  const { data: finding } = await svc
    .from('findings')
    .select('id, rule_id')
    .eq('application_id', seeded.applicationId)
    .eq('rule_id', 'SIGN-SIZE-002')
    .single()
  const { data: officerProfile } = await svc
    .from('profiles')
    .select('id')
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
      reason: 'dashboard test override',
    },
  })

  // compute the expected rate from the database itself (shared test state)
  const { count: totalFindings } = await svc
    .from('findings')
    .select('id', { count: 'exact', head: true })
    .eq('rule_id', 'SIGN-SIZE-002')
  const { data: allOverrides } = await svc
    .from('audit_log')
    .select('detail')
    .eq('action', 'finding.overridden')
  const totalOverrides = (allOverrides ?? []).filter(
    (o) => (o.detail as { rule_id?: string }).rule_id === 'SIGN-SIZE-002',
  ).length
  const expectedRate = `${Math.round((totalOverrides / totalFindings!) * 1000) / 10}%`

  await page.goto('/officer/dashboard')

  // override rate is the first card on the page — prominent, not buried
  const firstCard = page.locator('[data-slot="card"]').first()
  await expect(firstCard.getByText('Officer override rate per rule')).toBeVisible()
  await expect(page.getByTestId('override-rate-SIGN-SIZE-002')).toHaveText(expectedRate)

  await expect(page.getByTestId('volume-by-status')).toBeVisible()
  await expect(page.getByTestId('deficiency-reasons')).toBeVisible()
  await expect(page.getByTestId('decision-mix')).toBeVisible()
})
