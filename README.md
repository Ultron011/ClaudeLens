# ClaudeLens

**A lens into how your team works with Claude Code.**

An opt-in, self-hosted gallery of shared Claude Code sessions. Engineers publish
sessions they're proud of; everyone else browses them to learn *how* people
prompt, which **skills** and **subagents** they use, and where the token spend
actually turns into value — instead of just seeing a cost number on a dashboard.

This is deliberately the half of the problem the existing ecosystem doesn't
cover. Cost/usage analytics is already solved by Anthropic's native Team/
Enterprise dashboard, `ccusage`, and OTel→Grafana; ClaudeLens is the **learning
& curation** layer on top, and pulls value/cost numbers straight from the
session files so it stands alone.

## How it works

```
 developer's machine                     your internal network
 ┌─────────────────────┐   opt-in push   ┌──────────────┐     ┌───────────┐
 │  claudelens (CLI)   │ ──────────────▶ │   server     │ ──▶ │ Postgres  │
 │  reads ~/.claude/…  │   (redacted)    │  Express API │     └───────────┘
 └─────────────────────┘                 └──────┬───────┘
                                                 │ REST
                                          ┌──────▼───────┐
                                          │  web (React) │  gallery + curation
                                          └──────────────┘
```

- **Nothing is uploaded automatically.** A developer runs the CLI, picks one
  session, reviews a secret-redaction report, and confirms.
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

## Configuration

| Var                 | Where   | Purpose                                            |
| ------------------- | ------- | -------------------------------------------------- |
| `DATABASE_URL`      | server  | Postgres connection string                         |
| `PORT`              | server  | API port (default 4000)                            |
| `CLAUDELENS_SERVER` | cli     | Ingest target (default `http://localhost:4000`)    |
| `CLAUDELENS_TOKEN`  | both    | Optional shared bearer token to gate ingest        |

## Reused ideas / prior art

The JSONL parsing approach follows the well-documented Claude Code session
format also used by `ccusage`, `claude-code-log`, and `claude-code-trace`. Cost
estimation mirrors `ccusage`'s per-model, cache-aware method. ClaudeLens's
net-new contribution is the **central, opt-in, curated team gallery** with the
skill/subagent learning lens.

## Status

v0.1 — working vertical slice (publish → store → browse → curate). See the
roadmap in the project notes: auth/SSO, redaction rule config, per-session
comments, "starter prompts" extraction, and an optional cost-analytics tab that
imports from Anthropic's Analytics API.
