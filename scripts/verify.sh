#!/usr/bin/env bash
# MBJB-lesen -- full local verification gate.
# Exits non-zero on the first failure. No step may be skipped to get a green run.
set -euo pipefail

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "0 · Secret hygiene"
./scripts/scan-secrets.sh

step "1 · Static analysis"
pnpm typecheck
pnpm lint
pass "typecheck + lint"

step "2 · Rule engine, no network, coverage >= 95%"
pnpm vitest run lib/rules --coverage
pass "rule engine incl. 3/4 boundary and demo case"

step "3 · Agent logic against recorded fixtures"
pnpm vitest run lib/agents
pass "agents"

step "4 · Database invariants"
pnpm vitest run tests/db
pass "append-only audit log, human-only terminal transitions"

step "5 · Production build"
pnpm build
pass "build"

step "6 · Deterministic E2E, replayed gateway"
AI_GATEWAY_MODE=replay pnpm test:e2e
pass "e2e"

step "7 · Unverified rules are still recorded as unverified"
test -s docs/OPEN-QUESTIONS.md || fail "docs/OPEN-QUESTIONS.md is missing or empty"
for rule in SIGN-DIM-001 SIGN-SIZE-002; do
  grep -q "$rule" docs/OPEN-QUESTIONS.md \
    || fail "$rule is not verified against the by-law and must remain in OPEN-QUESTIONS.md"
done
pass "open questions intact"

step "8 · Session state is resumable"
test -s docs/STATE.md || fail "docs/STATE.md is missing or empty"
pass "state recorded"

printf '\n\033[1;32mALL LOCAL GATES PASS\033[0m\n\n'
printf 'Still required before the demo:\n'
printf '  1. PLAYWRIGHT_BASE_URL="https://<prod-url>" pnpm test:e2e:smoke   (real API, production)\n'
printf '  2. demo case walked by hand on production; 3/4 finding + evidence screenshotted\n'
printf '  3. low-resolution signboard walked by hand; confirm it ESCALATES\n'
