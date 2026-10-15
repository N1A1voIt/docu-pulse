# Implementation Plan: org-team-invites (Email-First Membership for Team Spaces)

> Spec: `docs/SPEC-org-team-invites.md` · Idea: `docs/ideas/org-team-invites.md`
> Task list: `docs/plans/todo-org-team-invites.md`
> Project convention: all generated documents live under `docs/` (deviates from skill default `tasks/`).

## Overview

Implement the `org-team-invites` capability on top of the existing personal-vs-team tenancy: an org owner/admin invites a person by email with a role; the recipient accepts (account first if needed); accepting creates exactly one `seats` row and brings the org into the recipient's space list. Invite state is explicit (`pending`/`accepted`/`revoked`), tokens are random base64url stored as SHA-256 hashes, and email is sent through a `TransactionalEmailSender` (Resend in prod, no-op in dev). Subscription eligibility is isolated in `Entitlements.canInvite` as a proxy until billing ships.

Most of the backend/frontend skeleton already exists in the working tree (migrations, services, routes, pages, components). This plan closes the remaining gaps: required automated tests, token/security hardening, DB/init verification, frontend build/lint gate, and manual smoke coverage.

## Architecture Decisions

- Keep `invitations` as a single new table added by `0004_invitations.sql`; no separate subscription/billing tables in this spec.
- Vertical slice: one complete invite path (`create invitation -> email -> accept -> seat created -> org visible to recipient`) is verified end-to-end before polish.
- Token plaintext is generated in-memory, hashed with SHA-256, and discarded after the email send call; only `token_hash` is persisted.
- Role and subscription gates remain separate pure/service helpers so they can be tested without Fastify.
- Active space continues to be derived from the route (`/orgs/[id]`); no persisted current-org field or localStorage.
- Missing `RESEND_API_KEY` selects the no-op sender so local development and tests can complete; prod requires the key through env.

## Task List

### Phase 1: Backend Hardening

- [x] Task 1: Centralize email configuration
- [x] Task 2: Harden accept against concurrent calls
- [x] Task 3: Verify DB init idempotency (migrations 0001-0004)

### Checkpoint: Backend Hardening
- [x] Backend typecheck passes
- [x] `npm run db:init` succeeds twice
- [x] No plaintext token or token hash leaks in service responses

### Phase 2: Backend Tests

- [x] Task 4: Write `invitations.service.test.ts` core lifecycle tests
- [x] Task 5: Write token security and guard tests
- [x] Task 6: Write `invitations.smoke.test.ts` (two users, one seat)
- [x] Task 7: Confirm `structure.test.ts` and `constraints.test.ts` expectations (8 tables)

### Checkpoint: Backend Tests
- [x] `npm test` all green
- [x] `npm run typecheck` passes
- [x] Auth smoke plus invite smoke pass sequentially

### Phase 3: Frontend Verification

- [x] Task 8: Run frontend build and lint gate
- [x] Task 9: Verify StrictMode-safe accept flow and error recovery
- [x] Task 10: Verify create-team-space and space switcher UX

### Checkpoint: Frontend
- [ ] `npm run build` succeeds with 0 TS errors
- [ ] `npm run lint` passes with 0 errors
- [ ] Manual smoke checklist passes

### Phase 4: Documentation and Review

- [ ] Task 11: Capture assumptions and open questions in plan notes
- [ ] Task 12: Final review against success criteria 1-16

### Checkpoint: Complete
- [ ] Success criteria 1-10 verified
- [ ] Success criteria 11-16 verified
- [ ] Plan marked complete or conflicts reported

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Token leaks through list responses | High | Add assertions in service tests that no `token`/`token_hash` appears in invite JSON |
| Concurrent accept creates duplicate seat | Medium | `ON CONFLICT ("id_user","id_organization") DO NOTHING`; add transaction test under load if needed |
| Email send failure leaves half-invite | High | Transaction rollback before throw; route returns 502 `EMAIL_SEND_FAILED` |
| Cross-email mismatch bypass | High | Server-side email comparison against `invited_email`; hard reject 400 `EMAIL_MISMATCH` |
| Missing tests make regressions invisible | Medium | Add required test files before final verification |
| Frontend StrictMode double-calls accept | Medium | Module-level dedupe plus server idempotency |
| Billing not yet built | Medium | Keep `Entitlements.canInvite` isolated and proxied |

## Open Questions

1. Real subscription status vs proxy: keep proxy via Org plan until billing spec.
2. Member list scope: full list to any org member.
3. Create team org after billing: remain plain creation.
4. Token in URL path accepted for v1 behind HTTPS.
5. Sender retry: roll back and return 502 on failure.
6. Route naming: `/orgs/[id]`.

## Parallelization Opportunities

- Service tests and token tests can be written in parallel.
- Frontend build verification can run while backend tests are authored.
- DB migration verification must finish before backend integration tests.

## Phase 4 Notes

### Verification evidence

- Backend: `npm run typecheck` passes; `npm test` passes (52 tests) with `DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/docupulse`. This includes 8 public tables, invitation FKs, service lifecycle/security, and auth + invite smoke tests (one seat on repeat accept).
- DB init: `npm run db:init` runs migrations `0001`–`0004` idempotently; second run exits 0 (verified via `init-db.sh`). The invitations table and its three indexes are covered.
- Frontend: `npm run build` succeeds with 0 TypeScript errors; `npm run lint` passes with 0 errors. Routes `/`, `/orgs/[id]`, `/invites/accept`, `/sign-in`, `/sign-up` all build.
- Token security: SHA-256 hex (`token_hash`) length 64 is asserted by tests; accept returns `{ organization }` and no `token`/`token_hash` leaks in list responses. `EMAIL_MISMATCH` responses include the sign-in path.

### Assumptions reaffirmed (Phase 4)

- `Entitlements.canInvite` remains a proxy: a non-personal org on the `Org` plan. It is isolated in `backend/src/entitlements/canInvite.ts` so the Polar check can replace it later without caller changes.
- Missing `RESEND_API_KEY` selects the no-op sender (logs accept URLs), so local dev/tests complete; prod requires the key through env.
- Recipients without an account sign up first using the invited email; the personal org is still auto-created at signup. The accept flow redirects unauthenticated recipients to `/sign-in?next=/invites/accept?token=...`.
- Active space is derived from the route (`/orgs/[id]`); no persisted current-org field or localStorage is used.
- Email prefetch is GET-only and cannot trigger accept; repeat accepts are idempotent server-side (`ON CONFLICT ("id_user","id_organization") DO NOTHING`) plus module-level client dedup.

### Open questions (chosen defaults, recorded for later billing work)

1. Real subscription status vs. proxy: keep proxy via Org plan + isolated hook until `SPEC-billing.md` is written.
2. Member list scope: full member list available to any org member.
3. Create team org after billing: remains plain creation; checkout is a separate billing action.
4. Token in URL path: accepted for v1 behind HTTPS; stored as SHA-256 hash only.
5. Sender retry: roll back the transaction and return 502 `EMAIL_SEND_FAILED`; no half-invite remains.
6. Active-space route naming: `/orgs/[id]`.

### Follow-up gaps (not automated by this agent; human verification needed)

- Manual browser smoke checklist: create team space dialog, invite dialog as owner/admin, accept while logged out then back, switch spaces via the route-based switcher, and recovery on expired/revoked/wrong-account invites.
- Run verification commands with `DATABASE_URL_TEST` set (or wire it into the local test environment) before merging; the suite refuses to run schema tests without it.