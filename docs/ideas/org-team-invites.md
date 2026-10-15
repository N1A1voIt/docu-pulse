# Org & Team Invites (Email-First Membership)

## Problem Statement
How might we let an organization owner invite people by email so they gain access to a team space that shows up in their own profile—on top of the existing personal/org tenancy—without turning this iteration into a full billing or email-platform project?

## Recommended Direction
Keep the personal-space-vs-team-org model from `docs/ideas/auth-flow.md`, and add an **invite-first membership layer** on top of the existing `organizations` / `seats` / `role` tables.

**Core motion:** owner creates a team org (Org plan row, features still gated on an active Polar subscription) → owner with an **active Org subscription** invites someone by email with a role → DocuPulse sends an email via **Resend** → the recipient opens the link (signing up if needed) → accepts → a seat is created → they are redirected to the invited org, which appears in their profile/spaces.

Key design choices:
1. **Invites, not direct seat creation.** Seats are created only at accept time. This avoids half-members, keeps seat counts truthful, and gives us a clean pending/accepted/revoked state machine.
2. **Transactional email via Resend behind a small adapter.** Define a `TransactionalEmailSender` interface and implement it with Resend (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, 7-day invite expiry). Only invite emails ship in v1; password reset/verification reuse the same adapter later.
3. **Cryptographic invite tokens.** Store a hashed token (random URL token sent in the email), with `expires_at` and `revoked_at`. Accept is idempotent and hard-rejects when the accepting account's email differs from the invite email.
4. **Role gating reused from existing seeds.** Invites carry `owner`/`admin`/`member` slugs against the existing `role` table. No new RBAC system.
5. **Tenant context stays route-based.** Active space is derived from the URL/space selector; no persisted "current org" column that could desync across devices.
6. **Create + switch ships with this.** Wire the currently-disabled "Create team space" button to `POST /api/organizations`, and let users move between personal and team spaces in the UI.
7. **Subscription-gated inviting.** Inviting requires an active Org subscription; roster setup may not bypass billing. Feature access follows existing entitlements keyed on subscription status.

## Key Assumptions to Validate
- [ ] **Resend can send from a dev domain and deliver accept links reliably** — test: send one invite from dev → receive → accept end-to-end.
- [ ] **The accept flow survives signup-then-accept** (recipient has no account yet) — test: invite `new@example.com`, open link while logged out, sign up, land on accept, seat created once.
- [ ] **Invite tokens are safe to store hashed and compare in constant time** — test: unit tests on create/accept/expired/revoked/cross-email rejection.
- [ ] **Seat creation is idempotent on double accept** (email clients prefetch) — test: two accepts of the same token yield one seat, no 500.
- [ ] **Role assignment at invite time is acceptable vs. owner choosing later** — test: pilot orgs exercise invite with each role.
- [ ] **Hard cross-email rejection matches user expectations** — test: walkthrough shows clear "wrong account" + sign-in path, no dead end.

## MVP Scope
**In:**
- Migration `0004_invitations.sql`: `invitations` table + indexes + FK to `organizations`/`users`.
- Backend invite service: create, list (by org), accept, revoke; Resend adapter; token hashing; role lookup; 7-day expiry.
- Endpoints: `POST /api/organizations` (create team org), `POST /api/organizations/:id/invites`, `GET /api/organizations/:id/invites`, `POST /api/invites/:token/accept`, `DELETE /api/organizations/:id/invites/:id`.
- Role guards: only `owner`/`admin` of the org may invite; members may only read.
- Subscription guard on invite creation.
- Frontend: enable "Create team space"; space switcher; invite dialog; accept-invite route with auto-redirect to invited org; member/pending-invite list.
- Tests: service + token/security cases + auth smoke for create→invite→accept.

**Out (explicitly not doing):**
- Polar subscription activation and seat-count sync (`billing` module).
- Password reset & email verification (deferred; reuse adapter later).
- Invite expiration renewal / auto-expire cron (revocation covers MVP).
- Member self-leave / org transfer / org deletion.
- Fine-grained permission matrix beyond the 3 seeded roles.
- Bulk CSV invite, org directory, SCIM.
- E2E harness (manual checklist remains).

## Not Doing (and Why)
- **Instant seat creation by admin** — creates ambiguous pending vs active seats and wrong counts before billing; invite-accept keeps accounting truthful.
- **Full email platform** — picking Resend + one template is the thin slice; reset/verification stays deferred to avoid scope creep now.
- **Email claim/assign flow inside Polar** — would duplicate invites; seats stay owned by our DB.
- **Promoting personal org to team** — keeps the invariant "every user always has a free personal space" and cleaner billing attribution.

## Resolved Decisions (this session)
1. Invite creation requires an active Org subscription (enterprise gating).
2. Accepted invite auto-redirects to the invited org.
3. Invite expiry = 7 days.
4. Transactional provider = Resend.
5. Cross-email acceptance = hard reject (clear message + path to correct account).