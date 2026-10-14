# Task List: `auth-social-parity` — Social-First Sign-In (Parity Door)

> Plan: `docs/plans/plan-auth-social-parity.md` · Spec: `docs/SPEC-auth-social-parity.md`
> Run backend commands from `backend/`, frontend commands from `frontend/` unless noted.
> Each task ends with the relevant gate(s) green.

## Task 1: Backend env config (AUTH_PROVIDERS, provider creds, auth URLs, validation)

**Description:** Extend `src/config/env.ts` to centralize all auth/social configuration: enabled provider list, per-provider credentials, public backend auth URL, and trusted origins. Add fail-fast validation in production. Update `.env.example`/README only if those files exist (check first).

**Acceptance criteria:**
- [ ] `AUTH_PROVIDERS` parsed from env, default `"google,github,microsoft"` → normalized array of lowercase ids.
- [ ] Per-provider credential env vars read: `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`, `MICROSOFT_TENANT_ID` (default `"common"`).
- [ ] `BETTER_AUTH_URL` (default `http://localhost:${port}`) and `TRUSTED_ORIGINS` (comma list, default `[clientOrigin]`) added.
- [ ] In production (`NODE_ENV=production`), config load throws if any enabled provider is missing a required credential.
- [ ] In dev, provider with missing credentials is omitted (no crash) and `env.enabledProviders` reflects only configured providers.
- [ ] Exported `env` shape stays backward-compatible (`port`, `databaseUrl`, `clientOrigin` unchanged).

**Verification:**
- [ ] `npm run typecheck` (backend) exits 0.
- [ ] Unit/manual: unset `GOOGLE_CLIENT_ID` in dev → boot OK; in `NODE_ENV=production` with `AUTH_PROVIDERS=google` → boot throws (spot-check, then restore env).

**Dependencies:** None

**Files likely touched:**
- `backend/src/config/env.ts`
- (optional) `backend/.env.example`, `README.md` if present

**Estimated scope:** Small (1–2 files)

---

## Task 2: Better Auth social providers + production-safe URLs + hook normalization + account-linking policy

**Description:** Wire `socialProviders` into the existing `betterAuth` config from env; replace hardcoded `baseURL` with `env.betterAuthUrl` and `trustedOrigins` with `env.trustedOrigins`; disable account linking so collisions don't merge identities; normalize the provider name passed to personal-org provisioning.

**Acceptance criteria:**
- [ ] `baseURL: env.betterAuthUrl` (was `http://localhost:${env.port}`).
- [ ] `trustedOrigins: env.trustedOrigins` (was `[env.clientOrigin]`).
- [ ] `socialProviders` object built only from `env.enabledProviders` + available credentials, using `google`, `github`, `microsoft` (microsoft-entra-id) provider factories with `clientId/clientSecret` (and `tenantId` for microsoft).
- [ ] Account linking policy set so an existing password account is not merged with a social identity (collision yields error instead).
- [ ] `databaseHooks.user.create.after` passes a normalized name: `user.name?.trim() || null` (and `user.image ?? null` for avatar) into `createPersonalOrganization`; otherwise fallback remains "Personal space" via existing service.
- [ ] Backend dev boots with a subset of providers configured and with all three when creds present.

**Verification:**
- [ ] `npm run typecheck` (backend) exits 0.
- [ ] `npm run dev` (backend) boots and `/api/health` returns ok.
- [ ] `GET/POST /api/auth/sign-in/social` with an enabled provider returns a 302/redirect (initiation) rather than 500. If no creds, provider omitted and request to that provider returns a clear error.

**Dependencies:** Task 1

**Files likely touched:**
- `backend/src/auth/auth.ts`

**Estimated scope:** Medium (1 file, dense)

---

## Task 3: Verify email-collision surfaces as a stable, frontend-readable error

**Description:** Confirm and (if needed) normalize the backend's collision behavior so the frontend can show a single clear message. Inspect the OAuth callback/error shape and ensure no user/org row is created on collision and no 500 occurs. Adjust `server.ts` only if the error signal needs passing through (it passes full URL already, so likely no change).

