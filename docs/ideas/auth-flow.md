# ChatGPT-Style Auth Flow (Personal ↔ Organization Plans)

## Problem Statement
How might we deliver a ChatGPT-style auth experience — every user gets a free personal space the moment they sign up, and teams form later by creating a paid per-seat organization — on top of the existing organizations/seats/roles/plans schema, without over-building billing or RBAC before anyone has used it?

## Recommended Direction
**Better Auth inside the Fastify backend, on your own Postgres, preceded by a schema-correction pass; Polar.sh for org billing.** Your schema already encodes the ChatGPT model (`is_personal`, seats, `plans.price_per_seat`) — Better Auth's session + organization primitives map onto it instead of replacing it. One source of truth for identity and tenancy, no identity sync.

**The core motion:** signup → Better Auth creates the user → server auto-creates a personal organization (`is_personal = true`, Free plan, user as its sole seat) → user lands in their space. "Create a team org" is a second flow: new organization + owner seat → backend creates a Polar checkout (`seats` param = seat count) → hosted checkout → webhook flips the org to the active Org plan ($20/seat/month) and unlocks team features.

**Billing design (Polar.sh, locked):**
- Per-seat from day one — a single Polar *Subscription + Seat-based* product at $20/seat/month. No flat-price migration later; Polar's `seats` checkout param makes this nearly free.
- **Your DB is the source of truth for seats.** Polar's customer-seat assign/claim flow is deliberately unused — invite/seat management lives in your UI; seat-count changes call `polar.subscriptions.update({ id, seats })` to follow your DB. Polar's own seat emails and benefit-granting never enter the product.
- Seat-change policy: **adding seats takes effect immediately (Polar bills pro-rata); removal happens at renewal** after assigned seats are revoked.
- Mapping: `external_customer_id = organization.id` on every checkout, so all webhook events land on an org. Personal orgs never touch Polar.
- Polar is merchant of record (global VAT/GST/sales tax handled). Integration uses `@polar-sh/sdk` directly — the official `@polar-sh/fastify` adapter is deprecated; signature validation via the SDK's `validateEvent`.

**Prerequisite — schema correction:** the FK directions in `docs/sql-script/scenario-1-db.sql` are inverted (`users.id → organizations.id_user` should be `organizations.id_user → users.id`), `users.id_organization NOT NULL` contradicts multi-org membership — `seats` must be the only membership table — and `id_organnization` is misspelled. Building sessions on quicksand is the one mistake guaranteed to cost more later.

**Engine decision (resolved):** Better Auth, not Supabase Auth. One source of truth; the hand-designed tenancy schema stays authoritative. Supabase Auth remains the fallback only if the Fastify mount spike fails and we accept the dual-store trade-off.

**Payment decision (resolved):** Polar.sh, not Stripe (supersedes the earlier Stripe assumption). Per-seat pricing ($20/seat) built from day one, not deferred.

## Key Assumptions to Validate
- [ ] **Better Auth mounts cleanly under Fastify and shares sessions with Next.js across dev origins** — test: 2-hour spike doing one login round-trip (biggest technical unknown).
- [ ] **The corrected schema maps to Better Auth's organization model** without fighting it (org ↔ user ↔ role cardinality).
- [ ] **Polar seat-quantity updates work without Polar's assign/claim flow** — test in Polar sandbox: create seat-based checkout, then `subscriptions.update({ seats: n })` and confirm billing adjusts.
- [ ] **Polar checkout → webhook → org activation** works end-to-end in sandbox: verify `validateEvent` signature checking, `external_customer_id` → org lookup, and idempotent handling of event bursts (one cancellation can emit 20+ events).
- [ ] Users will self-serve into a paid team org with no sales touch (the ChatGPT bet itself).

## MVP Scope
- Schema-correction migration (FKs, membership via `seats` only, typo fix, seed `plans`: Free / Org with `price_per_seat = 20`)
- Signup, login, logout, persistent sessions — Better Auth in Fastify, Next.js consumes
- Auto personal-org-at-signup with sole seat
- Minimal org creation + Polar checkout (seat count chosen at creation) + webhook endpoint in Fastify (`validateEvent`, idempotent) flipping plan status
- Backend seat-count sync: your seats table changes → `subscriptions.update({ seats })`; policy = add now, remove at renewal
- Plan gating: team features require a non-personal org with an active Polar subscription

## Not Doing (and Why)
- **Invites & role-management UI** — an owner-only seat is enough for MVP; `seats`/`role` hold the data already. Seat *changes* exist as backend capability; the UI arrives with invites in iteration 2
- **Polar's customer-seat assign/claim flow and benefit granting** — would create a second invite system and a webhook firehose; your DB owns seats
- **Polar Customer Portal** — seat management stays in your product, not theirs
- **Stripe** — replaced by Polar.sh (merchant of record, native per-seat products)
- **OAuth workspace-integrations connect flow** (`integrations` table) — depends on stable auth; iteration 2
- **Email verification & password reset** — deferred until a transactional email provider is chosen; a real gap, consciously accepted
- **MFA / SSO / SCIM** — enterprise scope, no enterprise users yet
- **Seat proration UI, annual billing, discounts/coupons** — Polar handles proration internally; pricing complexity can wait
- **Supabase Auth / dual identity store** — rejected; would re-litigate the tenancy model

## Open Questions
- Which transactional email provider when verification lands?
- Does the org `slug` stay `VARCHAR(5)` or grow (5 chars will collide as orgs scale)?
- At what MRR does upgrading from Polar Starter (5% + $0.50) to Pro ($20/mo → 3.8% + $0.40) become worth it? (Rough break-even ≈ $500/mo processing.)
- Does a team org start with seats > 1 at checkout, or 1 seat and grow via later seat changes?
