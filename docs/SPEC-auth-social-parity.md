# Spec: `auth-social-parity` — Social-First Sign-In (Parity Door)

> Source idea: `docs/ideas/auth-social-parity.md`
> Extends: `identity` (Fastify + Better Auth providers) and `frontend-auth-ux` (sign-in/sign-up UI)
> Status: **draft — pending human approval (Phase 1, spec-driven-development)**
> Does not create a new module id in `docs/CAPABILITY-MAP.md`; this is an extension of the existing `identity` + `frontend-auth-ux` surfaces.

## Objective

Make DocuPulse sign-in feel as frictionless, trusted, and familiar as Claude/OpenAI's for an individual developer, while staying on Better Auth and preserving the auto-personal-space-on-signup motion. The "parity door": Google, GitHub, and Microsoft as three equal social buttons (consumer order Google → GitHub → Microsoft), with a side-by-side email/password form of equal visual weight, all feeding the existing Better Auth instance at `/api/auth/*`. No tenancy, billing, or schema changes; the personal-space auto-provisioning hook stays untouched, and the provider's display name flows into the auto-created organization so the user sees "their" space immediately.

**User:** anonymous visitor becoming an individual developer account.
**Success:** a new visitor can reach a signed-in personal space using a single social button in under ~10s, with no dead ends on email collision, and the auto-created org displays the provider's name.

## Tech Stack

Backend:
- Fastify 5, TypeScript 7, `better-auth` 1.7.7, `pg`
- Postgres 16 (untouched schema; `users`/`organizations`/`seats` already migrated)
Frontend:
- Next.js 16 (App Router), React 19, TypeScript 5
- Tailwind CSS 4, shadcn/Base UI
- `better-auth` client (`createAuthClient`) → Fastify backend
- No new runtime dependencies (provider icons via existing `@hugeicons` or inline SVG marks)

## Commands

Backend (run from `backend/`):
```
Dev:        npm run dev            # tsx src/index.ts (port 3001)
Test:       npm test               # vitest run
Typecheck:  npm run typecheck      # tsc --noEmit
Build:      npm run build
DB init:    npm run db:init
```
Frontend (run from `frontend/`):
```
Dev:        npm run dev            # next dev (port 3000)
Build:      npm run build          # tsc + route gen
Lint:       npm run lint
Typecheck:  tsc --noEmit (via build)
```
Combined dev: backend `npm run dev` + frontend `npm run dev`, `CLIENT_ORIGIN=http://localhost:3000`, `NEXT_PUBLIC_API_URL=http://localhost:3001`.

## Project Structure

```
backend/
  src/
    auth/auth.ts              -> Better Auth config (add socialProviders)
    config/env.ts             -> add provider env + auth URL/origins + enabled list
    server.ts                 -> /api/auth/* mount (unchanged shape), optional /api/auth/providers
  tests/
    auth.smoke.test.ts        -> extend: social signup → personal org (at least provider-mocked or one provider)
frontend/
  app/
    sign-in/page.tsx          -> provider row + divider + email form (refactor)
    sign-up/page.tsx          -> provider row + divider + email form (refactor)
  components/                 -> reuse shadcn Button/Card/Input/Alert; new provider button + divider
  lib/
    auth-client.ts            -> unchanged (baseURL); may add enabled-providers helper
```

## Code Style

- Backend: ESM (`"type": "module"`), Fastify plugin/host conventions; environment centralized in `src/config/env.ts`; fail-fast validation at config load.
- Frontend: client components use `"use client"`; co-locate pages with routes; Tailwind utilities (no inline styles); forms wrapped in `<label>` with `aria-invalid`; errors via `role="alert"`; inline validation after first interaction.
- Reuse shadcn tokens; no hard-coded brand colors beyond provider marks.
- Provider buttons: full-width, vertically stacked, consumer order; left-aligned provider icon + "Continue with …"; consistent height/typography.

## Assumptions (surface now)

ASSUMPTIONS I'M MAKING:
1. OAuth provider credentials (Google, GitHub, Microsoft) can be created for dev and prod environments before merge; Google consent-screen approval may lag — ship code behind env-gated providers so prod can omit an unapproved provider.
2. Better Auth 1.7.7 `socialProviders` (google, github, microsoft/microsoft-entra-id) is sufficient; no custom OAuth lib needed.
3. Microsoft identity uses the "common" tenant by default (`MICROSOFT_TENANT_ID` optional, default `"common"`).
4. Provider profile `name`/`image` map to Better Auth `user.name`/`user.image` for all three providers (with fallback to empty name → "Personal space").
5. Email collision: when a social sign-in resolves to an email already tied to an email/password account, Better Auth rejects with an error we can surface; no new domain user/org is created on that path.
6. `?next=/path` is already/will be supported; authenticated visitors already redirected away from auth pages (existing behavior kept).
7. Dev callback URLs are `http://localhost:3001/api/auth/callback/{provider}`; production callback URLs are derived from `BETTER_AUTH_URL`.

