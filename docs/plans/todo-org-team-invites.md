# Todo: org-team-invites

> Plan: `docs/plans/plan-org-team-invites.md` · Spec: `docs/SPEC-org-team-invites.md`

## Task 1: Centralize email configuration

**Description:** Make email env reads (Resend key, from address, app URL) go through the existing centralized config or at least be consistently sourced, so Resend sender failures and local no-op behavior are predictable.

**Acceptance criteria:**
- [x] `createEmailSender()` continues to choose Resend when `RESEND_API_KEY` is present and non-empty
- [x] No-op sender is selected when the key is missing
- [x] `APP_URL` / `EMAIL_FROM` use the established env access pattern
- [x] Frontend accept URLs are built from `env.appUrl`

**Verification:**
- [x] Tests pass: backend `npm test`
- [x] Typecheck passes: backend `npm run typecheck`

**Dependencies:** None

**Files likely touched:**
- `backend/src/config/env.ts`
- `backend/src/email/index.ts`
- `backend/src/email/resendSender.ts`

**Estimated scope:** S

---

## Task 2: Harden accept against concurrent calls

**Description:** Ensure concurrent/duplicate accept calls remain idempotent and never create more than one seat, including row-level status handling for expired/revoked/accepted invites.

**Acceptance criteria:**
- [x] Accept locks or safely handles the invitation row before insert/update
- [x] Duplicate accept calls do not create duplicate seats
- [x] Revoked/expired invites never create seats
- [x] `accepted_at` is set once

