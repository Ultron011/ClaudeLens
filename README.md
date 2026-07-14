# ClaudeLens

**A lens into how your team works with Claude Code.**

A self-hosted, auto-populated gallery of the team's Claude Code sessions.
Sessions sync automatically (tracking is on by default; projects and sessions
can be opted out), and everyone browses them to learn *how* people prompt, which
**skills** and **subagents** they use, and where the token spend actually turns
into value — instead of just seeing a cost number on a dashboard.

This is deliberately the half of the problem the existing ecosystem doesn't
cover. Cost/usage analytics is already solved by Anthropic's native Team/
Enterprise dashboard, `ccusage`, and OTel→Grafana; ClaudeLens is the **learning
& curation** layer on top, and pulls value/cost numbers straight from the
session files so it stands alone.

## How it works

```
 developer's machine                     your internal network
 ┌─────────────────────┐  auto-sync      ┌──────────────┐     ┌───────────┐
 │  claudelens (CLI)   │  (opt-out)      │   server     │ ──▶ │ Postgres  │
 │  Stop-hook + reads  │ ──────────────▶ │  Express API │     └───────────┘
 │  ~/.claude/…        │   (redacted)    │              │
 └─────────────────────┘                 └──────┬───────┘
                                                 │ REST
                                          ┌──────▼───────┐
                                          │  web (React) │  gallery + curation
                                          └──────────────┘
```

- **Tracking is on by default, with an explicit consent gate.** During setup the
  developer sees a review checklist of every project — all ticked — and unticks
  the ones they don't want captured. Nothing syncs until they pass that screen,
  and any project can be opted out later (per project, per session, whole-repo,
  or a global pause).
- The parser extracts turns, token usage, an **estimated cost**, and the
  **tools / skills / subagents** used from the raw JSONL.
- The dashboard shows a searchable gallery, per-contributor and per-skill
  leaderboards, and a full transcript viewer with collapsible thinking.
- Admins can **feature** exemplary sessions and tag them.

## Layout

```
claudelens/
├── shared/   parser, analyzer, pricing, secret redaction, shared types
├── server/   Express + Postgres ingest + query API
├── cli/      interactive opt-in publisher (reads ~/.claude/projects)
├── web/      React + Vite dashboard
└── docker-compose.yml   local Postgres
```

## Running locally

Prereqs: Node 20+, pnpm 10+, Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up          # Postgres on :5544
pnpm db:migrate     # create schema
pnpm dev            # server :4000 + web :5173

# in another terminal — publish one of your own sessions:
pnpm cli
```

Open http://localhost:5173.

## Deploying for your team

ClaudeLens is two halves: a **plugin** each engineer installs, and **one server**
everyone's plugin reports to.

### 1. Host the server (one command)

On any host your team can reach (a VPS with HTTPS, or an internal/VPN box):

```bash
cp .env.example .env
# set CLAUDELENS_TOKEN (openssl rand -hex 24) and a real POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

This builds one image that serves the **dashboard and the API on the same port**
(`CLAUDELENS_PORT`, default 4000) and brings up Postgres. The schema is created
automatically on boot. Visit `http://<host>:<port>` for the gallery.

`CLAUDELENS_TOKEN` is **required** in this compose file — only clients sending it
may publish, so an exposed server can't be spammed.

### 2. Publish the plugin

The repo *is* the plugin marketplace (`.claude-plugin/marketplace.json` → `./plugin`).
Push it to GitHub, then each teammate runs, inside Claude Code:

```
/plugin marketplace add <owner>/<repo>
/plugin install claudelens@claudelens
/claudelens:setup          # enter your name + the server URL + token
```

`/claudelens:setup` ends with a **review checklist** — tracking is on by default,
so it shows every project you've used Claude Code in (all ticked) and you untick
the ones you don't want captured. **Nothing syncs until you pass that screen.**
From then on tracked projects sync automatically after each turn. Opt out later
however you like:

- `claudelens untrack` — stop tracking the current project (this machine).
- `claudelens untrack --shared` — write a committed `.claudelens` that excludes
  the repo for the **whole team** (commit it).
- `claudelens sessions` — exclude individual sessions inside a tracked project.
- `claudelens pause` / `resume` — a global kill-switch for all syncing.
- `claudelens projects` — re-open the review checklist anytime.

> After changing `cli/` or `shared/`, run `pnpm plugin:build` and commit the
> updated `plugin/dist/*.mjs` — that bundle is what the installed plugin runs.

## Configuration

| Var                 | Where   | Purpose                                            |
| ------------------- | ------- | -------------------------------------------------- |
| `DATABASE_URL`      | server  | Postgres connection string                         |
| `PORT`              | server  | API port (default 4000)                            |
| `CLAUDELENS_SERVER` | cli     | Ingest target (default `http://localhost:4000`)    |
| `CLAUDELENS_TOKEN`  | both    | Shared bearer token to gate ingest (required in prod compose) |
| `CLAUDELENS_PORT`   | deploy  | Host port the prod container exposes (default 4000) |
| `POSTGRES_PASSWORD` | deploy  | Password for the bundled Postgres in prod compose  |

## Reused ideas / prior art

The JSONL parsing approach follows the well-documented Claude Code session
format also used by `ccusage`, `claude-code-log`, and `claude-code-trace`. Cost
estimation mirrors `ccusage`'s per-model, cache-aware method. ClaudeLens's
net-new contribution is the **central, auto-populated, curated team gallery** with the
skill/subagent learning lens.

## Status

v0.1 — working vertical slice (publish → store → browse → curate). See the
roadmap in the project notes: auth/SSO, redaction rule config, per-session
comments, "starter prompts" extraction, and an optional cost-analytics tab that
imports from Anthropic's Analytics API.