**Acceptance criteria:**
- [ ] Determine the exact collision error code/query param Better Auth emits (e.g. `?error=email_already_exists` or JSON `error`) and document it in-code (comment) and in the frontend mapping.
- [ ] On a colliding social sign-in, no new row is added to Better Auth `user`/`account`/`session`? (or at least no domain `users`/`organizations`/`seats` row).
- [ ] No 500; response is a redirect (browser) or a 4xx with a readable error (API).
- [ ] `server.ts` unchanged unless required; if changed, CORS/cookie behavior preserved.

**Verification:**
- [ ] Manual with two real provider round-trips (or best-effort recorded flow) confirms: create password account `a@b.com`, then social sign-in with same email → clear message, no duplicate org.
- [ ] If full OAuth cannot be completed in the environment, document the blocker and keep this item open in the todo; do not mark complete on assumption.

**Dependencies:** Task 2

**Files likely touched:**
- `backend/src/server.ts` (only if needed)
- `docs/plans/todo-auth-social-parity.md` (record exact error code)

**Estimated scope:** Small (0–1 file)

---

## Task 4: Frontend enabled-providers helper + reusable provider button + divider

**Description:** Add a small helper to read the enabled provider list from `NEXT_PUBLIC_AUTH_PROVIDERS`, plus reusable UI components for a social-provider button and an "or" divider, consistent with the shadcn token system.

**Acceptance criteria:**
- [ ] `NEXT_PUBLIC_AUTH_PROVIDERS` parsed with the same default and normalization as the backend (`google,github,microsoft`).
- [ ] Helper exports ordered provider keys + display metadata (label, icon component/SVG) in consumer order.
- [ ] `SocialProviderButton` (full-width, left-aligned icon + "Continue with …", consistent height, own spinner slot, disabled prop).
- [ ] `AuthDivider` (horizontal rule with centered "or", subdued text).
- [ ] Components are accessible (button element, spinner has accessible label, icons `aria-hidden`).

**Verification:**
- [ ] `npm run build` (frontend) exits 0.
- [ ] `npm run lint` (frontend) exits 0.

**Dependencies:** None (frontend-only; can parallelize with Task 1–2 but page integration depends on Task 4)

**Files likely touched:**
- `frontend/lib/auth-providers.ts` (new)
- `frontend/components/auth/social-provider-button.tsx` (new)
- `frontend/components/auth/auth-divider.tsx` (new)
- (optional) `frontend/components/ui/button.tsx` style reuse only

**Estimated scope:** Small (2–3 new files)

---

## Task 5: Refactor `/sign-in` — provider row + divider + restyled form + polish

**Description:** Rebuild `sign-in/page.tsx` to the parity-door spec: three social buttons (enabled only) in order, divider, then equal-weight email/password form with password show/hide toggle, autocomplete, validation, loading/disabled states, error query handling (`?error=...`, `?next=...`), already-auth redirect, accessibility and responsiveness.

**Acceptance criteria:**
- [ ] Provider row renders only enabled providers in order Google → GitHub → Microsoft; each has its own spinner/disabled while redirect in flight; group disabled when form submitting.
- [ ] Divider with centered "or" between provider block and email form.
- [ ] Password input gains show/hide toggle (eye icon, `aria-pressed`, `aria-label`); autocomplete `current-password`; email `inputMode="email"`, autocomplete `email`.
- [ ] Inline validation after first interaction with `aria-invalid` + helper text (existing behavior preserved).
- [ ] Submit shows "Signing in…" spinner and disables double-submit.
- [ ] Server/network errors surface via `role="alert"`; network copy mentions backend reachability.
- [ ] OAuth cancellation/redirect-back error query maps to a neutral, non-alarming message.
- [ ] `?next=/path` supported and resumed after success; already-auth visitors redirected away.
- [ ] Tab order providers → divider → form; visible focus rings; `aria-live` for async status; touch targets ≥ 44px.
- [ ] Footer "Terms/Privacy" links (placeholder anchors acceptable) present.

