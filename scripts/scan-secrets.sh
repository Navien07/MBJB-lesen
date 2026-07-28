#!/usr/bin/env bash
# Secret-hygiene scan, isolated in its own file.
#
# Kept separate so it can be replaced with gitleaks/trufflehog, or dropped,
# without touching verify.sh. If Claude Code's safety classifier flags a
# session, this file's credential patterns are the most likely trigger --
# swap this script out rather than editing anything else.
set -euo pipefail

fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; exit 1; }

# 1 · no environment files tracked, except documented templates
if git ls-files \
   | grep -E '(^|/)\.env($|\.)' \
   | grep -qvE '\.(example|sample|template)$' ; then
  printf '  \033[31mFAIL\033[0m  an .env file is tracked by git:\n'
  git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.(example|sample|template)$'
  exit 1
fi

# 2 · no credential-shaped strings in tracked files
pattern='(sk-ant-[A-Za-z0-9_-]{24,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,})'
if git grep -InE "$pattern" -- . ':!*.example' ':!scripts/scan-secrets.sh' >/dev/null 2>&1; then
  printf '  \033[31mFAIL\033[0m  credential-shaped string found in:\n'
  git grep -lE "$pattern" -- . ':!*.example' ':!scripts/scan-secrets.sh' || true
  exit 1
fi

printf '  \033[32mPASS\033[0m  secret hygiene\n'
