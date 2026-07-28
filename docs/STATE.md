# Session state

**Last gate passed:** M7 (order so far: M0, M1, M4, M2, M3, M5, M6, M7). Worker in `lib/pipeline/worker.ts` — one stage per invocation, optimistic claim, retry×2 then park. Progress route `app/api/applications/[id]/progress` advances one tick per poll (job rows + polling, §5). Gate: `pnpm tsx scripts/e2e-pipeline.ts --fixture demo-case`.
**Next gate:** M9 — dashboard (volume by status, top deficiencies, decision mix, override rate per rule PROMINENT) + audit replay view. M8 done: officer console at `/officer/cases/[id]` — severity-grouped findings, evidence dialog (signed artwork URL + observation runs), overrides live in the append-only audit log (action `finding.overridden` — this is also what the dashboard override-rate reads), decision + letter; terminal transitions additionally DB-guarded to only leave OFFICER_REVIEW (migration 0004).

**M7 policy decisions (documented, not silent):**
- Deficiency loop: a FIRST submission with missing mandatory docs halts DEFICIENT with a notice; a RESUBMISSION always advances, unresolved deficiencies flow to the officer as findings. This is the only policy satisfying both the E2E-PLAN deficiency row and the M7 "demo case reaches ASSESSED with DBP finding" gate.
- demo_case.expected_findings is signboard-scoped; the full pipeline lawfully adds DOC-COMPLETE-001 (non_compliant, names DOC-DBP) and DOC-CONSIST-001 (compliant) because intake supplies legibility+consistency. Gate asserts exact match on the 8 expected + only those two extras.
- Local stack quirk: if `supabase db reset` fails mid-run ("error running container"), auth (GoTrue) and PostgREST are left with stale/broken state — rerun the reset and `docker restart supabase_auth_mbjb-lesen supabase_rest_mbjb-lesen` if 500s persist.

**M6 — the deviation that matters (also OPEN-QUESTIONS #10):** live check proved multimodal glyph-height *estimation* misses ±0.05 badly (Δ0.161/Δ0.328 at confidence ≈0.94). Tolerance NOT widened. Input contract changed: artwork must be an **annotated production proof** (per-run lettering heights printed on the proof). Model reads annotations (`measurement_basis:"annotation"`); estimates or unreadable proofs escalate. Live re-check: Δ0 on both boards, lowres escalates. Harness: `pnpm tsx --env-file=.env.local scripts/measure-signboard-live.ts` (3 real API calls).

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
