# Spec: `schema` — Corrected Base DDL & Seeds

> Module id: `schema` · Index: `docs/CAPABILITY-MAP.md` · Status: **approved** (Phase 2 planning complete → `docs/plans/plan.md`, `docs/plans/todo.md`)
> Source idea: `docs/ideas/auth-flow.md`

## Objective

Replace the broken `docs/sql-script/scenario-1-db.sql` with a corrected, idempotent, runnable schema foundation that every later module (`organizations`, `identity`, `billing`, `entitlements`) builds on.

**Why now:** the current DDL has inverted foreign keys (`users.id → organizations.id_user` runs backwards), `users.id_organization`-style membership contradicts multi-org membership (`seats` must be the only membership table), and `id_organnization` is misspelled somewhere in the chain. Building sessions on quicksand is the one mistake guaranteed to cost more later.

**Who succeeds:** every downstream module gets a schema it can trust — FK directions proven by `pg_constraint`, seeds present, migrations re-runnable.

**Acceptance criteria:**
1. A fresh Postgres reaches the full schema (7 tables) + seeds (2 plans, 3 roles) via one command, run twice with identical results (idempotent).
2. FK directions are correct: `organizations.id_user → users.id`, `seats.id_user → users.id`, `seats.id_organization → organizations.id_organization`, `seats.id_role → role.id_role`, `organizations.id_plan → plans.id`, `integrations` → `possible_integration_docu` / `users` / `organizations`.
3. `seats` is the only membership path: no `id_organization` column on `users`.
4. No occurrence of `id_organnization` anywhere.
5. `slug` is `VARCHAR(16)` on `organizations`.
6. Automated tests prove 1–5; suite fails loudly if the test DB URL is unset.

## Tech Stack

- **Postgres 16** via Docker Compose (`backend/docker-compose.yml`)
- **TypeScript 7** (`typescript@^7.0.2`, already installed) + **Vitest** for tests
- **`pg` + `@types/pg`** (dev deps) for integration tests
- **psql** for migration application (no framework — bare SQL in lexical order)

## Commands

```
# Start dev database
docker compose -f backend/docker-compose.yml up -d db

# Apply migrations + seeds (idempotent; safe to run repeatedly)
npm run db:init          # → backend/scripts/init-db.sh

# Type check
npm run typecheck        # → tsc --noEmit

# Tests (integration; require DATABASE_URL_TEST)
npm test                 # → vitest run
npm test -- --coverage   # → vitest run --coverage
```

## Project Structure

```
backend/
├── docker-compose.yml        → Postgres 16 dev/test database
├── scripts/
│   └── init-db.sh            → applies db/migrations/*.sql lexically via psql
├── db/
│   └── migrations/
│       ├── 0001_init.sql     → corrected DDL, 7 tables
│       └── 0002_seed.sql     → plans + roles (idempotent)
├── src/                      → (empty for now; later modules)
└── tests/
    ├── helpers/db.ts         → pg test client; throws if DATABASE_URL_TEST unset
    ├── structure.test.ts     → tables exist, column renames applied
    ├── constraints.test.ts   → FK directions from pg_constraint, seats uniqueness
    ├── seeds.test.ts         → plans and roles verified
    └── provisioning.test.ts  → user → personal org → sole seat round-trip
docs/
├── CAPABILITY-MAP.md         → module index (approved)
├── SPEC-schema.md            → this file
├── plans/                    → phase 2+ plans & task lists
├── ideas/                    → source idea documents
└── sql-script/
    └── scenario-1-db.sql     → becomes a pointer comment to db/migrations/0001_init.sql
```

## Code Style

Migration SQL — explicit, idempotent, no ORM:

