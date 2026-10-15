# Spec: `org-team-invites` — Email-First Membership for Team Spaces

> Source idea: `docs/ideas/org-team-invites.md`
> Extends: `organizations` (services/endpoints), `identity` (session + domain user lookup), `entitlements` (subscription guard hook), and the frontend auth-ux surface. Does not introduce a new module id in `docs/CAPABILITY-MAP.md`; invite state lives behind the existing `organizations`/`seats`/`role` tables.
> Status: **draft — pending human approval (Phase 1, spec-driven-development)**
> Does not change base DDL semantics; all schema additions arrive as a new `0004_invitations.sql` migration.

## Objective

Let an organization owner/admin invite someone by email with a role, and have that person land in the invited team space (which then shows up in their own profile's space list), on top of the existing personal-vs-team tenancy. Seats are created only when an invite is accepted, so roster and counts stay truthful and pending/accepted/revoked states are explicit. Email goes out through Resend behind a small `TransactionalEmailSender` adapter; invite tokens are random, URL-safe, and stored hashed.

**User:** org owner/admin (inviter) and an invited person who may or may not have an account yet.
**Success:** an owner of a billable team org can send an invite in under 30s, the recipient (creating an account if needed) can accept in one click, and afterwards the invited org appears in the recipient's spaces and they land inside it.

## Tech Stack

Backend:
- Fastify 5, TypeScript 7, `better-auth` 1.7.7, `pg`
- Postgres 16 (existing schema + new `invitations` table via `0004_invitations.sql`)
- Resend (`resend` SDK) behind a `TransactionalEmailSender` interface; activated by `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`
- Node `crypto` for tokens (no new crypto dependency)

Frontend:
- Next.js 16 (App Router), React 19, TypeScript 5
- Tailwind CSS 4, shadcn/Base UI
- `better-auth` client + `apiFetch` helper

## Commands

Backend (run from `backend/`):
```
Dev:        npm run dev            # tsx src/index.ts (port 3001)
Test:       npm test               # vitest run
Typecheck:  npm run typecheck      # tsc --noEmit
Build:      npm run build
DB init:    npm run db:init        # applies 0001..0004
```
Frontend (run from `frontend/`):
```
Dev:        npm run dev            # next dev (port 3000)
Build:      npm run build
Lint:       npm run lint
Typecheck:  tsc --noEmit (via build)
```
Combined dev: backend `npm run dev` + frontend `npm run dev`, `CLIENT_ORIGIN=http://localhost:3000`, `NEXT_PUBLIC_API_URL=http://localhost:3001`, `APP_URL=http://localhost:3000`.

## Project Structure

```
backend/
  db/migrations/
    0004_invitations.sql         -> invitations table + indexes + FKs
  src/
    organizations/              -> unchanged service + (existing) create team org
    invitations/
      invitations.service.ts     -> create/list/accept/revoke + seat creation
      invitations.routes.ts     -> Fastify handlers (or registered in server.ts)
      invitations.types.ts      -> domain types
      tokens.ts                 -> generate/hash/compare invite tokens
      roles.ts                  -> role slug lookup helpers (or in service)
    email/
      sender.ts                 -> TransactionalEmailSender interface
      resendSender.ts           -> Resend implementation
      noopSender.ts             -> dev/test sender (logs accept URL)
    entitlements/
      canInvite.ts              -> hook: isOrgSubscriptionActive(orgId)
  src/server.ts                 -> new routes wired here
  tests/
    invitations.service.test.ts -> create/accept/revoke + token cases + members
    invitations.smoke.test.ts    -> create team org -> invite -> accept
frontend/
  app/
    orgs/[id]/page.tsx         -> active space: org card, members, invites
    invites/accept/page.tsx     -> accept-invite route with auto-redirect
  components/
    org-switcher.tsx           -> space selector, route-based
    invite-dialog.tsx          -> email + role form
    invite-list.tsx            -> pending/accepted invites
    member-list.tsx            -> seats -> users + roles
  lib/
    api.ts                     -> unchanged
```

## Code Style

Backend:
- ESM (`"type": "module"`), Fastify plugin/host conventions; environment centralized in `src/config/env.ts`; fail-fast validation at config load.
- Services take primitive args (`orgId`, `userId`, `email`) and return typed objects; never leak token hash or plaintext token except in the email sender call (plaintext token is created in-memory, hashed before persistence, then discarded after sending).
- Async DB work uses `pg` directly in a `BEGIN/COMMIT/ROLLBACK` transaction; one logical operation = one transaction.
- Errors are typed single-class `InvitationError(code, message, status)` (or thrown `Error` with a `code`) so route handlers map to HTTP status without string matching.
- Role gating and subscription gating are separate pure helpers, tested independently.

Token code style (illustrative):
```ts
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function generateInviteToken(): { token: string; hash: string } {
  const raw = randomBytes(32);
  const token = raw.toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

Frontend:
- Client components use `"use client"`; pages co-locate with routes; Tailwind utilities (no inline styles); forms wrapped in `<label>` with `aria-invalid`; errors via `role="alert"`; inline validation after first interaction.
- Reuse existing shadcn components; no new runtime deps.
- Active space comes from the route (`/orgs/[id]`), never from a persisted "current org" field or localStorage.
- Space switcher is a `<select>` that navigates with `router.push(`/orgs/${id}`)`.

## Testing Strategy

Framework/levels:
- **Unit/service tests** (Vitest + real Postgres) in `backend/tests/invitations.service.test.ts`: create/list/revoke/accept, token hash security, role/subscription guards, expired/revoked/cross-email rejection, double-accept idempotency.
- **Auth smoke** (`backend/tests/invitations.smoke.test.ts`): create team org → invite → accept using two domain users → invited org appears in recipient's `listOrganizationsForUser` with an `owner/admin/member` seat; one seat total.
- **Frontend gate:** `npm run build` + `npm run lint` with 0 errors; manual smoke checklist for: create team space, invite dialog, accept flow while logged out, space switching.
- **Security token cases** are mandatory: store only `hash`; compare via constant-time helper; `/GET` profile of an invite lists no token.

Coverage expectations: every success criterion below has at least one automated backend test or a build-level frontend assertion. No E2E harness (manual checklist remains, per project convention).

### DB test cleanliness
- `resetSchema()` between test files; each describe uses a transaction rollback where possible. New `invitations` table must be covered by `resetSchema`'s drop/reapply logic (verify).
- `structure.test.ts` and `constraints.test.ts` must be updated to expect 8 public tables and the new `invitations` FKs/columns (spec approval updates these tests, not the implementation skipping them).

## Boundaries

**Always:**
- Run `npm run typecheck` and `npm test` (backend) / `npm run build` and `npm run lint` (frontend) before considering a task done.
- Validate all inputs (email format, role slug ∈ `{owner,admin,member}`, org existence, seat-based role) before touching the DB.
- Hash the token before persistence; compare in constant time; never return the token hash in any list response.
- Audit-log nothing extra; but ensure sender failures roll back the transaction / do not leave a half-invite. (If email send fails after DB insert, revoke the invite or delete it within the same request flow.)
- Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- Update `structure.test.ts`/`constraints.test.ts` expected table list to 8 in the same migration task.

**Ask first:**
- Adding the `resend` runtime dependency to `backend/package.json`.
- Changing or removing the existing `seats_unique_0` constraint usage, the `role` slugs, or `plans`.
- Creating or renaming frontend routes beyond the ones listed.
- Changing `APP_URL` semantics or adding new booking-related env vars.
- Adding a new `subscriptions` column/table before the `billing` module spec is written (see Open Questions).

**Never:**
- Commit secrets or real `RESEND_API_KEY` / DB URLs.
- Persist plaintext invite tokens; store only `token_hash`.
- Bypass subscription/role guards on invite creation ("members may invite" is not allowed).
- Silently skip tests or add `@ts-ignore`/`eslint-disable` to get green.
- Implement Polar billing activation, password reset, or org deletion in this spec (out of scope).
- Let accepting an invite across a different email succeed (hard reject only).

## Success Criteria

Backend
1. `backend/db/migrations/0004_invitations.sql` adds an `invitations` table with: `id_invitation` (PK), `id_organization` (FK), `id_inviter_user` (FK users), `invited_email` (text, NOT NULL), `id_role` (FK role), `token_hash` (text, NOT NULL, UNIQUE), `created_at` (timestamptz, default now), `expires_at` (timestamptz, NOT NULL), `revoked_at` (timestamptz, nullable), `accepted_at` (timestamptz, nullable), `accepted_user_id` (FK users, nullable). Indexes on `(id_organization)`, `(token_hash)`, `(invited_email)`.
2. `npm run db:init` runs migrations 0001–0004 idempotently (twice, exit 0).
3. Endpoints exist and enforce auth:
   - `POST /api/organizations` (create team org) → 201 with `Organization`.
   - `POST /api/organizations/:id/invites` `{ email, role }` → 201 with invite summary (no token).
   - `GET /api/organizations/:id/invites` → pending + accepted + revoked list (no token/hash).
   - `POST /api/invites/:token/accept` → 200 with `{ organization }`.
   - `DELETE /api/organizations/:id/invites/:id` → 204.
   - `GET /api/organizations/:id/members` → seats joined to users + roles.
4. Role guards pass/fail: owner/admin can create & revoke invites; any org member may `GET` invites/members; non-members get 403; unknown org gets 404.
5. Subscription guard: invite creation on a personal org or non-subscribed org returns 403 `SUBSCRIPTION_REQUIRED` (or `NOT_TEAM_ORG`); implementation is isolated behind `Entitlements.canInvite(orgId)` so a Polar check can replace the proxy without caller changes (see Open Questions).
6. Token security: stored value is SHA-256 hex (`token_hash`), length 64; `tokensEqual` uses `timingSafeEqual`; unit tests cover expired (`>7d`), revoked (`revoked_at IS NOT NULL`), accepted (`accepted_at IS NOT NULL`), cross-email (accepting user email ≠ `invited_email` → 400 `EMAIL_MISMATCH`) and double-accept (second call returns the existing seat, no 500, no duplicate seat).
7. Accept creates exactly one `seats` row with the invited role; idempotent on repeat: `SELECT count(*) = 1` for `(invited_user, org)`.
8. Accept on a revoked/expired invite returns 400 `INVITE_INVALID`; never creates a seat.
9. Cross-email mismatch returns 400 `EMAIL_MISMATCH` with a message naming the invited email and no seat; the response includes the correct sign-in path (`/sign-in?next=...`).
10. `npm test` all green including structure/constraints updates (8 tables expected) and the auth smoke.

Frontend
11. `npm run build` succeeds with 0 TypeScript errors and `npm run lint` passes.
12. "Create team space" button is enabled and opens a dialog; submitting creates an org and it appears in the spaces list/switcher.
13. `/orgs/[id]` renders members and (for owner/admin) the pending-invite list + "Invite member" dialog with email + role.
14. `/invites/accept?token=...` while unauthenticated redirects to sign-in then back; after authentication calls accept once (React StrictMode/refresh-safe) and redirects to `/orgs/[id]`. Email prefetch does not create extra seats (server idempotent).
15. Space switcher changes the active route (`/orgs/[id]`) and loads that org's members/invites; no localStorage or persisted current-org column is used.
16. Expired/revoked/wrong-account accept surfaces a clear error with a recovery path (re-request invite / sign in as the invited email).

## Assumptions (surface now)

ASSUMPTIONS I'M MAKING:
1. This iteration is the "iteration 2" explicitly deferred in the auth-flow capability map: billing is not yet built, so `Entitlements.canInvite` proxies activeness as "non-personal Org-plan org" until the `billing`/`entitlements` modules land; the guard is isolated for a later swap-in. → Correct me if invites should be strictly blocked until Polar ships.
2. Resend can send from a dev domain reliably; if `RESEND_API_KEY` is unset, a no-op sender logs the accept URL to the backend console so local dev/E2E walkthroughs still complete. → Correct me if missing keys should hard-fail even in dev.
3. Recipients without an account sign up first using the invited email; the personal org is still auto-created at signup (existing hook), and the invite lands afterwards. → Correct me if we should skip personal-org auto-creation for invited signups.
4. Next.js 16 App Router route segments and dynamic params are used as in the existing frontend (no new framework). → Correct me if route shape should differ.
5. `resetSchema()` in tests drops/recreates the public schema including all migrations up to the latest; invitations must be included automatically (no manual test-only DDL). → Correct me if migrations require a manual test-data clear.
6. Email prefetch may hit `POST /api/invites/:token/accept` zero times (prefetch is GET-only); creation is safe even on repeat POSTs because of server-side idempotency. → Correct me if clients prefetch POSTs and we need a CSRF/dedupe token.

## Open Questions

1. **Real subscription status vs. proxy:** should we add a minimal `subscription_status` field/table now (owned by this spec temporarily) or hard-depend on the not-yet-built `billing` module and block this spec until it ships? Default proposed: proxy via Org plan + isolated hook, revisit when `SPEC-billing.md` is written.
2. **Member list scope:** should members see other members (name/email) or only counts? Default proposed: full list to any org member (needed for the member/pending-invite UI).
3. **Create team org after billing:** once Polar ships, should `POST /api/organizations` also start a checkout, or remain a plain creation (current contract)? Default proposed: remain plain creation; checkout is a separate billing action (`OQ out of scope here, noted`).
4. **Invite token placement:** token in the URL path (`/api/invites/:token/accept`) will appear in server/access logs. Default proposed: accept this for v1 behind HTTPS; move to request body only if a security review asks. → confirm.
5. **Sender retry policy:** if Resend fails, should we persist the invite and return 201 with a "email not sent" flag, or roll back and return 502? Default proposed: roll back (no half-invite) and return 502 `EMAIL_SEND_FAILED`.
6. **Active-space route naming:** `/orgs/[id]` vs `/spaces/[id]` vs keeping everything on `/`. Default proposed: `/orgs/[id]` (matches data model vocabulary). → confirm.