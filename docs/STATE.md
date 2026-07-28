# Session state

**Last gate passed:** M0 — Next.js 15.5.22, strict TS, Tailwind v4, ESLint 9; typecheck+lint+build clean; Supabase (`ugbfvxjmdgznriuuedvn`, ap-southeast-1) and Vercel (`mbjb-lesen`, Navien scope) linked; pushed.
**Next gate:** M1 — schema, RLS, append-only audit_log, human-only terminal transitions, tests in `tests/db` against local Supabase.

**Deviations from spec:** none in product scope.

**Environment notes a fresh session needs:**
- This network's FortiGate MITM-intercepts `registry.npmjs.org` (and only it — github/anthropic/playwright CDNs are clean). Global pnpm config points at `https://registry.npmmirror.com` (same tarball integrity hashes). Do not commit a registry override; Vercel builds use npmjs fine.
- pnpm is brew-installed (11.17.0); the corepack shim was overwritten via `brew link --overwrite pnpm`. `PNPM_HOME=~/Library/pnpm` must be on PATH.
- Container runtime is OrbStack (installed this session) — `docker ok`.
- `.env.local` holds SUPABASE_DB_PASSWORD (generated at project creation), ANTHROPIC_API_KEY, VERCEL_OIDC_TOKEN. Never committed.
- pnpm build-script approvals live in `pnpm-workspace.yaml` (`allowBuilds`).

**OPEN-QUESTIONS additions:** none yet beyond the pack's own unverified rules.

Update this at every gate. A fresh session must be able to resume from this file plus git history alone.
