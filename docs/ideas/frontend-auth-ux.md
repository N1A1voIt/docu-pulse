# Frontend for the Auth Flow

## Problem Statement
How might we deliver a production-grade auth UI that proves the auto-personal-space motion and is ready for team billing later, without over-building surfaces (settings, billing, team management) that the current backend can't yet truthfully support?

## Recommended Direction
**Finish the "personal space" auth UX, and show read-only org context only.** The recently built pages prove sign-up/sign-in, but the browser flow still lacks error resilience, loading states, protected-route handling, and verification that the auto-provisioned personal org is actually landing in the operator's hands. Those are the gaps worth closing now.

Everything beyond read-only org listing depends on billing (Polar) and team creation endpoints that do not exist yet — pretending otherwise would ship a "Create team" button that either no-ops or creates an org whose `Org` plan is never activated by a subscription, directly contradicting the ChatGPT monetization model.

So the pass is: harden `sign-in`/`sign-up`, add a session-gated app shell with org list and an honest "Create team — coming with billing" entry point, and defer settings/team-creation UI until `billing` is specified.

## Key Assumptions to Validate
- [ ] Better Auth's client session survives a full page reload and works across the dev origins (frontend 3000 -> backend 3001) - manual round-trip test.
- [ ] A user who signs up reaches a personal org in <1 render (orgs array non-empty on first paint) - measure in the smoke E2E.
- [ ] Users will accept "coming soon" for team creation without increased drop-off - validated informally during walkthroughs.

## MVP Scope
In:
- Hardened `/sign-in` + `/sign-up` (validation, a11y, loading, inline errors, success redirect)
- Session-gated `/` that renders the auto-provisioned personal space (loading/empty/error states)
- `components/` for form inputs/buttons using existing shadcn primitives
- Basic sign-out flow already present, verified
- E2E-ish smoke (manual checklist) against the running backend

## Not Doing (and Why)
- **Settings page** - there's no profile edit, password reset, or email-change flow yet (email verification deferred to iteration 2).
- **Team creation UI** - backend has the service but no route, and creating an `Org` plan row without a Polar subscription flips `billing` semantics prematurely.
- **Billing/upgrade UI** - `SPEC-billing.md` doesn't exist yet; building against the staged `subscriptions` stub guarantees rework.
- **OAuth/social login** - out of scope per idea.
- **Global navigation/sidebar beyond top bar** - UX chrome should follow, not precede, the first real feature (orgs).

## Open Questions
- When `billing` lands, does "Create team" stay hidden until Polar is wired, or ship earlier as an owner-only internal beta seeded by us?
- Do we store the `domainUserId` on the Better Auth user (to avoid the email lookup on `/api/organizations`) before or after profiling shows it's a bottleneck?

## Verification check (fastest falsifier)
If after this pass a fresh signup does **not** see "Personal space" within 2 seconds, the MVP auth hypothesis has failed and we should stop polishing UI until that's fixed.
