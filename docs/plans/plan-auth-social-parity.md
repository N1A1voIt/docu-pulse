# Implementation Plan: `auth-social-parity` — Social-First Sign-In (Parity Door)

> Spec: `docs/SPEC-auth-social-parity.md` · Idea: `docs/ideas/auth-social-parity.md`
> Task list: `docs/plans/todo-auth-social-parity.md`
> Note: canonical `docs/plans/plan.md`/`todo.md` remain the completed `schema` module; this module uses scoped filenames per the earlier project decision. `docs/plans/plan-frontend-auth-ux.md`/`todo-frontend-auth-ux.md` cover the prior (password-only) UI slice that this plan extends.

## Overview

Ship the provider-first parity door: Google, GitHub, and Microsoft as three equal social buttons (consumer order), side-by-side equal-weight email/password form, all on the existing Better Auth instance at `/api/auth/*`. No tenancy/billing/schema changes. The backend half (env + social provider config + production-safe auth URLs) lands first so OAuth can be exercised; the frontend half restyles sign-in/sign-up with provider row + divider + polish; then verification (backend tests + frontend build/lint + manual E2E per provider + collision test).

## Architecture Decisions

- **No new auth instance.** Social providers are added to the existing `betterAuth({ ... })` in `backend/src/auth/auth.ts`; mount (`/api/auth/*`) unchanged.
- **Env-gated providers.** `AUTH_PROVIDERS` (default all three) gates registration; `NEXT_PUBLIC_AUTH_PROVIDERS` mirrors it on the client so we never render a button for an unconfigured provider. Chosen over a backend endpoint to avoid a new route (spec open question #7 recommendation).
- **Fail-fast in prod.** Missing credentials for an enabled provider throw at config load (`src/config/env.ts`); in dev the provider is silently omitted.
- **Production-safe URLs.** `BETTER_AUTH_URL` (default `http://localhost:${port}`) and `TRUSTED_ORIGINS` (default client origin) replace hardcoded values; these are required for OAuth to work outside dev.
- **Account linking off.** Do not link a social identity onto an existing password account; collision must produce a clear error and no new user/org. Use Better Auth `account.accountLinking.enabled = false` (or default) and test.
- **Personal-org hook untouched.** Reuse `databaseHooks.user.create.after`; only normalize the name (trim; empty → undefined → `"Personal space"` fallback in `createPersonalOrganization`).
- **Provider name flows through `user.name`.** Better Auth maps standard claims; no custom profile mapping in v1 (open question #2; verify in E2E).
- **No new runtime deps.** Provider marks as inline SVGs or existing icon lib; reuse shadcn tokens.
- **Testing posture.** Real-OAuth round trips cannot run in CI without secrets; backend gains a fail-fast config test + keeps `auth.smoke.test.ts` (email/password path). Collision and full social E2E are manual checklist items documented in the todo. (spec open question #6)

## Dependency Graph

```
Task 1 (env config) ──► Task 2 (auth config: providers + URLs + hook) ──► Task 3 (collision surfacing verified) ──► Checkpoint A
                                                                              │
                                                                              ▼
Task 4 (provider button + divider components) ──► Task 5 (sign-in refactor) ──► Task 6 (sign-up refactor) ──► Task 7 (avatar in top bar) ──► Checkpoint B
                                                                              │
                                                                              ▼
Task 8 (backend tests/typecheck) ─► Task 9 (frontend build/lint) ─► Task 10 (manual E2E checklist) ─► Checkpoint C
```

Backend foundation (Tasks 1–3) must precede frontend OAuth exercise. Frontend components (Task 4) precede page refactors (5–6). Verification (8–10) last.

## Task List (index)

### Phase 1 — Backend foundation
- [ ] Task 1: Env config (AUTH_PROVIDERS, provider creds, BETTER_AUTH_URL, TRUSTED_ORIGINS, validation)
- [ ] Task 2: Better Auth social providers + production-safe URLs + hook normalization + account-linking policy
- [ ] Task 3: Verify collision surfaces as a stable, frontend-readable error (no new user/org, no 500)

### Checkpoint A (after Task 3)
- [ ] Backend typecheck green
- [ ] Backend dev boot succeeds in dev (all providers creds present or subset omitted without crash)
- [ ] OAuth initiation returns a redirect (smoke via `/api/auth/sign-in/social`) for an enabled provider
- [ ] Review with human before frontend work

### Phase 2 — Frontend parity door
- [ ] Task 4: Enabled-providers helper + reusable provider button + divider components
- [ ] Task 5: Refactor `/sign-in` (provider row + divider + restyled form + password toggle + ?next + error query handling)
- [ ] Task 6: Refactor `/sign-up` (provider row + divider + restyled form + password toggle + trust copy + ?next + error query handling)
- [ ] Task 7: Show provider avatar in the top bar on `/` (graceful fallback)

### Checkpoint B (after Task 7)
- [ ] `npm run build` + `npm run lint` green
- [ ] Manual interactive check: pages render, providers ordered correctly, disabled states work, no console errors
- [ ] Review with human before verification

### Phase 3 — Verification
- [ ] Task 8: Backend tests — config fail-fast test + (optional) collision regression lock + auth smoke still green
- [ ] Task 9: Frontend build/lint final gate + fix any issues
- [ ] Task 10: Manual E2E checklist (all providers + collision + cancelled OAuth + already-auth redirect + ?next)

### Checkpoint C (complete)
- [ ] All spec success criteria met or explicitly waived
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OAuth callback error shape not predictable | Med | Task 3/5 inspect real payloads before finalizing copy mapping |
| Google consent screen approval lag | High | Env gating lets prod omit unapproved provider; dev can subset |
| Name not populated for some provider | Med | Fallback to "Personal space"; verify in E2E (Task 10) |
| Double org on collision race | Med | Collision must not create user; verify no new `users`/`organizations` row in manual test |
| Frontend enabled-provider list drifts from backend | Low | Document in AGENTS/README? Single source recommendation recorded; revisit if drift seen |
| Collision E2E needs real OAuth | Med | Manual checklist; no CI secret; documented |
| Potential full-page spinner regression | Low | Keep client router.replace; no global spinner |

## Open Questions (recorded from spec; recommendations)

1. Env/config model → implemented as env-gated (above).
2. Profile normalization → `user.name` first; verify in E2E; revisit if a provider yields blank.
3. Skip personalization → auto-fill now, rename later (out of scope, unchanged).
4. CI OAuth testing → manual E2E + backend fail-fast test (above).
5. Client enabled-provider source → `NEXT_PUBLIC_AUTH_PROVIDERS` (above).

## Notes on external artifacts

- No migration/DB change. `backend/db/migrations` untouched.
- No new module id added to `docs/CAPABILITY-MAP.md`. This extends `identity` and `frontend-auth-ux`.
