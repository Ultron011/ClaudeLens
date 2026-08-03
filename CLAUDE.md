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
