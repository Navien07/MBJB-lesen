import { expect, test } from '@playwright/test'
import { TEST_USERS } from './support/stack'

async function signIn(page: import('@playwright/test').Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('an anonymous visitor is sent to the login page', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('an applicant reaches their own dashboard', async ({ page }) => {
  await signIn(page, TEST_USERS.applicant)
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('main').getByText('My applications')).toBeVisible()
})

test('an applicant is refused at /officer', async ({ page }) => {
  await signIn(page, TEST_USERS.applicant)
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/officer')
  await expect(page).toHaveURL(/\/dashboard\?denied=officer/)
  await expect(page.getByTestId('denied-officer')).toBeVisible()
  await expect(page.getByTestId('officer-queue-title')).toHaveCount(0)
})

test('an officer reaches the queue', async ({ page }) => {
  await signIn(page, TEST_USERS.officer)
  await expect(page).toHaveURL(/\/officer/)
  await expect(page.getByTestId('officer-queue-title')).toBeVisible()
})

test('a new applicant can register and lands on an empty dashboard', async ({ page }) => {
  const unique = `register-${Date.now()}@e2e.mbjb.local`
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Reg Istrant')
  await page.getByLabel('Email').fill(unique)
  await page.getByLabel('Password').fill('register-pass-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByTestId('empty-state')).toBeVisible()
})