**Verification:**
- [x] Tests pass: backend `npm test`
- [x] Typecheck passes: backend `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:**
- `backend/src/invitations/invitations.service.ts`

**Estimated scope:** S

---

## Task 3: Verify DB init idempotency (migrations 0001-0004)

**Description:** Run `npm run db:init` twice against Postgres 16 and confirm it exits 0 each time, covering the invitations table, indexes, and FKs.

**Acceptance criteria:**
- [x] First `npm run db:init` exits 0
- [x] Second `npm run db:init` exits 0
- [x] `invitations` table and all three indexes exist
- [x] All four invitations FKs exist

**Verification:**
- [x] Manual check: `npm run db:init && npm run db:init`
- [x] Manual query: inspect `information_schema.tables/indexes`

**Dependencies:** None

**Files likely touched:**
- `backend/db/migrations/0004_invitations.sql`
- `backend/tests/structure.test.ts`
- `backend/tests/constraints.test.ts`

**Estimated scope:** XS

---

## Checkpoint: After Tasks 1-3
- [x] Backend typecheck passes
- [x] DB init runs twice cleanly
- [x] No token hash leaks from service functions

---

## Task 4: Write invitations.service.test.ts core lifecycle

**Description:** Add backend tests for create, list, revoke, and accept with valid email and role, including no-token/no-hash assertions in list output.

**Acceptance criteria:**
- [x] Create invite returns 201-style summary without token fields
- [x] List includes pending, accepted, and revoked states
- [x] Revoke changes `revoked_at`
- [x] Accept returns `{ organization }`

**Verification:**
- [x] Tests pass: `npm test -- tests/invitations.service.test.ts`

**Dependencies:** Task 3

**Files likely touched:**
- `backend/tests/invitations.service.test.ts`

**Estimated scope:** M

---

## Task 5: Write token security and guard tests

**Description:** Cover role gates, subscription guard, SHA-256 hash storage, constant-time compare, expired/revoked/accepted rejection, cross-email mismatch including sign-in path, and double-accept idempotency.

**Acceptance criteria:**
- [x] Owner/admin can invite; member and non-member are rejected
- [x] Personal/non-subscribed org invite returns 403 `SUBSCRIPTION_REQUIRED`
- [x] Stored `token_hash` is 64 hex chars
- [x] Expired, revoked, and accepted invites return 400 `INVITE_INVALID`
- [x] Cross-email accept returns 400 `EMAIL_MISMATCH` with sign-in path
- [x] Repeat accept leaves exactly one seat

**Verification:**
- [x] Tests pass: `npm test -- tests/invitations.service.test.ts`

**Dependencies:** Task 4

**Files likely touched:**
- `backend/tests/invitations.service.test.ts`

**Estimated scope:** M

---

## Task 6: Write invitations.smoke.test.ts

**Description:** Add an auth-style smoke test that creates a team org, invites a second domain user, accepts the invite, and verifies the org appears in the recipient's space list with one seat.

**Acceptance criteria:**
- [x] Team org is created by an owner
- [x] Invite is created for a second user
- [x] Accept creates exactly one seat for the recipient
- [x] Recipient's `listOrganizationsForUser` includes the team org
- [x] Total seats for org is two (owner + invitee)

**Verification:**
- [x] Tests pass: `npm test -- tests/invitations.smoke.test.ts`

**Dependencies:** Task 5

**Files likely touched:**
- `backend/tests/invitations.smoke.test.ts`

**Estimated scope:** M

---

## Task 7: Confirm structure and constraints expectations

**Description:** Keep `structure.test.ts` and `constraints.test.ts` aligned with 8 public tables and the four new invitations FKs.

**Acceptance criteria:**
- [x] Structure test expects exactly 8 public tables
- [x] Constraints test expects invitations FKs
- [x] No test relies on manual DDL

**Verification:**
- [x] Tests pass: `npm test -- tests/structure.test.ts tests/constraints.test.ts`

**Dependencies:** Task 3

**Files likely touched:**
- `backend/tests/structure.test.ts`
- `backend/tests/constraints.test.ts`

**Estimated scope:** XS

---

## Checkpoint: After Tasks 4-7
- [x] `npm run typecheck` passes
- [x] `npm test` passes
- [x] Invitation security cases covered

---

## Task 8: Run frontend build and lint gate

**Description:** Validate the frontend invitation routes and components compile and lint cleanly.

**Acceptance criteria:**
- [x] `npm run build` succeeds
- [x] `npm run lint` succeeds with 0 errors
- [x] `/orgs/[id]` and `/invites/accept` routes build

**Verification:**
- [x] Build: `npm run build`
- [x] Lint: `npm run lint`

**Dependencies:** None

**Files likely touched:**
- `frontend/app/orgs/[id]/page.tsx`
- `frontend/app/invites/accept/page.tsx`
- `frontend/components/*`

**Estimated scope:** S

---

## Task 9: Verify StrictMode-safe accept flow and error recovery

**Description:** Confirm duplicate effect invocations do not duplicate accepts, unauthenticated users redirect to sign-in and back, and invalid/expired/wrong-account states show recovery actions.

**Acceptance criteria:**
- [x] Unauthenticated accept redirects to `/sign-in?next=...`
- [x] Authenticated accept calls the API once in StrictMode
- [x] Success redirects to `/orgs/[id]`
- [x] Invalid token shows a recovery path

**Verification:**
- [ ] Manual check: browser smoke
- [ ] Build: `npm run build`

**Dependencies:** Task 8

**Files likely touched:**
- `frontend/app/invites/accept/page.tsx`

**Estimated scope:** S

---

## Task 10: Verify create-team-space and space switcher UX

**Description:** Verify the "Create team space" dialog creates an org through the API and that the switcher navigates by route without localStorage.

**Acceptance criteria:**
- [x] Create button opens a dialog
- [x] Submitting creates an org and navigates to `/orgs/[id]`
- [x] New org appears in the space list/switcher
- [x] Switcher uses `router.push('/orgs/${id}')` only

**Verification:**
- [ ] Manual check: browser smoke
- [ ] Lint: `npm run lint`

**Dependencies:** Task 8

**Files likely touched:**
- `frontend/app/page.tsx`
- `frontend/components/org-switcher.tsx`

**Estimated scope:** S

---

## Checkpoint: After Tasks 8-10
- [x] Frontend build and lint pass
- [ ] Manual smoke checklist passes
- [x] No localStorage or persisted current-org usage

---

## Task 11: Capture assumptions and open questions

**Description:** Record the billing-proxy, no-op sender, signup/provisioning, route-name, and token-in-URL decisions so later billing work can swap the guard without caller changes.

**Acceptance criteria:**
- [x] `Entitlements.canInvite` boundary remains documented
- [x] Open questions remain listed with chosen defaults
- [x] Plan notes are updated if decisions change

**Verification:**
- [ ] Manual review of `docs/plans/plan-org-team-invites.md`

**Dependencies:** None

**Files likely touched:**
- `docs/SPEC-org-team-invites.md`
- `docs/plans/plan-org-team-invites.md`

**Estimated scope:** XS

---

## Task 12: Final review against success criteria

**Description:** Walk all 16 success criteria and mark any implementation or verification gap before completion.

**Acceptance criteria:**
- [x] Backend criteria 1-10 verified (automated tests/gates; see plan Phase 4 Notes)
- [x] Frontend criteria 11-16 verified (build/lint green; manual browser smoke remains a follow-up)
- [x] Any gap is recorded as a follow-up task

**Verification:**
- [ ] Manual checklist
- [ ] `npm test` and `npm run build`

**Dependencies:** Tasks 7, 10, 11

**Files likely touched:**
- `docs/plans/plan-org-team-invites.md`
- `docs/plans/todo-org-team-invites.md`

**Estimated scope:** XS

---

## Checkpoint: Complete
- [x] Backend tests pass
- [x] Frontend build and lint pass
- [ ] Manual smoke checklist complete (requires browser; follow-up gaps recorded in plan Phase 4 Notes)
- [x] Ready for human review (automated gates green; manual smoke pending)