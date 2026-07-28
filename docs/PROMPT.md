# Kickoff — Fable 5

Preflight in `SETUP.md` must be green first, and this pack must already be committed so Claude reads `CLAUDE.md` on start.

Launch, then configure the session:

```bash
cd ~/mbjb-lesen
claude --model fable
```

In the session, before pasting anything:

```
/status                 # confirm the model is Fable 5
/effort ultracode       # xhigh reasoning + workflow orchestration, session-only
/config                 # turn OFF "switch models when a message is flagged"
```

That last one matters. A cybersecurity-flagged request re-runs on Opus 4.8 and **the session then continues on Opus 4.8**, so a single flag silently costs you the model you chose. With auto-switch off you get a prompt instead and can edit and retry.

---

## Step 1 — set the goal

```
/goal ./scripts/verify.sh exits 0, and the full applicant-to-decision flow completes against the deployed Vercel production URL with a real Anthropic API call.
```

## Step 2 — paste this

---

`CLAUDE.md`, `docs/BUILD-PLAN.md`, `docs/E2E-PLAN.md` and `docs/rules/uuk-iklan-mbjb-2010.json` define the outcome. Read them and build it.

Done means: `./scripts/verify.sh` exits 0, and the same applicant-to-decision flow completes against the deployed Vercel production URL against a real API call.

`CLAUDE.md` §1 lists seven invariants you cannot design around, and `docs/BUILD-PLAN.md` gives eleven outcomes each with a command that proves it. Those are the shape of the result. Everything else — file layout, module boundaries, how you sequence work, what you build first — is your call. `BUILD-PLAN` suggests an order; deviate if you find a better one and say why.

Four things I need from you:

1. **Commit and push as each gate clears**, gate id in the subject, and keep `docs/STATE.md` current. If this session ends, the next one resumes from that file plus git history alone.
2. **Show me each gate command's actual output.** I need the trail, not a summary of it.
3. **Stop and tell me when the spec is wrong.** The rule pack was built from published MBJB sources and three of twelve rules are explicitly unverified. Contradictions and dead ends go in `docs/OPEN-QUESTIONS.md`.
4. **Ask first** before anything destructive against a remote, promoting to production, or a bulk API loop.

Two places where the honest answer beats the green one:

- **M6** measures glyph heights off signboard artwork to ±0.05. If that tolerance is not reachable, do not widen it. Change the input contract instead and record what you learned — a real constraint on submission quality is more valuable to MBJB than a passing test.
- **The ¾ rule boundary** at exactly 0.75 is unconfirmed. Implement it inclusive, and leave it in `OPEN-QUESTIONS.md` rather than deciding it.

Begin.

---

## If fallback fires on the first request

The first request carries `CLAUDE.md` and git status, so a flag can happen before you send anything unusual. To find out whether this pack is the trigger:

```bash
claude --safe-mode      # disables CLAUDE.md, skills, MCP servers, hooks
```

If safe mode is clean, the likely culprit is the credential-pattern regex in `scripts/scan-secrets.sh`. It is isolated in that one file precisely so you can swap it for `gitleaks` or drop it without touching anything else. `verify.sh` calls it and nothing else depends on it.
