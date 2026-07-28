import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'tests/db/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/rules/**'],
      thresholds: {
        // This code decides regulatory outcomes. 95 is a floor, not a target.
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 95,
      },
    },
  },
})
