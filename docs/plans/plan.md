# Implementation Plan: `schema` module — Corrected Base DDL & Seeds

> Spec: `docs/SPEC-schema.md` (approved) · Map: `docs/CAPABILITY-MAP.md`
> Task list: **`docs/plans/todo.md`** (project convention: all generated documents live under `docs/`, so the task list target deviates from the skill default `tasks/todo.md`)

## Overview

Build the schema module: a Docker Compose Postgres 16, two idempotent SQL migrations (corrected 7-table DDL + seeds) applied by a bare-psql runner, a Vitest integration suite proving FK directions / seeds / provisioning round-trip against the real database, and reduction of the legacy `docs/sql-script/scenario-1-db.sql` to a pointer. 10 tasks, 3 phases, 2 checkpoints.

## Architecture Decisions

- **Bare SQL in lexical order, no migration framework** — every statement idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), so `db:init` is safe to run repeatedly (spec decision).
- **Creation order avoids FK forward-references:** `plans → role → users → organizations → seats → possible_integration_docu → integrations` (no deferred constraints needed).
- **Runner defaults to `docker compose exec -T db psql`** — `psql` is not installed on this host (verified: only `/usr/bin/docker`), so the in-container path is primary; bare `psql "$DATABASE_URL"` is the documented fallback for hosts that have it.
- **`ON DELETE NO ACTION` everywhere** — revisited when the invitations module lands; spec-approved.
- **Tests fail loudly, never skip** — `tests/helpers/db.ts` throws if `DATABASE_URL_TEST` is unset (spec success criterion 4).
- **`subscriptions` DDL excluded** — deferred to `SPEC-billing.md`; the staged copy in `scenario-1-db.sql` is preserved in the git index and will be carried forward when `billing` is specified.
- **Seeds fixed in SQL:** plans = Free ($0), Org ($20/seat); roles = `owner`, `admin`, `member`.

## Dependency Graph

```
Task 1 (tooling) ────────┐
                          ├→ Task 3 (runner) → Task 4 (seeds) ─┬→ Checkpoint A
Task 2 (0001_init.sql) ──┘                                     │
                          Task 5 (test harness) ← from Task 1  │
                                                               ▼
                              Task 6, 7, 8, 9 (test files, parallel) → Checkpoint B
                              Task 10 (legacy pointer) ← Task 2 → Checkpoint C
```

Tasks 1 ∥ 2 are parallel. Tasks 6–9 are parallel after 4+5. Nothing in Phase 2 depends on 10.

## Task List

### Phase 1 — Foundation
- [ ] Task 1: Dev environment & tooling
- [ ] Task 2: `0001_init.sql` corrected DDL
- [ ] Task 3: `init-db.sh` migration runner
- [ ] Task 4: `0002_seed.sql` seeds

### Checkpoint A (after Tasks 1–4)
- [ ] `npm run db:init` twice, exits 0 both times
- [ ] `psql` shows 7 tables, 2 plans, 3 roles
- [ ] Review with human before proceeding

### Phase 2 — Verification suite
- [ ] Task 5: Test harness (`tests/helpers/db.ts`)
- [ ] Task 6: `structure.test.ts`
- [ ] Task 7: `constraints.test.ts`
- [ ] Task 8: `seeds.test.ts`
- [ ] Task 9: `provisioning.test.ts`

### Checkpoint B (after Tasks 5–9)
- [ ] `npm test` all green
- [ ] `npm run typecheck` green
- [ ] Unsetting `DATABASE_URL_TEST` makes the suite fail, not skip

### Phase 3 — Closeout
- [ ] Task 10: `scenario-1-db.sql` → pointer

### Checkpoint C (after Task 10)
- [ ] All spec success criteria verified (grep sweep, commands, diff)
- [ ] Ready for review / module `schema` complete

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `psql` missing on host | High | Runner uses `docker compose exec -T db psql` as primary path; fallback documented in script header |
| Docker daemon unavailable/not running | High | Task 1 verification fails fast (`docker compose up -d db` + health check) before any SQL work |
| FK creation order errors | Med | Fixed table order in `0001_init.sql`; `constraints.test.ts` proves directions from `pg_constraint` |
| TypeScript 7 + Vitest config surprises | Med | Minimal `tsconfig.json`; typecheck gate established in Task 1 before tests are written |
| Pointer replacement loses staged `subscriptions` DDL | Med | Staged blob survives in git index; content also noted here for `SPEC-billing.md`: `subscriptions(id, id_organization UNIQUE → organizations, polar_subscription_id UNIQUE, status, seat_count, cancel_at_period_end, current_period_end, created_at, updated_at)` |
| Tests silently skipping without a DB | Med | Helper throws by default; verified explicitly at Checkpoint B |

## Open Questions

- None blocking — spec Open Questions (`role_txt` keep, `integrations.status` boolean) resolved by their stated defaults at spec approval.