→ Correct me now or I'll proceed with these.

## Testing Strategy

Backend (vitest, integration against real Postgres):
- `auth.smoke.test.ts` extended: at least one provider end-to-end OR a mocked OAuth round-trip asserting one org + one seat per new social user. Given CI has no real secrets, prefer recorded/mock approach + a documented manual E2E checklist in the spec's success criteria.
- Collision test: password account for `a@b.com`, then social sign-in with same email → clear message, no duplicate org, no 500.
- Fail-fast test: in production mode with an enabled provider missing credentials, config load throws.

Frontend:
- `npm run build` (0 TS errors) + `npm run lint` are the automated gate.
- Manual smoke checklist: provider click → OAuth → land on `/` → org card with provider name within 2s; cancelled OAuth returns neutral message; already-auth redirect.
- Accessibility: tab order providers → divider → form; visible focus; screen-reader labels.

## Boundaries

- **Always:** keep `/api/auth/*` and `/api/auth/callback/*` on backend; keep cookies `credentials: "include"`; never store tokens in localStorage; run build+lint+tests before merge; publish only `NEXT_PUBLIC_*` to client; validate env on boot in prod.
- **Ask first:** adding shadcn components beyond needed; new runtime dependencies; changing routes; adding an enabled-providers endpoint vs public env; changing `baseURL` / redirect URL handling.
- **Never:** commit secrets/`.env` with real credentials; edit migration SQL beyond this spec's scope; remove the personal-org hook; create a second auth instance; store session tokens in localStorage; ship a provider button for an unconfigured provider without a clear error.

## Environment & Config (new/changed)

Backend (`src/config/env.ts`):
- `AUTH_PROVIDERS` — comma list of enabled providers, default `"google,github,microsoft"`. Allows subset in dev.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (default `"common"`)
- `BETTER_AUTH_URL` — absolute public URL of the backend, default `http://localhost:${port}`. Replaces hardcoded `baseURL`.
- `TRUSTED_ORIGINS` — comma list defaulting to `clientOrigin`. Replaces single origin; lock prod to configured client origin(s).

Validation rules:
- If `NODE_ENV === "production"` and a provider in `AUTH_PROVIDERS` has any missing credential → throw at config load (fail-fast).
- In dev, a provider with missing credentials is silently omitted from the registered set (no crash), but clicking its button on the client is prevented if the client knows it's disabled (see client contract below).

Frontend env:
- `NEXT_PUBLIC_AUTH_PROVIDERS` should mirror `AUTH_PROVIDERS` (same comma list) so disabled providers aren't rendered. (Alternative: small `GET /api/auth/providers` endpoint — decide in plan.)

Base URL / trusted origins (production-safety):
- `baseURL = env.betterAuthUrl` (was `http://localhost:${env.port}`).
- `trustedOrigins = env.trustedOrigins` (was `[env.clientOrigin]`); default includes client origin only.

## Functional Requirements — Backend

1. **Social providers in Better Auth config.** Add `socialProviders` to `betterAuth({ ... })` using env credentials:
   - `google`: `{ clientId, clientSecret }`
   - `github`: `{ clientId, clientSecret }`
   - `microsoft`: `{ clientId, clientSecret, tenantId }` (provider key in better-auth is `microsoft` / Microsoft Entra ID)
   Only register providers present in `AUTH_PROVIDERS` and (in prod) validated.
2. **Production-safe auth URLs.** Replace hardcoded `baseURL` and lock `trustedOrigins` per env as above. This ships in the same PR; it is the silent OAuth breakage risk.
3. **Profile → org auto-fill (already partially in place).** Ensure `databaseHooks.user.create.after` passes the provider-derived `user.name` into `createPersonalOrganization(..., user.name ?? null)` so the personal space displays the provider's name. Keep fallback `"Personal space"` when absent. Ensure hook fires exactly once per new social user (social sign-in that creates a user triggers `create`; returning social sign-ins do not). Do not create a duplicate domain `users` row on collision.
4. **Email-collision policy (backend).** Better Auth must reject social sign-in when the resolved email already exists on a different (password) account, without creating a new user/org. Surface a stable, machine-readable error signal (query param or JSON `error` code such as `email_already_exists` / `account_exists`) so the frontend can show a single clear message. No dead end, no 500, no duplicate personal org. (Connected-accounts/account-linking is out of scope; do not link.)

## Functional Requirements — Frontend (`/sign-in`, `/sign-up`)