**Verification:**
- [ ] `npm run build` + `npm run lint` (frontend) green.
- [ ] Manual: page renders, no console errors, tab order correct, password toggle works, ?next resumes.

**Dependencies:** Task 4 (and backend Task 2 for real OAuth); UI can be built against mock clicks

**Files likely touched:**
- `frontend/app/sign-in/page.tsx`

**Estimated scope:** Medium (1 file, substantial rewrite)

---

## Task 6: Refactor `/sign-up` — provider row + divider + restyled form + trust copy

**Description:** Same parity-door treatment for `sign-up/page.tsx`, plus a name field, trust copy ("We'll never post to your accounts without permission"), and `?next`/error handling. Show/hide password toggle and autocomplete `new-password`.

**Acceptance criteria:**
- [ ] Provider row/divider/form parity with Task 5.
- [ ] Name field preserved with validation (`minLength 2`); `autoComplete="name"`.
- [ ] Password toggle, inline validation, loading/disabled, error `role="alert"` as Task 5.
- [ ] `?next` support + already-auth redirect.
- [ ] Trust copy line + "Terms/Privacy" footer.
- [ ] Social profile use: no forced naming prompt; org name auto-filled silently (backend handles).

**Verification:**
- [ ] `npm run build` + `npm run lint` (frontend) green.
- [ ] Manual: signup form renders and validates; social button initiates redirect when backend configured.

**Dependencies:** Task 4

**Files likely touched:**
- `frontend/app/sign-up/page.tsx`

**Estimated scope:** Medium (1 file, substantial rewrite)

---

## Task 7: Show provider avatar in the top bar on `/`

**Description:** Display the signed-in user's avatar in the existing top bar on `frontend/app/page.tsx`, falling back gracefully (initials or generic mark) when absent. Keep the existing name display.

**Acceptance criteria:**
- [ ] If session user has an image, render avatar `<img>` (with alt) in the top bar; otherwise render a neutral fallback (no broken image).
- [ ] No layout shift; avatar ≤ 32px consistent with top bar.
- [ ] Build/lint green.

**Verification:**
- [ ] `npm run build` + `npm run lint` (frontend) green.
- [ ] Manual: user with avatar shows image; password (no avatar) shows fallback without console error.

**Dependencies:** Task 5/6 not strictly; independent, but ordered after UI parity

**Files likely touched:**
- `frontend/app/page.tsx`

**Estimated scope:** Extra-small (1 file, small change)

---

## Task 8: Backend tests — config fail-fast + auth smoke stays green

**Description:** Add a backend test locking in fail-fast validation for production env, and confirm the existing `auth.smoke.test.ts` still passes (personal-org auto-creation for password signup). Optionally add a collision-regression guard if a lightweight simulation is feasible without OAuth.

**Acceptance criteria:**
- [ ] A new test (e.g. `tests/env.config.test.ts` or within existing harness) asserts that when `NODE_ENV=production` and an enabled provider lacks credentials, config load throws.
- [ ] `npm test` (backend) exits 0 including `auth.smoke.test.ts`.
- [ ] `npm run typecheck` (backend) exits 0.
- [ ] If a collision simulation is not feasible without OAuth, document the gap (manual checklist covers it) — do not fake coverage.

**Verification:**
- [ ] `npm run db:up` (if needed) + `npm run db:init` + `npm test` (backend) green.
- [ ] `env -u DATABASE_URL_TEST npm test` → suite fails with refusal message (existing invariant holds).

**Dependencies:** Task 2

**Files likely touched:**
- `backend/tests/env.config.test.ts` (new) or extend `auth.smoke.test.ts`
- `backend/tests/auth.smoke.test.ts` (only if adjusting)

**Estimated scope:** Small (1–2 files)

---

## Task 9: Frontend build/lint final gate

**Description:** Run the final build and lint gates after all frontend changes; fix any remaining issues (types, imports, accessibility lint if configured). Update env documentation if a `.env.example` exists.

**Acceptance criteria:**
- [ ] `npm run build` (frontend) exits 0.
- [ ] `npm run lint` (frontend) exits 0.
- [ ] No new console warnings introduced during auth flows (manual check).

