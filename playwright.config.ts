import { defineConfig, devices } from '@playwright/test'
import { localStack } from './tests/e2e/support/stack'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100'
const isRemote = Boolean(process.env.PLAYWRIGHT_BASE_URL)

// Remote runs (the @live smoke) use the deployed environment's own Supabase;
// local runs get the local stack's keys injected into the dev server.
const stack = isRemote ? null : localStack()

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: isRemote ? undefined : './tests/e2e/support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // channel:'chrome' uses the system Chrome. This network resets Playwright's
  // browser-download CDN, so the bundled Chromium cannot be fetched here.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: isRemote
    ? undefined
    : {
        command: 'pnpm dev --port 3100',
        url: 'http://localhost:3100/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: stack!.apiUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: stack!.anonKey,
          SUPABASE_SERVICE_ROLE_KEY: stack!.serviceRoleKey,
          AI_GATEWAY_MODE: process.env.AI_GATEWAY_MODE ?? 'replay',
        },
      },
})