```sql
-- db/migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS "users" (
    "id"         BIGSERIAL PRIMARY KEY,
    "uuid"       UUID NOT NULL UNIQUE,
    "name"       TEXT NOT NULL,
    "firstname"  TEXT,
    "email"      TEXT NOT NULL UNIQUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatar_url" TEXT
);

CREATE TABLE IF NOT EXISTS "organizations" (
    "id_organization"  BIGSERIAL PRIMARY KEY,
    "organization_name" TEXT NOT NULL,
    "slug"             VARCHAR(16) NOT NULL UNIQUE,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_personal"      BOOLEAN NOT NULL DEFAULT false,
    "id_user"          BIGINT NOT NULL REFERENCES "users"("id"),
    "id_plan"          BIGINT NOT NULL REFERENCES "plans"("id")
);
```

Test helper — fail loudly, never silently skip:

```ts
// tests/helpers/db.ts
const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is not set — refusing to skip schema tests");
export const pool = new Pool({ connectionString: url });
```

Conventions:
- Table/column names keep their existing quoted camelCase; only corrections applied (FK direction, `id_organnization` → `id_organization`, drop `users.id_organization`).
- Every statement idempotent: `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.
- Table creation order avoids FK forward-references: `plans → role → users → organizations → seats → possible_integration_docu → integrations`.
- `ON DELETE NO ACTION` everywhere for now (revisited with the `invitations` module).
- Seeds fixed: plans = Free ($0), Org ($20/seat); roles = `owner`, `admin`, `member`.

## Testing Strategy

- **Framework:** Vitest, integration tests against real Postgres (not mocks — schema correctness is a database property).
- **Location:** `backend/tests/`.
- **Levels:** structure (table/column presence) → constraints (FK directions read from `pg_constraint`, `seats_unique_0`, slug length accepts 16 / rejects 17) → seeds → provisioning round-trip (insert user → personal org → sole seat).
- **Coverage:** all assertions are on the six success criteria; no arbitrary % target — 100% of acceptance criteria must have a test.
- **Gate:** tests throw if `DATABASE_URL_TEST` is unset (no silent skip).

## Boundaries

- **Always:** run `npm run typecheck` and `npm test` before considering a task done; migrations must be idempotent (re-run to prove it); keep seeds in SQL, not code.
- **Ask first:** changing any column name/type beyond the three approved corrections; adding a table; adding a runtime dependency to `backend/`; touching the staged `docs/sql-script/scenario-1-db.sql` beyond the approved pointer replacement.
- **Never:** commit secrets or real connection strings; edit `node_modules`; delete the original scenario SQL without leaving the pointer; hand-edit `db/migrations/0001_init.sql` after downstream modules depend on it (append a new migration instead).

## Success Criteria

1. `docker compose -f backend/docker-compose.yml up -d db` yields a healthy Postgres.
2. `npm run db:init` twice in a row exits 0 both times; `psql` shows 7 tables, 2 plans, 3 roles.
3. `npm run typecheck` exits 0.
4. `npm test` all green; unsetting `DATABASE_URL_TEST` makes the suite **fail**, not skip.
5. `grep -r id_organnization backend/ docs/sql-script/` returns nothing (generated code/SQL only — `docs/ideas/`, this spec, and the plan may quote the typo when *describing* the correction; the pointer file must not contain it as a bare string).
6. `docs/sql-script/scenario-1-db.sql` contains only a comment pointing at `backend/db/migrations/0001_init.sql`.
7. Human reviews the diff at the two checkpoints (after DDL, after test suite).

## Decisions Made (this session)

- Migration tooling: bare SQL + psql runner (no framework).
- Local DB: Docker Compose Postgres 16 in `backend/`.
- `subscriptions` DDL: **deferred to the `billing` module** — schema module owns the 7 base tables only. (The staged `subscriptions` table in `scenario-1-db.sql` will be moved there when `SPEC-billing.md` is written.)
- `slug`: `VARCHAR(16)`.

## Open Questions

- Should `0001_init.sql` preserve the legacy `role_txt VARCHAR(255)` column on `seats` (denormalized role text alongside `id_role`), or is `id_role → role` sufficient? Default: **keep it for now, drop in a later migration** — not part of the three approved corrections.
- `integrations.status` comment says "false for revoked true for active" — keep as a `BOOLEAN`, or migrate to a `TEXT` status enum now? Default: **keep boolean** (out of module scope; `integrations` is iteration 2 anyway).
