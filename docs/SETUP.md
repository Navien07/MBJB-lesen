# Setup — run before the first Claude Code session

Everything here is on you, not Claude. Each numbered block should end green.

## 1 · Claude Code new enough for Fable 5

```bash
claude update
claude --version
```

Fable 5 needs **v2.1.170+**. Get **v2.1.219+** if you can — that version adds category-based fallback, so a cybersecurity flag drops you to Opus 4.8 rather than to your provider's default Opus.

Fable 5 is unavailable under zero data retention; the `/model` picker omits it or greys it out. On the Anthropic API the picker lists Fable only once the server reports it available for your org, but typing `/model fable` checks directly and can succeed before the row appears.

## 2 · Docker — the most likely blocker

Supabase local development needs it, and the M1 gate runs `supabase db reset --local`. Every later gate depends on M1.

```bash
docker info >/dev/null 2>&1 && echo "docker ok" || echo "BLOCKER: start Docker Desktop or OrbStack"
```

## 3 · Node

```bash
node -v
```

You are on 26.4.0, which is very new. No known incompatibility, but if a native dependency fails to install, drop to the current LTS (`nvm install 22 && nvm use 22`) rather than fighting prebuilt binaries.

## 4 · Anthropic API key — for the product, not for Claude Code

**This is the one people miss.** Your Claude Code subscription does not cover the API calls the application itself makes at runtime. The M5, M6, M7 and M10 gates all make real calls.

Create a key at `console.anthropic.com` with credits on it. It goes in `.env.local` (gitignored from the first commit) and later into Vercel via `vercel env add`. Do **not** `export` it into the shell you run Claude Code in — that puts it in scrollback and process listings for no benefit.

## 5 · Repository

Your GitHub repo exists but is unlinked.

```bash
cd ~/mbjb-lesen
git init && git branch -M main
git remote add origin https://github.com/Navien07/MBJB-lesen.git

# copy this pack in, then commit BEFORE the first session
# so Claude reads CLAUDE.md on start
git add -A && git commit -m "chore: build pack and spec" && git push -u origin main
```

## 6 · Supabase

You are logged in but have no project yet.

```bash
supabase init
supabase projects list                    # note your org id
supabase projects create mbjb-lesen --region ap-southeast-1
supabase link --project-ref <ref>
supabase start                            # local stack; needs Docker from step 2
```

Check `supabase projects create --help` for the exact flags on your CLI version — they move between releases. Keep the DB password somewhere durable; you will need it for `vercel env add`.

`ap-southeast-1` (Singapore) is the closest region to Johor Bahru.

## 7 · Vercel

Logged in already. Link the project:

```bash
vercel link
```

## 8 · Playwright

Only possible after Claude has scaffolded the app, so this is the one step that happens mid-session. Claude should run it at M2; if it forgets:

```bash
npx playwright install --with-deps chromium
```

---

## Runtime model choice — decide this before M5

Fable 5 is for *building*. It is the wrong choice for the product's own runtime calls: too expensive and too slow for per-document classification.

A sane starting split, configured in `lib/ai/gateway.ts`:

| Agent | Model | Why |
|---|---|---|
| Intake & Classification | Sonnet 5 | High volume, structured output, latency matters |
| Signboard Analysis | Opus 5 | Careful multimodal measurement; the accuracy-critical step |
| Compliance Assessment | *none* | Deterministic rule engine — no model at all |
| Officer Copilot | Sonnet 5 | Drafting from settled facts |

Put these in env vars, not literals, so the split can be tuned without a deploy.
