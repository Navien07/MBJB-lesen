# Session state

**Last gate passed:** M1 — full schema in `supabase/migrations/20260728000001_init.sql`; RLS on all 10 tables; append-only audit_log + immutable rules (trigger + revoked grants); terminal transitions human-officer-only via `applications_terminal_guard` (auth.uid() null for service role ⇒ workers physically blocked); 17 tests in `tests/db` green against local stack. Guard falsification done: trigger dropped → 2 tests red → restored → green.
**Next gate:** M4 (rule engine — types.ts and derive.ts already written, engine.ts + tests pending), then back to M2/M3 UI. M4 before M2 because it is the load-bearing outcome and needs no UI.

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
