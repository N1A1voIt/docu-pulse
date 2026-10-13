# Capability Map: ChatGPT-Style Auth Flow (Personal ↔ Organization)

**Status:** Approved (spec-driven-development, Phase 0) — reviewed by human

Source idea: `docs/ideas/auth-flow.md`

| Module id | Responsibility | Depends on |
|---|---|---|
| `schema` | Schema-correction migration: fix inverted FK directions, `seats` as the sole membership table, rename `id_organnization`, drop `users.id_organization`, corrected DDL (`0001_init.sql`) + idempotent seeds (plans Free/Org $20, roles owner/admin/member), migration runner | — |
| `organizations` | Tenancy provisioning in app code: auto personal org at signup (`is_personal`, Free plan, sole seat), team-org creation, slug/seat rules — as services callable without auth | `schema` |
| `identity` | Better Auth mounted in Fastify: signup, login, logout, persistent sessions, Next.js consumption, session sharing across dev origins; calls `organizations` provisioning on user creation | `schema`, `organizations` |
| `billing` | Polar.sh: seat-based checkout from team-org creation (`external_customer_id = organization.id`), webhook endpoint (`validateEvent`, idempotent), subscription record, seat-count sync (`add now, remove at renewal`); personal orgs never touch Polar | `schema`, `organizations` |
| `entitlements` | Plan gating: team features require a non-personal org with an active Polar subscription | `organizations`, `billing` |

**Build order:** `schema` → `organizations` → `identity` ∥ `billing` → `entitlements`

- `identity` and `billing` are independent once `organizations` exists — they can be built in parallel.
- Interfaces live at the boundary: the signup → personal-org hook is contracted in `identity`'s spec (consumer: `organizations` provisioning service); the webhook → plan-status contract lives in `billing`'s spec.
- Each module gets its own spec inside `docs/`, named by module id: `docs/SPEC-schema.md`, `docs/SPEC-organizations.md`, `docs/SPEC-identity.md`, `docs/SPEC-billing.md`, `docs/SPEC-entitlements.md`. This map — not filename guessing — is the index.
- All generated documents live under `docs/` (specs here, plans in `docs/plans/`, ideas in `docs/ideas/`).
- Frontend slices ship inside their module (login/signup pages with `identity`, team-org creation + checkout with `billing`).

**Explicitly out of scope (iteration 2+):** invites/role UI, email verification & password reset, OAuth integrations connect flow, MFA/SSO/SCIM, Polar customer portal & assign/claim flow, proration/annual/discount UI — per `docs/ideas/auth-flow.md`.
