# Build plan — outcomes and their proofs

Eleven outcomes. Each states **what must be true** and **the command that proves it**. The commands are the specification; the route to them is yours.

The order below is a suggestion that reflects dependency, not a script. M0–M4 form the spine and M4 carries the credibility of the whole system — it needs no model and no network, so it is cheap to get right early. If the session runs short, a solid M0–M4 plus M8 demonstrates more than eleven partial outcomes.

**M6 is the risky one.** Read its note before you start it.

---

## M0 · The project exists and is wired up

**True when:** Next.js 15 with strict TypeScript builds clean; `.env.local` is gitignored in the very first commit; `.env.example` documents every required variable with no values; Supabase and Vercel projects are linked; the repo is pushed.

```bash
pnpm typecheck && pnpm lint && pnpm build \
  && git log --oneline -3 && supabase --version && vercel --version \
  && ./scripts/scan-secrets.sh && echo "M0 PASS"
```

## M1 · The invariants are enforced by the database, not by convention

**True when:** every table has RLS; applicants can read only their own applications; `audit_log` rejects update and delete; a terminal status transition attempted by a non-human actor fails. All four proven by automated tests against a real local Supabase.

```bash
supabase db reset --local && pnpm vitest run tests/db && echo "M1 PASS"
```

Worth doing once: remove the terminal-transition guard, watch the test go red, put it back. A guard nobody has seen fail is a guard nobody knows works.

## M2 · Roles are separated

**True when:** an applicant reaches their own dashboard and is refused at `/officer`; an officer reaches the queue.

```bash
pnpm test:e2e -- tests/e2e/auth.spec.ts && echo "M2 PASS"
```

## M3 · An application can be submitted with its documents

**True when:** the form carries every Borang field from `CLAUDE.md` §4 and validates; the seven checklist document types upload to Storage; submission moves `DRAFT → SUBMITTED`, creates a row per document, and writes an audit entry.

```bash
pnpm test:e2e -- tests/e2e/submit.spec.ts && echo "M3 PASS"
```

## M4 · The rule engine is correct — **the load-bearing outcome**

**True when** the engine loads the rule pack and evaluates observations into findings shaped per `CLAUDE.md` §1.3, with `produced_by.engine` set and `produced_by.model` null, and all of the following hold:

- the ¾ ratio boundary behaves at 0.74, 0.75 and 0.76, with 0.75 inclusive
- the rule pack's `demo_case` reproduces its `expected_findings` exactly — same rule ids, same statuses, measured ratio 0.86
- a missing DBP document yields a critical `SIGN-DBP-001` failure
- artwork with no Bahasa Melayu run yields a critical `SIGN-LANG-001` failure
- activity text larger than the business name yields a `SIGN-SIZE-001` failure
- every `escalate`-tier rule produces an escalation and never a pass or a fail
- a second rule-pack version leaves historical findings unchanged
- coverage on `lib/rules/` is at least 95%

```bash
pnpm vitest run lib/rules --coverage && echo "M4 PASS"
```

This code decides regulatory outcomes. 95% is a floor, not a target.

## M5 · Documents are classified and deficiencies are named

**True when:** the gateway is the single outbound path, with model id from env, retry, token accounting to the audit log, and PII redaction before any call; and the Intake agent classifies uploads, judges legibility, cross-checks form against documents, and produces a deficiency list that names the specific missing document.

```bash
pnpm vitest run lib/agents/intake && echo "M5 PASS"
```

Unit tests run against recorded fixtures, not the live API. Separately, print one redacted outbound payload so it is visible that no IC number left the machine.

## M6 · Glyph heights can be measured off artwork — **riskiest**

**True when:** the agent reads signboard artwork into `signboard_observations` without judging compliance; measured glyph-height ratios land within **±0.05** of ground truth on two clean generated boards (one at 0.70, one at 0.86); and a deliberately low-resolution board escalates rather than returning a number.

```bash
pnpm vitest run lib/agents/signboard && echo "M6 PASS"
```

Generate the fixtures from SVG so ground truth is exact.

**If ±0.05 is not reachable, do not widen the tolerance.** Change the input contract instead — vector PDF artwork, or declared text heights on the form — and write down what you found. A real constraint on submission quality is worth more to MBJB than a test you moved the goalposts for, and it is exactly what they need to know before committing to Phase 1.

## M7 · The pipeline runs end to end asynchronously

**True when:** submission enqueues a job, a worker advances one stage per invocation, the client shows per-agent progress, the case reaches `ASSESSED`, and the findings in the database match M4's expectations for `demo_case`. A failed stage retries and then parks for a human rather than looping.

```bash
pnpm tsx scripts/e2e-pipeline.ts --fixture demo-case && echo "M7 PASS"
```

## M8 · An officer can review, override, and decide

**True when:** findings are grouped by severity; **clicking a finding opens its evidence** at the document page or signboard region it came from; an override without a written reason is rejected; a decision writes a `decisions` row plus audit entries for both the override and the decision; and the generated letter cites the rule behind each condition.

```bash
pnpm test:e2e -- tests/e2e/officer-decision.spec.ts && echo "M8 PASS"
```

## M9 · The system can account for itself

**True when:** the dashboard shows volume by status, top deficiency reasons, decision mix, and **officer override rate per rule** — prominent, not buried, because it is the honest measure of whether the AI is any good; and the replay view lists a case's full ordered history with confidences, model versions and rule versions, and every human action with its actor and reason.

```bash
pnpm test:e2e -- tests/e2e/dashboard.spec.ts tests/e2e/audit-replay.spec.ts && echo "M9 PASS"
```

## M10 · It works deployed, not just locally

**True when:** secrets are set via `vercel env add` and `supabase secrets set`, migrations are applied to the remote project, ten synthetic applications plus the demo case are seeded, and the full applicant-to-decision path completes against production with a real API call.

```bash
vercel --prod && PLAYWRIGHT_BASE_URL="https://<prod-url>" pnpm test:e2e:smoke \
  && echo "M10 PASS"
```

A green local suite says nothing about the deployment.

---

## Done

```bash
./scripts/verify.sh
```

Then, by hand on the production URL: walk the demo case and screenshot the ¾ finding with its evidence, and walk the low-resolution board to confirm it escalates. The second one is the more persuasive of the two.

---

## Resumption

`docs/STATE.md` must let a fresh session continue from this repo alone: last gate cleared, next gate, any deviation from this spec and why, anything added to `OPEN-QUESTIONS.md`.
