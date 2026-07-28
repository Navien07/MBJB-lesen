# Testing strategy

Two different things get called "AI in the tests" here. Conflating them produces a suite that passes while the system is broken and fails while it is fine.

| | **Live AI inside the product** | **AI driving the browser** |
|---|---|---|
| What | The four agents really calling the API during a run | A model clicking the UI and judging whether it looks right |
| Deterministic | No | No |
| Fit as a CI gate | Yes, in exactly one narrow smoke test | No |
| Role here | Prove the real pipeline works end to end at least once | Advisory exploratory pass, never blocking |

---

## Layer 1 · Unit — deterministic, no network

The whole rule engine at ≥95% coverage, including the ¾ boundary and the `demo_case` reproduction. Agent logic against **recorded** API responses, one per agent, replayed. The database invariants from M1.

Runs on every commit. If a unit test needs an API key, it is written wrong.

## Layer 2 · Deterministic E2E — **the CI gate**

Real browser, real local Supabase, **stubbed gateway** via `AI_GATEWAY_MODE=replay`. Fast, free, repeatable, and it still exercises every route, RLS policy, state transition and screen.

Coverage required:

| Area | Must prove |
|---|---|
| Auth | Role separation; applicant refused at `/officer` |
| Submission | Form validation, seven uploads, `DRAFT → SUBMITTED`, audit entry |
| Deficiency loop | Missing DBP document → `DEFICIENT` → notice names that document → resubmission advances |
| Pipeline | Job advances through four agents with visible per-agent progress |
| Officer decision | Evidence opens on click; override rejected without a reason; decision writes rows; letter cites rules |
| Escalation | `SIGN-LANG-002` and `SIGN-NAME-001` surface as escalations, not as passes or fails |
| Audit replay | Full ordered history with model and rule versions |
| Dashboard | Override rate present and correct |

Screenshot on failure, retained. Wait on state, never on time.

## Layer 3 · Live smoke — one spec, real API, against production

Tagged `@live` and excluded from the default run. One path: submit the demo case, real pipeline with real calls, officer decides, audit replays.

**Strict on structure, tolerant on prose.** Strict: the case reaches `ASSESSED`; `SIGN-SIZE-002` exists as `non_compliant` with a measured ratio of 0.86 ± 0.05; both escalate-tier rules produced escalations; every agent has an audit entry with a non-null model version. Tolerant: never assert the Copilot's wording — only that the letter is non-empty, names the rule id, and is a sane length.

Asserting on generated prose is how you get a suite that goes red every time the model rephrases something.

```bash
PLAYWRIGHT_BASE_URL="https://<prod-url>" pnpm test:e2e:smoke
```

## Layer 4 · AI exploratory pass — advisory, never blocking

After M10, optionally point a browser-driving agent at production: *"submit a licence application as an applicant, then review and decide it as an officer, and report anything confusing, broken or misleading."*

Output is a bug report for a human to triage. Not in CI. Not a gate. It is genuinely good at finding dead ends and confusing states that scripted tests miss, because scripted tests only walk the paths someone already thought of — and genuinely bad as a regression signal.

---

## Before the demo

1. `./scripts/verify.sh` green locally
2. `@live` smoke green against production
3. The demo case walked by hand on production, ¾ finding and its evidence screenshotted
4. The low-resolution signboard walked by hand, confirming it escalates instead of guessing

Item 4 carries more weight than it looks. Showing a regulator that the system declines when unsure is more convincing than showing it succeed, and it answers the first question any licensing officer will ask.