**Verification:**
- [ ] `npm run build && npm run lint` (frontend) green.

**Dependencies:** Tasks 5, 6, 7

**Files likely touched:**
- `frontend/*` as needed for fixes
- (optional) `frontend/.env.example`, `README.md`

**Estimated scope:** Small (fixups only)

---

## Task 10: Manual E2E checklist — providers, collision, OAuth cancellation, redirects

**Description:** Execute and record a manual end-to-end checklist covering every provider and edge case, since real OAuth cannot run in CI. Append results to `docs/ideas/auth-social-parity.md` (Verification section) or `docs/plans/todo-auth-social-parity.md` bottom.

**Acceptance criteria (checklist):**
- [ ] Google: click → consent → land on `/` → org card shows provider name within 2s; exactly one org + one seat for the new account.
- [ ] GitHub: same as above.
- [ ] Microsoft: same as above.
- [ ] Cancelled OAuth: returns to originating auth page with a neutral message; no crash; no duplicate org.
- [ ] Email collision: password account for `a@b.com`, then `Continue with X` for same email → single clear message + path to sign in with existing method; no duplicate org; no 500.
- [ ] Already-authenticated visitor to `/sign-in` or `/sign-up` → redirected away.
- [ ] `?next=/path` resumes after successful sign-in/sign-up (both email and social).
- [ ] Avatar displays in top bar when provider supplies image; fallback otherwise.
- [ ] Mobile width: provider buttons ≥ 44px touch targets; no horizontal scroll; dark/light consistent (shadcn tokens).
- [ ] `prefers-reduced-motion` respected (no forced transitions).

**Verification:**
- [ ] Checklist recorded with date + results; any failures filed as follow-up tasks (do not silently mark green).

**Dependencies:** Tasks 8, 9; requires dev backend + frontend + provider credentials (at least one fully configured for partial sign-off)

**Files likely touched:**
- `docs/ideas/auth-social-parity.md` (append verification results)
- `docs/plans/todo-auth-social-parity.md` (record results)

**Estimated scope:** N/A (verification task)

---

## Checkpoint A: Backend foundation (after Tasks 1–3)
- [ ] `npm run typecheck` (backend) green
- [ ] Backend boots in dev (all or subset of providers)
- [ ] OAuth initiation redirects for an enabled provider (no 500)
- [ ] Collision behavior documented (exact error signal)
- [ ] **Review with human before frontend work**

## Checkpoint B: Frontend parity door (after Task 7)
- [ ] `npm run build` + `npm run lint` (frontend) green
- [ ] Pages render with provider row/divider/form in correct order
- [ ] No console errors in dev
- [ ] **Review with human before verification**

## Checkpoint C: Complete (after Task 10)
- [ ] All spec success criteria met or explicitly waived
- [ ] Manual E2E checklist recorded (all providers or documented blocker)
- [ ] Ready for review

## Notes
- No migration/DB change; `backend/db/migrations` untouched by this module.
- No commit performed; working-tree changes owned by user.
---

## Security hardening notes (2026-10-14)

### Implemented
- `backend/src/server.ts`: auth request URL derived from `env.betterAuthUrl` instead of client-supplied `Host` header.
- `backend/src/server.ts`: baseline security headers on every response (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, conditional HSTS).
- `backend/.env.example`: centralized auth/social env documentation.

### Required follow-ups (before production)
- [ ] Add rate limiting to `/api/auth/*` (recommended `@fastify/rate-limit`; needs dependency approval) with a shared store for multi-instance.
- [ ] Make CORS origin a function/list over `env.trustedOrigins` if multiple origins are enabled.
- [ ] Verify Better Auth session cookies are `httpOnly`, `secure` (prod), and `SameSite=Lax` in an HTTPS round-trip.
- [ ] Triage dependency audit findings (`backend`: vitest/tinypool dev-only; `frontend`: shadcn/ts-morph/fast-glob tooling) by reachability; do not use `--force` without changelog review.

### Privacy follow-up (out of scope for this module)
- [ ] Define retention/deletion/export behavior for personal data (`users`, `organizations`, avatars) before external launch.
