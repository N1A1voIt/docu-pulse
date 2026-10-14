# Auth Parity Door: Social-First Sign-In for Individual Developers

## Problem Statement
How might we make DocuPulse's sign-in feel as frictionless, trusted, and familiar as Claude/OpenAI's for an individual developer — while staying on Better Auth and preserving the auto-personal-space-on-signup motion — so prospects stop dropping out at the auth gate?

## Recommended Direction
Ship a **provider-first parity door**: Google, GitHub, and Microsoft as three equal social buttons (consumer-parity order: Google → GitHub → Microsoft), with a side-by-side email/password form of equal visual weight, all feeding the existing Better Auth instance at `/api/auth/*`. No tenancy, billing, or schema changes. The personal-space auto-provisioning hook stays untouched, and the provider's display name flows into the newly auto-created organization so the user sees "their" space immediately.

The core bundle:
1. **Social providers in Better Auth config** — Google, GitHub, Microsoft, each with env-provided client ID/secret; one provider configuration block plus a small `/api/auth` mount change if needed.
2. **Production-safe auth URLs** — replace the hardcoded `baseURL = http://localhost:${env.port}` and lock `trustedOrigins` to the configured client origin in prod/dev; this is the part that silently breaks OAuth in non-dev and must ship in the same PR.
3. **Provider-row UI on both `/sign-in` and `/sign-up`** — three social buttons, a divider, then the existing (now restyled) email/password form; loading + per-button disabled states; network-error copy unchanged.
4. **Email-collision policy** — if `Continue with X` hits an email already tied to an email/password account, surface a single clear message with a way to sign in with the existing method (no dead end, no duplicate personal org).
5. **Profile → org auto-fill** — `user.create.after` passes `user.name` (or provider-derived name) into `createPersonalOrganization`, so the personal space displays the provider's name without an extra onboarding step.

Button order is consumer parity (Google first) to match the Claude/OpenAI mental model users already have; GitHub's second position is the one dev-native signal. Passwords remain a first-class equal fallback because magic-link/email-OTP depends on a transactional email provider we haven't chosen yet.

## Key Assumptions to Validate
- [ ] **Provider credentials + consent screens obtainable in each environment** (Google can take days/weeks) — test: create OAuth apps for dev + prod and complete one round-trip per provider before building UI polish.
- [ ] **Personal-org hook fires exactly once for a new social user** and `user.name`/`user.image` are populated — test: integration test on `/sign-up` via each provider asserting one org + one seat (extend existing auth smoke).
- [ ] **Email-collision flow is non-blocking** — test: create password account for `a@b.com`, then `Continue with Google` for same email; verify clear message, no duplicate org, no 500.
- [ ] **Production OAuth redirect works** (baseURL/trustedOrigins fix) — test: deploy to staging, run full sign-in/sign-up for all three providers end-to-end.
- [ ] **Auto-filled org name is acceptable** to users — test: 5 signups, eyeball resulting personal-space label; fall back to empty/generic if provider name absent.
- [ ] **Users will use social login for a dev tool** — test: instrument click rates Google vs password after launch; if social < 30% after 2 weeks, revisit button order/copy.

## MVP Scope
**In (v1 "Parity Door"):**
- Better Auth `socialProviders` for Google, GitHub, Microsoft + frontend `authClient.signIn.social` buttons on `/sign-in` and `/sign-up`
- Env plumbing (`GOOGLE_CLIENT_ID/SECRET`, `GITHUB_*`, `MICROSOFT_*`) with fail-fast validation in production when a provider is enabled but unset
- Fix `baseURL`/`trustedOrigins` to use configured origins per environment
- Equal-weight email/password form restyle with divider + provider row, per-button loading, inline errors, network-error copy retained
- Email-collision handling (single clear message + link to sign-in with existing method)
- Auto-fill personal org name from provider profile in `user.create.after`
- Extend auth smoke to cover at least Google (or one provider) end-to-end signup → personal space

**Out of scope for v1:**
- Passkeys/WebAuthn (no plugin in this Better Auth version)
- Magic link / email OTP (no transactional email provider chosen yet)
- SAML/OIDC SSO, SCIM, MFA, connected-accounts management, account deletion
- Account linking of multiple providers to one user
- Password reset & email verification (already deferred; not fixed here)
- OAuth token reuse for the Phase 1 GitHub webhook integration beyond identity

## UI/UX Polish (v1 — the craft floor that makes parity feel real)

The parity door's competitive value is mostly craft. These are in-scope alongside the functional changes, not optional polish:

