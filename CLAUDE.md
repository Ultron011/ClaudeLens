# CLAUDE.md — Agent Quick-Start

See `docs/README.md` first (agent entry point, invariants). For a rapid orientation without
reading all docs, see `docs/codebase-map.md`.

## Doc index

| Doc | When to reach for it |
|---|---|
| `docs/codebase-map.md` | First time in this codebase — file layout, data flow, key types |
| `docs/README.md` | Non-negotiable invariants; read before any PR |
| `docs/architecture.md` | End-to-end trace of a sync request |
| `docs/data-model.md` | DB schema, `SessionStats`, `ModelUsage`, parser version ledger |
| `docs/api.md` | All REST endpoints and their query logic |
| `docs/frontend.md` | Web structure, component contracts, chart system |
| `docs/gotchas.md` | Real bugs from prior sessions — CSS traps, identity scoping, bigint coercion |
| `docs/workflows.md` | Dev server, DB, build, test commands |
| `docs/claude-code-jsonl.md` | Raw JSONL shape consumed by the parser |

## Deploy (dashboard)

Live team dashboard at `https://claudelens-dashboard.drmalpani.com`. **Rebuild prod whenever the user can't see changes in the dashboard** — they view the live URL, not localhost, so `pnpm dev:web` is irrelevant to them.

```bash
docker compose -f docker-compose.prod.yml build app && \
docker compose -f docker-compose.prod.yml up -d app        # ~10s downtime
curl -s http://127.0.0.1:4000/api/health                   # then check the live URL
```

- Builds from the **working tree, not git** (`COPY . .`) — uncommitted edits ship.
- `claudelens-db-1` is prod data; `claudelens-pg` (:5544) is the dev DB. Don't confuse them.
- `pnpm dev:web` proxies `/api` to :4000 — that's the prod container, so dev shows live data.
- Plugin releases are a separate, longer flow — see `docs/workflows.md`.
