# Session state

**Last gate passed:** M2 (after M4) — auth via @supabase/ssr, middleware session refresh + auth gate, role gate in officer layout; applicant/officer/register flows proven by 5 Playwright tests. M4 done earlier: engine in `lib/rules/` (99%/98% coverage), demo case reproduces exactly, ¾ boundary inclusive.
**Next gate:** M3 — Borang form, 7 document uploads to Storage, DRAFT→SUBMITTED + audit entry.

**M2 implementation notes:**
- Playwright uses `channel: 'chrome'` (system Chrome): the FortiGate resets Playwright's browser CDN downloads; the bundled Chromium cannot be fetched on this network.
- Playwright injects local Supabase URL/keys into the dev server from `supabase status -o env` (see playwright.config.ts); tests are hermetic, no .env.local dependency.
- Fixed test users provisioned idempotently in tests/e2e/support/global-setup.ts; officers are promoted by service role — signup can never mint one (profiles_role_guard trigger, migration 0002).

**M1 implementation notes:**
- This CLI version (2.107) does not auto-grant DML on migration-created tables — explicit grants at the end of the init migration, with audit_log/rules UPDATE/DELETE revoked after.
- `tests/db/helpers.ts` reads local keys via `supabase status -o env` (still emits ANON_KEY/SERVICE_ROLE_KEY alongside new-style keys).
- Gate commands must use `set -o pipefail` when piping vitest to tail — a plain pipe swallows the exit code.

**Deviations from spec:** none in product scope.

**Environment notes a fresh session needs:**
- This network's FortiGate MITM-intercepts `registry.npmjs.org` (and only it — github/anthropic/playwright CDNs are clean). Global pnpm config points at `https://registry.npmmirror.com` (same tarball integrity hashes). Do not commit a registry override; Vercel builds use npmjs fine.
- pnpm is brew-installed (11.17.0); the corepack shim was overwritten via `brew link --overwrite pnpm`. `PNPM_HOME=~/Library/pnpm` must be on PATH.
- Container runtime is OrbStack (installed this session) — `docker ok`.
- `.env.local` holds SUPABASE_DB_PASSWORD (generated at project creation), ANTHROPIC_API_KEY, VERCEL_OIDC_TOKEN. Never committed.
- pnpm build-script approvals live in `pnpm-workspace.yaml` (`allowBuilds`).

**OPEN-QUESTIONS additions:** none yet beyond the pack's own unverified rules.

Update this at every gate. A fresh session must be able to resume from this file plus git history alone.
