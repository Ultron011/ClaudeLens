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

- **Install and it just works.** A teammate installs the plugin and runs
  `/claudelens:connect <server> <token> <name>` once; from then on every session in
  every project syncs automatically after each turn — no terminal, no per-project
  setup.
- **Opt-out is a switch, checked before anything is sent.** `/claudelens:untrack`
  (this session), `/claudelens:untrack-project` (this repo — or the whole team via
  a committed `.claudelens`), and `/claudelens:pause` (everything) all take effect
  *before* the next upload. Flip one at the start of a session and nothing from
  that scope ever leaves the machine. `DO_NOT_TRACK=1` is honored too.
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
├── cli/      the plugin's engine — Stop-hook sync + /claudelens:* ops (bundled to plugin/dist)
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
```

Open http://localhost:5173. To exercise the tracker's sync path without the
plugin, feed a Stop-hook payload to the bundle on stdin:

```bash
pnpm plugin:build
echo '{"transcript_path":"<a .jsonl>","cwd":"<dir>","session_id":"<id>"}' \
  | node plugin/dist/claudelens.mjs sync
```

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
/claudelens:connect <server-url> <token> <your display name>   # once — turns tracking on
```

`connect` stores the server + token + the **display name** your sessions appear
under, and **excludes its own session** so the token you type is never uploaded.
(Skip the name and it falls back to `git config user.name`, then the OS
username.) From then on every project/session syncs automatically after each
turn. There is **no terminal CLI** — everything is a slash command:

| Command | Effect |
| --- | --- |
| `/claudelens:untrack` | Stop tracking **this session** (run it first → nothing is ever sent) |
| `/claudelens:untrack-project` | Stop tracking **this project** (add `--team` → committed `.claudelens`, excludes the repo for everyone) |
| `/claudelens:track`, `/claudelens:track-project` | Undo the above |
| `/claudelens:pause` / `resume` | Global kill-switch |
| `/claudelens:status` | What's tracked right now |
| `/claudelens:update` | Pull the latest bundle |

Every switch is checked **before** any upload, so opting out at the start of a
session guarantees nothing for that scope reaches the dashboard. Author identity
comes from the name you pass to `connect` (or `CLAUDELENS_NAME`, then
`git config user.name`, then the OS username).

> After changing `cli/` or `shared/`, run `pnpm plugin:build` and commit the
> updated `plugin/dist/*.mjs` — that bundle is what the installed plugin runs.

## Configuration

| Var                 | Where   | Purpose                                            |
| ------------------- | ------- | -------------------------------------------------- |
| `DATABASE_URL`      | server  | Postgres connection string                         |
| `PORT`              | server  | API port (default 4000)                            |
| `CLAUDELENS_SERVER` | plugin  | Ingest target, if not set via `/claudelens:connect` |
| `CLAUDELENS_TOKEN`  | both    | Shared bearer token to gate ingest (required in prod compose) |
| `CLAUDELENS_NAME`   | plugin  | Override the auto-derived author name              |
| `DO_NOT_TRACK` / `CLAUDELENS_DISABLE` | plugin | Set to `1` to disable all syncing (honored globally) |
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