1. **Provider row.** Three social buttons (only enabled providers), vertically stacked, consumer order Google → GitHub → Microsoft; left-aligned provider icon + "Continue with …"; full-width; consistent height/typography.
2. **Divider.** Horizontal rule with centered "or" between provider block and email form; subdued text.
3. **Email/password form of equal weight** (restyled): floating/label-above inputs; labels wired to inputs via `htmlFor`/`id`; password show/hide toggle (eye icon, `aria-pressed`, `aria-label`); autocomplete (`email`, `current-password`/`new-password`); `inputMode="email"` retained.
4. **Loading & disabled states.** Per-button spinner + disabled while any OAuth redirect is in flight; group-level disable when the form is submitting; prevent double-submit; full-page navigation spinner not used.
5. **Inline validation** after first interaction per field (existing behavior), with `aria-invalid` + helper text. No password strength meter.
6. **Errors.** `role="alert"` under the form; human copy; network errors mention backend reachability (existing). Provider-cancelled OAuth returns to the same page with a neutral, non-alarming message.
7. **Redirects.** Support `?next=/path` and resume after success; already-authenticated visitors redirected away (existing).
8. **Accessibility.** Tab order providers → divider → form; visible focus rings; screen-reader labels for icon-only controls; `aria-live` for async status; errors announced.
9. **Responsiveness.** Mobile-first full-width card with safe-area padding; touch targets ≥ 44px; provider icons ≥ 16px.
10. **Theming.** shadcn tokens; no hard-coded brand colors beyond provider marks.
11. **Motion.** 150–200ms hover/focus transitions; respect `prefers-reduced-motion`.
12. **Trust copy.** Small footer links ("Terms", "Privacy") + one-line reassurance on `/sign-up` ("We'll never post to your accounts without permission"). Brand mark + title + one calm subtitle; same shell both pages.
13. **Social profile use.** Avatar displayed in top bar post-login (if present); org name auto-filled from provider profile (no prompt); fallback "Personal space" when no name.

Social click handler: call `authClient.signIn.social({ provider, callbackURL })` (provider list validated against enabled set) and let backend redirect. Handle OAuth error query params on return (`?error=...`) by mapping to friendly copy.

## Success Criteria (testable)

1. `npm run typecheck` (backend) and `npm run build` + `npm run lint` (frontend) all green.
2. Backend test suite green; new collision case added and passing (or documented manual verification if OAuth can't run in CI).
3. In production mode, missing credentials for an enabled provider causes config load to throw.
4. Manual E2E per provider: click social button → OAuth consent → land on `/` → org card shows provider name within 2s; exactly one org + one seat for the new account.
5. Cancelled OAuth returns to the originating auth page with a neutral message; no crash, no duplicate org.
6. Email collision: password account for `a@b.com`, then `Continue with X` for same email → single clear message + path to sign in with existing method; no duplicate org; no 500.
7. Revoked/invalid `BETTER_AUTH_URL`/`TRUSTED_ORIGINS` no longer lets OAuth silently succeed against localhost in prod.
8. Already-authenticated visitors are redirected away from `/sign-in` and `/sign-up`.

## Out of Scope

Passkeys, magic link/email OTP, SAML/OIDC SSO, SCIM, MFA, connected-accounts management, account deletion, account linking of multiple providers, password reset/email verification (deferred), OAuth token reuse for Phase 1 GitHub webhook integration, animated illustrations, multi-step onboarding, account/security settings, marketing split-layout, password strength meters, "remember me".

## Open Questions (need human input)

1. **Env/config:** enable providers on/off via `AUTH_PROVIDERS`, or always require all three in production? (Recommendation: fail-fast if any enabled provider is unset, but allow subset in dev — encoded above.)
2. **Profile normalization:** should org display name come from `user.name` or provider `given_name`+`family_name`? Normalize per provider in the hook or provider config. (Provider profile shape differs.)
3. **Skip personalization:** allow the user to rename their space later instead of auto-filling now? (Recommendation: auto-fill now, editable in settings later.)
4. **Migration path:** when a transactional email provider is chosen, migrate new signups to magic-link-first?
5. **Google consent screen lead time:** start provider-approval before merging code?
6. **CI OAuth testing:** mock/record-playback vs manual E2E only? (Recommendation: backend unit tests mock provider profile delivery; keep one documented manual E2E per provider.)
7. **Client enabled-provider source:** `NEXT_PUBLIC_AUTH_PROVIDERS` (kept in sync manually) vs backend `GET /api/auth/providers` endpoint. (Recommendation: start with public env to avoid a new endpoint; revisit if drift is observed.)
8. **Microsoft Graph profile shape:** verify name/image fields in a real round-trip before relying on auto-fill.

## Verification (before implementation)

Before proceeding to implementation, confirm:
- [ ] Human approves this spec (or requests changes).
- [ ] OAuth apps created for dev (and prod/staging where possible) per provider; at least one round-trip validated.
- [ ] Plan + tasks will be produced under `docs/plans/` following `planning-and-task-breakdown` (after approval).
- [ ] No tenancy/billing/schema changes are introduced by this work.