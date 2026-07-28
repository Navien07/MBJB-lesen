# Open questions

Seeded before the build starts. Claude Code appends to this as it discovers contradictions.
Nothing here may be silently resolved by picking a value.

## Blocking — needed for the rule pack to be defensible to MBJB

| # | Question | Why it matters | Rule |
|---|---|---|---|
| 1 | Is the 20 ft × 4 ft signboard limit an absolute cap, a default, or does it vary by premise type / storey count? | Sourced from the counter checklist page of the MBJB form, not from the by-law text. Currently tier `recommend` rather than `auto` for this reason. | `SIGN-DIM-001` |
| 2 | Is the ¾ ratio inclusive or exclusive at exactly 0.75? | Decides pass/fail on the boundary. Engine currently treats 0.75 as compliant. | `SIGN-SIZE-002` |
| 3 | When a business is registered in Latin script only, does `SIGN-SIZE-002` apply at all? | By-law text addresses businesses registered in another language. Behaviour for Latin-only registrations is unstated. | `SIGN-SIZE-002` |
| 4 | Which document set is actually mandatory today, and is signboard artwork a formal submission requirement? | Four checklist items are inferred rather than confirmed. | `DOC-*` |
| 5 | What is the charter / SLA period for a licence application decision? | Dashboard SLA tracking has no target to measure against. | — |
| 6 | Is DBP verification obtained by the applicant before submission, or does MBJB route it? | Changes whether it is a blocking document or a workflow step. | `SIGN-DBP-001` |

## Scope

| # | Question |
|---|---|
| 7 | The written proposal assumed the planning-permission pathway (setbacks, plot ratio, parking). The repo name and this build target business licensing instead. Confirm with Farhan which one MBJB's sponsor is funding, and whether the proposal PDF needs reissuing against the licensing pathway. |
| 8 | Which MBJB department owns this — Bahagian Pelesenan, or the planning department that owns i-Rancang? Determines who validates the rule pack. |

## Discovered during build

_Claude Code appends below._

| # | Question | Why it matters |
|---|---|---|
| 9 | New-format SSM registration numbers (12 digits, e.g. `202301012345`) are indistinguishable by pattern from an unhyphenated MyKad number, so the PII redactor masks them too. Over-redaction is the safe default (§1.7), but it removes the SSM number from what the intake model sees, weakening the form-vs-SSM-document cross-check. Options: exempt the `ssm_registration_no` field from NRIC masking (field-aware redaction), or accept the weaker check. Needs a decision on which risk MBJB prefers. | Affects `DOC-CONSIST-001` quality in live mode |
