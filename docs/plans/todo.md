# Task List: `schema` module

> Plan: `docs/plans/plan.md` · Spec: `docs/SPEC-schema.md`
> Run all commands from `backend/` unless noted. Every task ends with `npm run typecheck && npm test` green (tasks before 5: typecheck only, test script still placeholder until Task 1 sets it up).

## Task 1: Dev environment & tooling ✅ (done 2026-10-14)

**Description:** Stand up the Postgres 16 dev database via Docker Compose and wire the backend package scripts, TypeScript config, and Vitest config so later tasks have working `db:init` / `typecheck` / `test` commands.

**Acceptance criteria:**
- [x] `backend/docker-compose.yml` defines a `db` service (Postgres 16, named volume, healthcheck) and `docker compose -f backend/docker-compose.yml up -d db` reports healthy
- [x] `backend/package.json` scripts: `db:init`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`); devDeps `vitest`, `pg`, `@types/pg` installed (lockfile updated)
- [x] `backend/tsconfig.json` + `backend/vitest.config.ts` exist; `npm run typecheck` exits 0

**Verification:**
- [x] `docker compose up -d db` → healthy (run from `backend/`)
- [x] `npm run typecheck` exits 0
- [x] `npm test` runs vitest (exit 0 with zero tests)

**Dependencies:** None

**Files likely touched:**
- `backend/docker-compose.yml`
- `backend/package.json` / `package-lock.json`
- `backend/tsconfig.json`
- `backend/vitest.config.ts`

**Estimated scope:** Medium (4–5 files)

---

## Task 2: `0001_init.sql` corrected DDL

**Description:** Write the corrected 7-table DDL as the first migration: fix inverted FK directions, make `seats` the only membership table (drop `users.id_organization`), fix `id_organnization`, `slug VARCHAR(16)`, quoted camelCase names, `TIMESTAMPTZ`, `ON DELETE NO ACTION`, created in FK-safe order.

**Acceptance criteria:**
- [x] `backend/db/migrations/0001_init.sql` creates exactly 7 tables: `plans`, `role`, `users`, `organizations`, `seats`, `possible_integration_docu`, `integrations` in that order
- [x] FKs inline and correct: `organizations.id_user→users.id`, `organizations.id_plan→plans.id`, `seats.id_user→users.id`, `seats.id_organization→organizations.id_organization`, `seats.id_role→role.id_role`, `integrations.id_pi→possible_integration_docu.id_pi`, `integrations.id_user_who_clicked_connect→users.id`, `integrations.id_organization→organizations.id_organization`
- [x] `organizations.slug VARCHAR(16) NOT NULL UNIQUE`; `users` has no `id_organization`; string `id_organnization` appears nowhere in the file
- [x] Every statement idempotent (`CREATE TABLE IF NOT EXISTS`); no `subscriptions` table (billing's)

**Verification:**
- [x] Manual: `docker compose exec -T db psql -U postgres -c '\d'` after a scratch apply shows the 7 tables (full `db:init` proof is Checkpoint A)
- [x] `grep -c "id_organnization" backend/db/migrations/0001_init.sql` → 0
- [x] `npm run typecheck` unaffected (SQL-only change)

**Dependencies:** None (parallel with Task 1; apply requires Task 3)

**Files likely touched:**
- `backend/db/migrations/0001_init.sql`

**Estimated scope:** Small (1 file, but dense — the spec's Code Style section is the reference)

---

## Task 3: `init-db.sh` migration runner

**Description:** Small shell runner that applies `db/migrations/*.sql` in lexical order, idempotently, using the in-container psql (host has no psql), wired to `npm run db:init`.

**Acceptance criteria:**
- [x] `backend/scripts/init-db.sh` starts with `set -euo pipefail`, iterates `db/migrations/*.sql` sorted, applies each via `docker compose exec -T db psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1` (bare `psql "$DATABASE_URL"` documented as fallback in header comment)
- [x] `npm run db:init` (from `backend/`) exits 0 on a fresh DB
- [x] Running it a second time also exits 0 (idempotency)

**Verification:**
- [x] `npm run db:init && npm run db:init` → both exit 0
- [x] Manual: psql `\dt` lists the 7 tables after run

**Dependencies:** Tasks 1, 2

**Files likely touched:**
- `backend/scripts/init-db.sh`
- `backend/package.json` (script wiring if not done in Task 1)

**Estimated scope:** Extra-small (1–2 files)

---

## Task 4: `0002_seed.sql` seeds

**Description:** Idempotent seed migration for plans and roles per spec.

**Acceptance criteria:**
- [x] `backend/db/migrations/0002_seed.sql` inserts plans `Free` (price 0) and `Org` (price 20) and roles `owner`, `admin`, `member`
- [x] Idempotent via `ON CONFLICT DO NOTHING` (or equivalent upsert) — re-running changes no row counts
- [x] Applied automatically by `db:init` (lexical order after `0001`)

**Verification:**
- [x] `npm run db:init` twice; psql `SELECT count(*)` → 2 plans, 3 roles both times
- [x] Checkpoint A (below) triggered after this task

**Dependencies:** Task 3

**Files likely touched:**
- `backend/db/migrations/0002_seed.sql`

**Estimated scope:** Extra-small (1 file)

---

## Checkpoint A: Foundation (after Tasks 1–4)

- [x] `npm run db:init` run twice, exits 0 both times
- [x] `psql` shows 7 tables, 2 plans, 3 roles
- [x] `npm run typecheck` exits 0
- [x] **Review with human before proceeding to Phase 2**

---

## Task 5: Test harness (`tests/helpers/db.ts`)

**Description:** Shared pg pool for integration tests that refuses to run without `DATABASE_URL_TEST`.

**Acceptance criteria:**
- [x] `backend/tests/helpers/db.ts` throws at import time if `DATABASE_URL_TEST` is unset (exact spec message: `DATABASE_URL_TEST is not set — refusing to skip schema tests`)
- [x] Exports a `pg` `Pool` plus a `resetSchema()` helper (drops/reapplies migrations or truncates) so each run starts clean
- [x] Pool closed in teardown so vitest exits without hanging

**Verification:**
- [x] `DATABASE_URL_TEST= npm test` → suite **fails** (not skips)
- [x] With URL set: `npm test` runs (may be red until Tasks 6–9)

**Dependencies:** Task 1

**Files likely touched:**
- `backend/tests/helpers/db.ts`

**Estimated scope:** Small (1 file)

---

## Task 6: `structure.test.ts`

**Description:** Assert acceptance criteria 3–5: tables exist, column corrections applied, no typo.

**Acceptance criteria:**
- [x] Asserts all 7 tables exist in `information_schema`
- [x] Asserts `users` has **no** `id_organization` column; `organizations` has `id_organization`; `organizations.slug` column type is `character varying(16)`
- [x] No string `id_organnization` in any table/column name

**Verification:**
- [x] `npm test` green for this file; deliberately breaking `0001_init.sql` makes it red (spot-check, then revert)

**Dependencies:** Tasks 4, 5

**Files likely touched:**
- `backend/tests/structure.test.ts`

**Estimated scope:** Extra-small (1 file)

---

## Task 7: `constraints.test.ts`

**Description:** Prove FK directions from `pg_constraint` (spec acceptance criterion 2) plus uniqueness constraints.

**Acceptance criteria:**
- [x] Reads `pg_constraint` and asserts each FK in Task 2's list: referencing table/column → referenced table/column (direction proven, not just existence)
- [x] Asserts `seats` unique constraint on `(id_user, id_organization)` — insert of duplicate seat pair fails
- [x] Asserts slug accepts 16 chars and rejects 17

**Verification:**
- [x] `npm test` green; flipping one FK direction in a scratch migration makes it red (spot-check, then revert)

**Dependencies:** Tasks 4, 5

**Files likely touched:**
- `backend/tests/constraints.test.ts`

**Estimated scope:** Small (1 file, densest assertions)

---

## Task 8: `seeds.test.ts`

**Description:** Verify seed data matches spec exactly.

**Acceptance criteria:**
- [x] Exactly 2 plans: `Free` price 0, `Org` price 20
- [x] Exactly 3 roles: `owner`, `admin`, `member`
- [x] Re-running `0002_seed.sql` (or `db:init`) leaves counts unchanged

**Verification:**
- [x] `npm test` green for this file

**Dependencies:** Tasks 4, 5

**Files likely touched:**
- `backend/tests/seeds.test.ts`

**Estimated scope:** Extra-small (1 file)

---

## Task 9: `provisioning.test.ts`

**Description:** End-to-end round-trip proving the schema supports the core motion: insert user → personal org → sole seat.

**Acceptance criteria:**
- [x] Inserts a user, then an org with `is_personal = true` referencing Free plan + that user, then a sole `seats` row with `owner` role — all FKs satisfied
- [x] Negative case: second `seats` row for same (user, org) is rejected by the unique constraint
- [x] Negative case: org referencing a non-existent `id_plan` fails
- [x] Test data cleaned up (transaction rollback or resetSchema) so runs are repeatable

**Verification:**
- [x] `npm test` green twice in a row (repeatable)

**Dependencies:** Tasks 4, 5

**Files likely touched:**
- `backend/tests/provisioning.test.ts`

**Estimated scope:** Small (1 file)

---

## Checkpoint B: Verification suite (after Tasks 5–9)

- [x] `npm test` all green
- [x] `npm run typecheck` green
- [x] `env -u DATABASE_URL_TEST npm test` → suite **fails** with the spec's refusal message
- [x] **Review with human before proceeding**

---

## Task 10: `scenario-1-db.sql` → pointer

**Description:** Replace the legacy scenario SQL with a comment pointer, preserving the staged `subscriptions` DDL content in the plan record for `SPEC-billing.md` (already captured in `docs/plans/plan.md` Risks).

**Acceptance criteria:**
- [x] `docs/sql-script/scenario-1-db.sql` body is only comments: superseded by `backend/db/migrations/0001_init.sql`, with a note that `subscriptions` moves to the billing module
- [x] No DDL statements remain in the file
- [x] `grep -r id_organnization backend/ docs/sql-script/` → no matches (generated artifacts only; source idea/spec/plan may quote the typo when describing it)
- [x] Working-tree change only — nothing committed (user owns commits)

**Verification:**
- [x] `grep -c "^CREATE\|^ALTER" docs/sql-script/scenario-1-db.sql` → 0
- [x] Spec success criteria sweep 1–6 re-run

**Dependencies:** Task 2

**Files likely touched:**
- `docs/sql-script/scenario-1-db.sql`

**Estimated scope:** Extra-small (1 file)

---

## Checkpoint C: Complete (after Task 10)

- [x] All spec success criteria 1–6 verified
- [x] `docs/SPEC-schema.md` updated if any decision drifted
- [x] Ready for human review — module `schema` done; next per map: specify `organizations`