- **Page shell:** centered single card (max ~400px), brand mark + title, one calm subtitle ("Create your account" / "Welcome back"), no competing navigation or marketing chrome. Same shell on `/sign-in` and `/sign-up` to feel like one flow.
- **Provider buttons:** full-width, vertically stacked, in consumer-parity order (Google → GitHub → Microsoft); left-aligned provider icon + "Continue with …", brand-appropriate icon (not color-washed blobs), consistent height/typography; each gets its own spinner + disabled state while any OAuth redirect is in flight; group-level disable when form is submitting.
- **Divider:** horizontal rule with centered "or" between provider block and email form; subdued text color.
- **Email form (equal weight):** floating/label-above inputs preserved from current pages, labels wired to inputs; password input gains a show/hide toggle (eye icon, `aria-pressed`, `aria-label`); autocomplete (`email`, `current-password`/`new-password`) and `inputMode="email"` retained; magic of one-tap on mobile kept.
- **Inline validation:** fires after first interaction per field (existing behavior kept), with `aria-invalid` + helper text; password strength *not* added (avoid scope).
- **Loading & progress:** submit button spinner + "Signing in…" / "Creating account…"; no full-page spinner on navigation; disable double-submit.
- **Errors:** `role="alert"` under the form (already) with human copy; network errors mention backend reachability (already); provider-cancelled OAuth returns to the same page with a neutral, non-alarming message.
- **Redirects:** support `?next=/path` and resume it after successful sign-in/sign-up; already-authenticated visitors are redirected away from auth pages (existing behavior, kept).
- **Accessibility:** tab order providers → divider → form; visible focus rings; screen-reader labels for icon-only controls; `aria-live` for async status; error text announced.
- **Responsiveness:** mobile-first full-width card with safe-area padding; touch targets ≥ 44px; provider icons don't shrink below 16px.
- **Theming:** reuse shadcn tokens so dark/light stay consistent; no hard-coded brand colors beyond provider marks.
- **Motion:** 150–200ms transitions on hover/focus; respect `prefers-reduced-motion`.
- **Trust copy:** small footer links ("Terms", "Privacy") + a one-line reassurance on `/sign-up` ("We'll never post to your accounts without permission"); no marketing essay.
- **Social profile use:** avatar displayed in the top bar post-login; org name auto-filled from provider profile (recommended) with deterministic fallback to "Personal space" when no name is present — no forced naming prompt.

**Explicitly not in this polish pass:** password strength meters, "remember me", multi-step onboarding, animated illustrations, account-center/security-settings screens, marketing split-layout (hero image). These remain in the "Not Doing" bucket.

## Not Doing (and Why)
- **Passkeys** — strongest modern-auth signal, but this Better Auth version ships no passkey plugin; adopting a standalone lib + fallback flow is a separate initiative. Parity first.
- **Magic link / email OTP** — would elegantly sidestep deferred verification/reset, but a transactional email provider is undecided and this is a second auth paradigm. Revisit once email infra lands.
- **Account linking of multiple providers** — needs a provider-management UI and collision handling beyond v1; single provider per account is enough to close the competitive gap.
- **SSO/SAML/SCIM/MFA** — enterprise scope with no enterprise users; schema already supports it later. Keep the tenancy/role foundation, don't build the flows.
- **Deprecating passwords** — password reset/verification debt is real, but forcing a paradigm shift on existing and new users is a separate migration. Passwords stay equal in v1.
- **Claude/OpenAI-style account center** (session/device list, connected apps, security settings) — separate initiative; this spec is the door, not the house.
- **Org-level provider restrictions / domain capture** ("only @acme.com" orgs) — enterprise feature; depends on SSO work that's out of scope.

## Open Questions
- Env/config: do we enable providers on/off by env, or always require all three in production? (Recommendation: fail-fast if any of the three enabled-by-config is unset, but allow `AUTH_PROVIDERS=google` to subset in dev.)
- Should the personal org display name come from `user.name` or provider `given_name`+`family_name`? (Provider profile shape differs per provider; normalize.)
- Should sign-up allow a "skip personalization" so the user names their space themselves later? (Recommendation: auto-fill now, editable in settings later — no upfront prompt, lowers friction.)
- When a transactional email provider is chosen, do we migrate new signups to magic-link-first and retroactively de-emphasize passwords?
- Does closing the provider-approval (Google consent screen) lead time require starting that process before any code is merged?
- Testing: how to run OAuth in CI without real provider secrets (mock or record/playback)?
