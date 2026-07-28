# MBJB-lesen — AI-assisted business licence review

Agentic AI layer for **Lesen Premis Perniagaan & Iklan** applications at Majlis Bandaraya Johor Bahru. An applicant submits a licence application with supporting documents and signboard artwork; AI agents check completeness and by-law compliance and draft an assessment; **an MBJB licensing officer makes the decision.**

Built by Iceberg AI Solutions Agency Sdn Bhd for partner discussion with FY Intech. POC / MVP — not production.

---

## 1. Invariants

Seven properties the finished system must have. These are not preferences and not negotiable; everything else in this file is context you may reason about and depart from with a stated reason.

1. **The AI never decides.** Every agent output is a recommendation with evidence. Only a human officer action can move an application to a terminal state. There must be no code path by which an agent writes a terminal decision — enforced in the database, not only in the UI.

2. **Compliance verdicts come from the rule engine, never from a model.** The model extracts observations and writes prose. A deterministic function evaluates observations against `docs/rules/uuk-iklan-mbjb-2010.json` and produces the verdict. A finding with a null `produced_by.engine` and a non-null `produced_by.model` is a defect.

3. **Every finding is traceable** — rule id, rule version, required value, observed value, confidence, a pointer to the evidence it came from, and the model and engine versions involved.

4. **Low confidence escalates rather than guesses.** Below threshold, or where two extraction methods disagree, the agent emits an escalation for officer determination. An escalation is a normal output, not an error.

5. **The audit log is append-only.** No update, no delete, enforced at the database level.

6. **Rules are data.** Changing a threshold must not require a code change. Rule versions are immutable, and historical findings stay reproducible against the version in force when they were made.

7. **No secrets in git.** Not in source, tests, seeds, or fixtures.

---

## 2. Scope

### In
Applicant sign-in, application form, document and signboard upload, submission, deficiency notice, resubmission · the four-agent pipeline · officer console with per-finding evidence, override-with-reason, and decision plus generated letter · append-only audit log with case replay · dashboard including officer override rate · deterministic Playwright E2E plus one live-API smoke test · deployed via GitHub to Vercel on Supabase, with seeded demo data.

### Out — not built, not scaffolded, not stubbed "for later"
The planning-permission / *Kebenaran Merancang* pathway · any live integration with i-Rancang, OSC 3.0 Plus, GeoJB, PBTPay or SISPAA · a real DBP API integration, since DBP verification is treated as an applicant-supplied document · payments, fee calculation, licence issuance, renewals · premise inspection scheduling · GIS or PostGIS, since licensing has no geometry · Bahasa Melayu localisation of the UI chrome, though generated *content* is bilingual · mobile apps, PWA, offline · multi-tenancy for other PBTs.

If something in the Out list turns out to be necessary, record it in `docs/OPEN-QUESTIONS.md` and keep going. Do not quietly add it.

---

## 3. Stack

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Deploys natively to Vercel |
| UI | Tailwind + shadcn/ui | The officer console should look like a tool, not a demo |
| DB / Auth / Storage | Supabase, RLS on every table | Managed through the `supabase` CLI |
| Migrations | `supabase/migrations/*.sql`, committed | No dashboard-only schema changes |
| Model access | Anthropic API behind `lib/ai/gateway.ts` | One choke point for model id, retry, redaction, token accounting |
| Long work | Job rows plus polling | See §5 |
| Rule engine | Pure TypeScript in `lib/rules/`, Vitest | No I/O, no network, no model |
| Tests | Vitest and Playwright | `docs/E2E-PLAN.md` |
| Deploy | GitHub → Vercel via the `vercel` CLI | Preview on branch, production on main |

Deliberately dropped from the earlier written proposal: Python/FastAPI, PostGIS, MinIO, Docker Compose. Those suited a locally-hosted planning-permission build with heavy geometry. This is a licensing build on Vercel and Supabase, so it is all TypeScript and there is no geometry. The proposal PDF is stale on stack; it remains correct on architecture and governance.

---

## 4. Domain

Tables, all with RLS: `profiles` · `applications` (the MBJB Borang fields: applicant name, IC or passport, citizenship, correspondence address, premise address, SSM registration no, company name, property tax account no, phone, business activity, floor area m², signboard size m², plus status and risk tier) · `documents` · `signboard_observations` (per text run: string, script, language, role, relative glyph height, bbox, confidence) · `findings` · `escalations` · `decisions` · `audit_log` · `jobs` · `rules`.

Status machine:

```
DRAFT → SUBMITTED → INTAKE_CHECK
      → DEFICIENT ⇄ SUBMITTED
      → ANALYSING → ASSESSED → OFFICER_REVIEW
      → APPROVED | APPROVED_WITH_CONDITIONS | AMENDMENT_REQUESTED | REJECTED
      → CLOSED
```

The four terminal outcomes are reachable only from `OFFICER_REVIEW`, and only by a human actor.

---

## 5. The pipeline

1. **Intake & Classification** — classify uploads against the mandatory checklist, judge legibility, cross-check consistency between form and documents, emit a readiness score and a plain-language deficiency list.
2. **Signboard Analysis** — multimodal read of the artwork into `signboard_observations`. This is measurement only; it must not judge compliance.
3. **Compliance Assessment** — pure function over application, documents and observations. No network.
4. **Officer Copilot** — given findings as facts it may not contradict, drafts the officer brief, ranks risk, produces a bilingual decision letter. Omits rather than fills where it lacks grounding.

**Execution.** A multimodal call over artwork plus documents takes tens of seconds and can exceed a serverless function limit. Submission enqueues a job and returns; a worker advances one stage per invocation; the client polls and shows per-agent progress. Set `maxDuration` explicitly after checking the actual limit on this Vercel plan rather than assuming one — the job pattern is what makes the design robust to whatever that limit is.

---

## 6. Conventions

TypeScript strict, no `any` in `lib/` · Zod at every agent and API boundary, parse rather than cast · rule ids stable and never reused · store SI, display imperial alongside where MBJB's own forms use feet · migrations forward-only and committed · conventional commits with the gate id in the subject, e.g. `feat(M4): rule engine with ¾ font-size boundary tests`.
