# Security Review — Frontend (`frontend/`)

> Skill: `security-and-hardening` (threat-model-first + boundary rules)
> Branch: `docs/security-review-frontend`
> Date: 2026-10-16
> Scope: the Next.js 16 app in `frontend/` and its trust boundary with the
> Fastify API in `backend/`. Backend internals are in scope only where the
> frontend depends on them (session cookies, CORS, invite links).
> Method: static review of `app/`, `components/`, `hooks/`, `lib/`, plus
> `next.config.ts`, dependency manifest and committed lockfile, and `npm audit`.

## 1. Threat model (trust boundaries)

| Boundary | Untrusted data crossing it | Assets behind it |
|---|---|---|
| Browser → Fastify API (`:3000` → `:3001`, cross-origin) | Request bodies, `credentials: include` cookie | Session cookie, org/member/invite data |
| URL / query string | `next`, `token`, OAuth `error` / `error_description` | Redirect destination, invite token, displayed text |
| API → React render | JSON: spaces, members, invites, session `user` (name/email/image), server error `message` | Shown to a possibly-attacked user; must never become script/HTML |
| Build env → bundle | `NEXT_PUBLIC_*` | Anything inlined is public forever |
| Invite link (email → browser) | `?token=` in the URL | Invite token (bearer secret) |

STRIDE lens applied below; findings are grouped by severity.

## 2. Findings summary

| ID | Sev | Title | Primary location | Status |
|---|---|---|---|---|
| F1 | **High** | No CSP or security headers on the Next app (XSS/clickjacking surface) | `frontend/next.config.ts` | **Fixed** |
| F2 | **Medium** | Cross-site session cookie + no CSRF token on state-changing API calls | `lib/api.ts`, `app/(auth)/invites/accept` | **Fixed** (see 7) |
| F3 | **Medium** | `shadcn` CLI shipped as a runtime dependency (9 high audit findings) | `package.json:21`, lockfile | **Fixed** |
| F4 | **Medium** | Invite token carried in the URL query string; no `Referrer-Policy` | `app/(auth)/invites/accept/page.tsx:63` | **Partially fixed** (see 7) |
| F5 | **Low** | `next` redirect guard is string-based, not origin-based | `app/(auth)/sign-in/page.tsx:16` | **Fixed** (see 7) |
| F6 | **Low** | Server-supplied `signInPath` navigated without validation | `app/(auth)/invites/accept/page.tsx:40,156` | **Fixed** (see 7) |
| F7 | **Low** | Avatar `<img src={user.image}>` — unvalidated remote URL | `components/shell/global-bar.tsx:62` | **Fixed** (see 7) |
| F8 | **Low** | `document.cookie` sidebar write lacks `SameSite`/`Secure` | `components/ui/sidebar.tsx:85` | **Fixed** (see 7) |
| F9 | **Info** | Server error strings rendered directly in UI | `lib/spaces.tsx`, invites/members pages | **Fixed** (see 7) |
| F10 | **Info** | No install-script policy; no `middleware.ts` for nonces | repo root |
| F11 | **High** | No lockfile tracked anywhere — installs are non-reproducible | root `.gitignore` | **Fixed** (see 7) |

Positives that must not regress: no `dangerouslySetInnerHTML`/`innerHTML`/`eval`,
no auth tokens in `localStorage`/`sessionStorage`, `.env*` gitignored, only
non-secret `NEXT_PUBLIC_*` values inlined, React escaping used everywhere,
OAuth error text sanitised (`lib/auth-errors.ts:34`), and client-side gates are
consistently documented as display-only with the server as the enforcement point.

---

## 3. Detailed findings

### F1 — High: No CSP or security headers on the frontend

`frontend/next.config.ts` defines no `headers()`. The backend sets
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` and TLS-aware HSTS — but only on **API** responses
(`backend/src/server.ts:34-42`). HTML pages are served by Next on the app origin
and carry none of these. The backend plan explicitly deferred this
("No API CSP added (left to frontend/CDN)"), so this is the frontend's gap.

Consequences:
- **XSS defence is single-layer.** With no `script-src`, any injected inline
  script executes. Today there is no `dangerouslySetInnerHTML`, so nothing is
  directly exploitable, but a single future dependency/`<Script>`/sanitizer
  bug becomes full account takeover of a cookie-authenticated session.
- **Clickjacking.** No `X-Frame-Options` / `frame-ancestors`, so the app
  (including the credential sign-in form and one-click Invite/Revoke actions)
  can be framed and UI-redressed.
- No `Referrer-Policy` compounds F4 (token/referrer leakage).

Remediation:
- Add a `headers()` block in `next.config.ts` returning at minimum
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy`. Prefer CSP via `middleware.ts` with a per-request nonce
  over `'unsafe-inline'`.
- Start CSP from `default-src 'self'`; `connect-src` must include the API origin
  and `img-src` must allow the avatar hosts actually used (OAuth avatars are
  remote — Google/GitHub/Microsoft), otherwise images break. Verify against
  DevTools (the `security-and-hardening` verification step calls for exactly
  this).
- HSTS belongs at the edge/CDN for the app origin.

> **Resolved (2026-10-16):** static CSP + headers added in `frontend/next.config.ts`
> `headers()`. A **nonce** was chosen against deliberately: the CSP guide states
> nonce-based CSP requires dynamic rendering and is incompatible with Partial
> Prerendering, and this app runs `cacheComponents: true` (PPR by default), so a
> nonce would strip the prerendered shell's scripts. The static policy uses
> `script-src 'self' 'unsafe-inline'` (Next's inline bootstrap scripts need it
> without a nonce) and still locks down `object-src`, `base-uri`, `form-action`,
> `frame-ancestors` and the connect/img/font origins. See §7 and the config's
> header comment.

### F2 — Medium: Cross-site session cookie and CSRF posture

The browser talks to the API cross-origin with `credentials: "include"`
(`lib/api.ts:15`). The session cookie is set by the **API** origin. Better Auth
is configured with `trustedOrigins` only (`backend/src/auth/auth.ts:47`) — no
explicit `advanced.cookie`/`defaultCookieAttributes` and no `crossSubDomainCookies`.

Two deployment shapes, very different risk:
- **app and api under one registrable domain** (`app.example.com` /
  `api.example.com`) → same-site, so `SameSite=Lax; Secure; httpOnly` works and
  Lax is itself the CSRF defence. **This is the shape to target.**
- **truly cross-site** (different registrable domains) → cookie must become
  `SameSite=None; Secure`, which (a) is increasingly blocked by browsers
  (third-party cookie phase-out) and (b) removes the `SameSite` CSRF defence,
  leaving only CORS + Better Auth origin checks.

CSRF specifics regardless of shape: CORS with `credentials: true` and an
explicit origin allowlist (`backend/src/server.ts:44-49`) blocks cross-origin
*reads* and preflighted writes, but a **simple** cross-site form POST (no
custom headers, `text/plain`/form content type) still attaches cookies. The
app's own non-auth state-changers — `POST /api/organizations`,
`POST /api/organizations/:id/invites`, `DELETE .../invites/:id`,
`POST /api/invites/:token/accept` — carry **no CSRF token**. With
`SameSite=Lax`/`Strict` these are protected; with `SameSite=None` they are not.
The invite-accept POST is the most exposed because it is designed to be reached
from an emailed link and has no body, so it can be issued as a simple request.

Remediation / verification (overlaps backend open Task 5):
- Decide the deployment topology and pin cookie attributes accordingly; prefer
  same-site + `SameSite=Lax`.
- If `SameSite=None` is unavoidable, add an explicit CSRF defence (Origin/Referer
  assertion middleware on state-changing routes, or a double-submit token) for
  the org/invite endpoints.
- Record the outcome in `docs/plans/todo-security-hardening.md` Task 5.

> **Resolved (2026-10-16):** topology confirmed as same-site subdomains, so the
> posture stays `SameSite=Lax`. Applied both hardening steps:
> 1. Cookie attributes are now **pinned explicitly** in `backend/src/auth/auth.ts`
>    (`advanced.useSecureCookies` + `advanced.defaultCookieAttributes:
>    { httpOnly, sameSite: "lax", secure, path: "/" }`) instead of relying on
>    library defaults. Verified at runtime: dev (`http://localhost:3001`) emits
>    `better-auth.session_token` with `secure=false`; https emits
>    `__Secure-better-auth.session_token` with `secure=true`; both `SameSite=Lax`,
>    `HttpOnly`, `Path=/`.
> 2. An **Origin/Referer assertion** hook (`backend/src/server.ts`) now rejects
>    any state-changing request that carries a session cookie and an
>    `Origin`/`Referer` outside `trustedOrigins` with `403 FORBIDDEN`. It skips
>    safe methods and `/api/auth/*` (which Better Auth already origin-checks), and
>    is fail-closed when a cookie is present but neither header is.
> Covered by `backend/tests/security.csrf.test.ts` (7 cases).

### F3 — Medium: `shadcn` CLI is a runtime dependency (9 high audit findings)

`shadcn` is listed under `dependencies` (`package.json:21`) though it is a
dev-time scaffolding CLI — nothing imports it (`grep` for `from "shadcn"`
returns nothing; it is only a `bin`). It drags a large dev-only tree into the
production install:

```
npm audit (frontend): 9 high, 0 critical, 0 moderate, 0 low
  shadcn            → @shadcn/registry, fast-glob, ts-morph
  fast-glob         → micromatch → braces (stack-exhaustion DoS)
  ts-morph          → @ts-morph/common
  eslint-config-next→ @next/eslint-plugin-next → fast-glob   (devDep, build/test only)
```

Reachability: `shadcn` and `eslint-config-next` are build/authoring tools, not
runtime paths — so real-world impact today is low. But shipping a CLI in
`dependencies` enlarges the production dependency and script-execution surface
for no runtime benefit, and the lockfile is what CI installs.

Remediation:
- Move `shadcn` to `devDependencies`. Re-run `npm audit`; upgrade `ts-morph`
  with a normal `npm audit fix` (non-`--force`).
- Do **not** run `npm audit fix --force` (it proposes `eslint-config-next` and
  `shadcn` **major** downgrades). Review per package and test.
- Document deferrals with a review date (the open backend Task 6 covers the same
  triage; fold the frontend half in).
- See F10 for the install-script gate.

> **Resolved (2026-10-16):** `shadcn` moved from `dependencies` to
> `devDependencies` (`frontend/package.json`). It is a scaffolding CLI — nothing
> imports it and no script invokes it — so it never belonged in the production
> graph. `npm audit --omit=dev` now reports **0 vulnerabilities**.
>
> The remaining 9 high findings are **dev-only**: `shadcn` and
> `eslint-config-next` (→ `@next/eslint-plugin-next` → `fast-glob`) trees, none
> reachable at runtime, build, or deploy. They are **deferred, not fixed**:
> - `braces` is already at `3.0.3` yet still carries an advisory whose range is
>   `*` (a newer stack-exhaustion DoS) with **no patched upstream version**. npm's
>   only suggestion is to *downgrade* `shadcn` to `1.0.0` — a major, wrong
>   direction that must not be applied. No `overrides` pin can fix a `*` range.
> - Do **not** run `npm audit fix --force`; the non-forced `npm audit fix` also
>   churns the lockfile with unrelated optional platform bindings.
> - Review date: re-check when `shadcn` / `eslint-config-next` ship updates.

### F4 — Medium: Invite token travels in the URL query string

The invite flow puts a bearer token in the URL:
`/invites/accept?token=…` (`app/(auth)/invites/accept/page.tsx:63`), and the
backend builds that same link for email. Query tokens leak via `Referer` to any
third-party resource the accept page loads, browser history, and proxy/server
logs. This is made worse by the missing `Referrer-Policy` (F1).

Remediation:
- Set `Referrer-Policy: strict-origin-when-cross-origin` (or `no-referrer`) on
  the accept route as part of F1.
- Strip the token from the address bar after a successful accept
  (`history.replaceState`).
- Consider moving the token to a POST body for the accept call (backend change),
  or make tokens single-use and short-lived (verify current backend behaviour).

> **Partially resolved (2026-10-16):** `Referrer-Policy: strict-origin-when-cross-origin`
> is now set on app responses (F1 change), so a cross-origin navigation from the
> accept page sends only the origin — the token no longer leaks in `Referer` to
> third parties. Still open: strip the token from the address bar after a
> successful accept (`history.replaceState`) and/or move it out of the query
> string. Tracked as follow-up in §7.

### F5 — Low: `next` redirect guard is string-based

`safeNext` (`app/(auth)/sign-in/page.tsx:16-20`, duplicated in `sign-up`) allows
any value starting with `/` that does not start with `//`. That correctly blocks
`https://evil` and `//evil`, but string heuristics are brittle against
backslash/encoding variants (`/\evil.com`, `/%2F%2Fevil.com`) and rely on the
router's normalisation. Prefer an origin assertion:

```ts
const url = new URL(value, window.location.origin);
if (url.origin !== window.location.origin) return "/";
return url.pathname + url.search + url.hash;
```

Duplication across the two pages is a maintenance hazard — extract one helper.

> **Resolved (2026-10-16):** extracted a single `safeRedirectPath` helper
> (`frontend/lib/safe-redirect.ts`) implementing exactly the origin assertion
> above, now imported by both `sign-in/page.tsx` and `sign-up/page.tsx`. The
> brittle `startsWith` guard is gone. It returns `null` for missing/unsafe
> values so each caller picks its own fallback (`?? "/"` on the auth pages).
> See §7 for the verification matrix.

### F6 — Low: server-supplied `signInPath` navigated unvalidated

`app/(auth)/invites/accept/page.tsx:40` reads `body.signInPath` from the API
response and `:156` does `router.push(signInPath)` with no validation. Today the
value is server-controlled and well-behaved, but the client treats a
network-supplied string as a safe internal route. Apply the same `safeNext`
guard client-side and allowlist the path server-side.

> **Resolved (2026-10-16):** `signInPath` is now passed through
> `safeRedirectPath` at the boundary where it enters state
> (`invites/accept/page.tsx`), so an off-origin or `javascript:` value becomes
> `null` and the "Sign in as invited email" button is simply not rendered. The
> `router.push` call also re-runs the guard with a `/sign-in` fallback as
> defence in depth. Server-side the value is built from a fixed constant
> template (`/sign-in?next=` + an `encodeURIComponent`'d internal path in
> `backend/src/invitations/invitations.service.ts`), so it is already
> origin-constrained by construction; no backend change was needed. See §7.

### F7 — Low: unvalidated avatar URL rendered into `<img>`

`components/shell/global-bar.tsx:62-70` renders `user.image` directly. `<img>`
will not execute `javascript:`, but an attacker-influenced value can still be an
unexpected remote URL (privacy/tracking, mixed content, and it widens the CSP
`img-src` we must allow in F1). Validate/persist avatar URLs as `https:` only at
ingest (backend), and render with `referrerPolicy="no-referrer"`.

> **Resolved (2026-10-16):** fixed on both sides, defence in depth.
> - **Frontend render.** New `frontend/lib/safe-image-url.ts`
>   (`safeImageUrl`) accepts only an absolute `https:` URL and returns `null`
>   otherwise (`data:`/`blob:`/`javascript:`, protocol-relative, relative, or
>   garbage). `components/shell/global-bar.tsx` renders the validated URL and
>   adds `referrerPolicy="no-referrer"`, falling back to the initial-letter
>   avatar when the value is rejected. Covered by
>   `frontend/lib/safe-image-url.test.ts` (13 cases).
> - **Backend ingest.** The displayed avatar is the **Better Auth session's**
>   `user.image` (auth schema), not our public `users.avatar_url`, so the guard
>   had to sit on Better Auth's persistence. New
>   `backend/src/auth/avatar-url.ts` (`sanitizeAvatarUrl`) and a
>   `databaseHooks.user.create.before` + `update.before` in
>   `backend/src/auth/auth.ts` now persist https-only avatars. The
>   `update.before` hook is a no-op when the update carries no `image` key, so an
>   unrelated profile change cannot wipe a stored avatar. The existing
>   `create.after` write to `users.avatar_url` therefore stores the already
>   sanitised value. Covered by `backend/tests/avatar-url.test.ts` (7 cases).
> - **Residual:** the app CSP `img-src` allowlist (F1) remains the enforced
>   control for *which hosts* may load; the scheme check above is the portable
>   guard for non-CSP consumers (email, other clients). Tightening the CSP to
>   drop `data:`/`blob:` from `img-src` was not done — Next/React may rely on
>   them — so keep that in mind if a future sink renders a raw `data:` URL.

### F8 — Low: sidebar cookie lacks `SameSite`/`Secure`

`components/ui/sidebar.tsx:85` writes `sidebar_state` via `document.cookie`
without `SameSite` or `Secure`. It is non-sensitive UI state (not auth), so this
is hygiene rather than a vuln — but it is the kind of pattern that gets copied
onto a real cookie later. Add `; SameSite=Lax` (and `Secure` in prod).

> **Resolved (2026-10-16):** the hand-rolled cookie string is gone. New
> `frontend/lib/cookies.ts` (`serializeCookie`) emits `Path`, optional
> `Max-Age`, `SameSite` (default `Lax`), `Secure` when asked, and `HttpOnly`
> (harmless no-op client-side), percent-encodes the value, and rejects a cookie
> name containing separators/whitespace so it cannot inject extra attributes.
> `components/ui/sidebar.tsx` now writes `sidebar_state` through it with
> `secure: window.location.protocol === "https:"`, so `Secure` is applied over
> HTTPS and omitted in local http dev (where a `Secure` cookie would be
> dropped). Covered by `frontend/lib/cookies.test.ts` (5 cases).

### F9 — Info: server error strings rendered directly

`lib/spaces.tsx:98`, `app/(app)/orgs/[id]/members/page.tsx:46`, and the invites
page surface either client-constructed status strings or `body.message`/`body.error`
from the API. React escapes them, so this is not XSS; it is an
information-disclosure concern. Rule: the API must keep user-facing `message`
generic and log internals server-side only. Confirm backend error bodies never
carry stack traces/SQL text.

> **Resolved (2026-10-16):** the leak was server-side. `backend/src/server.ts`
> returned `err.message` for **any** unexpected error, so a `pg` failure
> (`relation "users" does not exist …`) or a `createTeamOrganization` throw
> (`Unknown plan: …`) was echoed to the client and rendered. New
> `backend/src/http/public-error.ts` (`toPublicError`) passes only our own typed
> `InvitationError` through (its `code`/`message`/`extra` are authored
> constants) and maps everything else to a generic
> `500 { error: "INTERNAL_ERROR", message: "Something went wrong" }`. The
> caller logs the real error server-side and — deliberately — never includes the
> request URL, since invite tokens travel in the path (F4). Covered by
> `backend/tests/public-error.test.ts` (4 cases). The frontend already escaped
> these strings via React, so it needed no change; the client-constructed
> `Failed to load … (status)` strings carry no server internals.

### F10 — Info: install-script policy and header plumbing

- No `.npmrc` is committed. The only package in `frontend/package-lock.json`
  carrying an install script is `unrs-resolver` (a native module used by the
  ESLint toolchain), which **needs** its script to select its platform binary.
  A blanket `ignore-scripts=true` would therefore break `npm run lint`. The right
  posture is a documented allowlist rather than a blanket disable: inspect the
  one script, keep scripts enabled, and verify with a clean `npm ci` once a
  lockfile is tracked (see F11). npm has no per-package
  `onlyBuiltDependencies` allowlist (unlike pnpm), so the practical controls are
  review + committed lockfile + `npm audit signatures`.
- No `proxy.ts`/`middleware.ts` exists — relevant because nonce-based CSP (F1)
  would be implemented there.

### F11 — High: no lockfile is tracked (non-reproducible installs)

The root `.gitignore` (`package-lock.json`, line 3) ignores lockfiles
**globally**, so no lockfile is tracked anywhere in the repo —
`git ls-files | grep lock` returns only unrelated source files, while
`frontend/package-lock.json` and `backend/package-lock.json` exist solely on
disk (confirmed with `git check-ignore`). Consequences:

- A fresh clone has no lockfile, so `npm ci` cannot run and installs are not
  reproducible. Any dependency — including a bad or malicious patch release —
  can enter on a plain `npm install` with no pinned version or integrity hash.
- The `security-and-hardening` verification step ("run the native audit against
  the committed lockfile") cannot be satisfied, and CI has nothing authoritative
  to enforce.

Remediation:
- Stop ignoring lockfiles: remove the `package-lock.json` line from the root
  `.gitignore` and commit `frontend/package-lock.json` and
  `backend/package-lock.json`.
- Add CI that installs frozen (`npm ci`) and runs `npm audit` + `npm audit
  signatures` on every PR.

This is a repo-wide policy change (it affects the backend too), so it is
recorded as a proposal rather than applied on this frontend branch — see §7.

> **Resolved (2026-10-16):** the root `.gitignore` no longer ignores
> `package-lock.json`, and both lockfiles are now committed. The backend lock was
> regenerated so `vitest` is correctly attributed (see §7). A CI workflow
> (`.github/workflows/ci.yml`) installs **frozen** and gates on
> lint/typecheck/build/tests plus `npm audit --omit=dev --audit-level=high`.
> Verified: `npm ci` succeeds in both packages and `npm audit --omit=dev` reports
> **0 vulnerabilities** in both.

---

## 4. Positive findings (keep these)

- **No DOM-injection sinks.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function`, `srcdoc`, or `javascript:` URLs in the app.
- **No tokens in web storage.** Session is cookie-based; nothing sensitive in
  `localStorage`/`sessionStorage`.
- **Secret hygiene.** `.env*` is gitignored (`frontend/.gitignore`, root
  `.gitignore`); only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_AUTH_PROVIDERS` are
  inlined, and both are non-secret.
- **Output is escaped.** Every user/API string (org name, slug, member email,
  invite email, OAuth error text) renders as text nodes.
- **OAuth error text is sanitised** and truncated (`lib/auth-errors.ts:34-39`).
- **Client gates are explicitly display-only.** `documentsUnlockedFor`,
  `canInvite`, and the space gate document that the server enforces
  (`lib/spaces.tsx:170-177`, invites page comment). Verify backend enforcement
  holds (it does for role/entitlement).

## 5. Suggested remediation order

1. **F1** headers/CSP + F4 `Referrer-Policy` — **DONE** (`next.config.ts` `headers()`; see §7).
2. **F2** cookie topology / CSRF — **DONE** (same-site confirmed; cookies pinned + Origin assertion; see §7).
3. **F3** move `shadcn` to devDependencies — **DONE** (production graph clean); dev-only advisories deferred (see §7).
4. **F11** track lockfiles + frozen-install CI — **DONE** (see §7). Install-script policy (F10) remains.
5. **F5/F6** extract and apply one redirect-safety helper — **DONE** (`lib/safe-redirect.ts`; see §7).
6. **F7/F8/F9** hardening hygiene + backend error-body review — **DONE** (avatar URL validation + ingest guard, `serializeCookie`, `toPublicError`; see §7).

## 6. Review checklist status (`security-and-hardening` §Verification, frontend half)

- [x] Security headers present on app responses (F1) — **met** (verified 2026-10-16)
- [ ] No secrets in source/history — **met**
- [x] No `dangerouslySetInnerHTML`/`eval` with untrusted data — **met**
- [ ] All user input validated at the boundary — **met for forms; server is the boundary**
- [ ] Rate limiting backed by shared store (frontend relies on API) — **n/a / backend**
- [ ] Server-side URL fetches validated against allowlist — **n/a (no frontend SSR fetch)**
- [ ] LLM/model output validated — **n/a (no AI features)**
- [x] Dependency audit has no unmitigated reachable critical/high — **met for the production graph, both packages (`--omit=dev` = 0)**; remaining dev-only advisories are deferred with rationale (F3)
- [x] The authoritative lockfile is committed and CI installs frozen — **met** (F11: lockfiles committed + `.github/workflows/ci.yml` runs `npm ci`)
- [x] Client-side redirect targets are origin-validated before `router.push`/`router.replace` — **met** (F5/F6: `safeRedirectPath`, covered by `frontend/lib/safe-redirect.test.ts`; CI runs `npm test`)
- [x] Error responses don't expose internals — **met** (F9: `toPublicError` passes only our authored `InvitationError` through and returns a generic `500` body otherwise, logging the real error server-side; covered by `backend/tests/public-error.test.ts`)

## 7. Remediation log

### 2026-10-16 — F1 + F4 (`frontend/next.config.ts`)

Added an async `headers()` returning, for every route:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'[ 'unsafe-eval' in dev]; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: <known avatar hosts>; font-src 'self'; connect-src 'self' <API origin>; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'[; upgrade-insecure-requests in prod]` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (prod only) |

**Why a static CSP, not a nonce:** the CSP guide states nonce-based CSP needs
dynamic rendering and is incompatible with Partial Prerendering; this app runs
`cacheComponents: true` (PPR by default). A nonce would leave the static
shell's scripts un-nonced and break hydration. Tightening to nonce/hash CSP is
a follow-up **gated on dropping `cacheComponents`**.

**Verification performed:**
- `npm run build` — succeeds; 11 routes (static + partial prerender) generated.
- `next start` on a scratch port — production response carries the CSP (no
  `'unsafe-eval'`, with `upgrade-insecure-requests` + HSTS); the running `next dev`
  server carries the dev variant (`'unsafe-eval'`, no upgrade directive). The
  config evaluates `NODE_ENV` correctly in each server process.
- Rendered HTML inspected: all `<script src>` are same-origin
  (`/_next/static/...`), inline bootstrap `<script>` tags are present (hence
  `'unsafe-inline'`), and **no external subresource origins** are referenced, so
  the policy matches real output.
- No Chrome DevTools MCP is configured in this environment, so the DevTools
  console check from the skill was substituted with the header + HTML inspection
  above; a browser console pass is still recommended before/at launch.

**Known residual:** `script-src`/`style-src` include `'unsafe-inline'`, so an
injected inline script would still run. This is accepted only because the app
has no raw-HTML sink and React escapes all output; the nonce/hash upgrade is the
way to remove it.

**Follow-ups created by this change:**
- Strip the invite token from the URL after accept (`history.replaceState`) — F4 tail.
- Verify OAuth avatars render (CSP `img-src` allowlist covers
  `*.googleusercontent.com`, `avatars.githubusercontent.com`, `*.microsoft.com`);
  adding a provider means extending the allowlist.
- Consider `poweredByHeader: false` and moving CSP to the CDN/edge alongside HSTS
  when a CDN terminates TLS.

### 2026-10-16 — F3 (`frontend/package.json`)

`shadcn` moved from `dependencies` to `devDependencies` (it is a scaffolding CLI
— nothing imports it, no script runs it). Result:

- `npm audit --omit=dev` → **0 vulnerabilities** (was 7 high, all from `shadcn`).
- Full `npm audit` → 9 high remaining, all **dev/build-only** (`shadcn` +
  `eslint-config-next` trees). Deferred with rationale: `braces` (already 3.0.3)
  has a `*`-range advisory with no upstream fix, and npm's suggested remedy is a
  `shadcn` major *downgrade*. No overrides can satisfy a `*` range.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` all green after the move.

Verification note: `npm audit fix` (even non-forced) additionally rewrites the
lockfile with optional platform bindings, so it was not applied.

**Discovery:** while verifying, the lockfile turned out to be **untracked** — see
F11, which is the more serious supply-chain gap and supersedes the "audit against
the committed lockfile" step.

### 2026-10-16 — F2 investigation + fix (`backend/src/auth/auth.ts`, `backend/src/server.ts`)

Static inspection of the installed dependencies and backend config:

- **Better Auth (v1.7.7) cookie defaults** (`dist/cookies/index.mjs:31-44`):
  `sameSite: "lax"`, `httpOnly: true`, `path: "/"`, and `secure` derived from the
  baseURL scheme (`https` ⇒ `true`; dev `http://localhost:3001` ⇒ `false`), with
  the `__Secure-` name prefix applied when secure. These are library defaults —
  `backend/src/auth/auth.ts:43-61` sets `trustedOrigins` but **no** explicit
  `advanced.cookie`/`defaultCookieAttributes`, so the posture is implicit.
- **Better Auth CSRF** (`dist/api/middlewares/origin-check.mjs:43-70,96-118`):
  `originCheckMiddleware` runs on every non-GET/OPTIONS/HEAD `/api/auth/*`
  request and, whenever a `Cookie` header is present, validates `Origin`/`Referer`
  against `trustedOrigins`, rejecting mismatches with `FORBIDDEN`. Auth routes
  are therefore covered by **both** `SameSite=Lax` and an origin check.
- **The app's own Fastify state-changers** (`POST /api/organizations`,
  `POST /api/organizations/:id/invites`, `DELETE .../invites/:id`,
  `POST /api/invites/:token/accept`) have **no** origin/CSRF check; they rely
  solely on `SameSite=Lax` (`lib/api.ts` sends `credentials: "include"`) plus the
  CORS allowlist.

Conclusion: the current posture is already the recommended `SameSite=Lax` one and
is safe **as long as the app and API are same-site** (subdomains of one
registrable domain — `SameSite` is site-scoped, so `Lax` still works across
`app.` / `api.` subdomains). The risk materialises only under a truly cross-site
deployment, where `Lax` stops sending the cookie and teams are pushed to
`SameSite=None`, which removes the CSRF defence from the org/invite routes.

Proposed hardening (touches auth/CORS, so it needs sign-off — see §8):

1. Pin the cookie posture explicitly in `backend/src/auth/auth.ts`
   (`advanced.defaultCookieAttributes: { sameSite: "lax", httpOnly: true, secure:
   <https> , path: "/" }`) so it cannot drift with a library upgrade.
2. Add an `Origin`/`Referer` assertion `preHandler` for the state-changing
   non-auth routes as defence in depth, independent of `SameSite`.
3. Record the deployment-topology requirement (same-site) in the backend docs /
   `todo-security-hardening.md` Task 5.

Not applied yet — the chosen topology (and therefore whether (2) is the right
shape vs. a double-submit token) is a product/deploy decision.

**Applied (topology confirmed same-site):**

1. `backend/src/auth/auth.ts` — added `advanced.useSecureCookies` and
   `advanced.defaultCookieAttributes` (`httpOnly: true`, `sameSite: "lax"`,
   `secure: <https>`, `path: "/"`), derived from `BETTER_AUTH_URL`. The posture is
   now explicit and cannot drift with a Better Auth upgrade. Runtime-verified:
   dev emits `better-auth.session_token` (`secure=false`), https emits
   `__Secure-better-auth.session_token` (`secure=true`); both `SameSite=Lax`,
   `HttpOnly`, `Path=/`.
2. `backend/src/server.ts` — added an `onRequest` hook that rejects (403
   `FORBIDDEN`) any non-safe request carrying a session cookie whose
   `Origin`/`Referer` is outside `trustedOrigins`, or that carries neither header.
   Safe methods and `/api/auth/*` (already origin-checked by Better Auth) are
   exempt. This is defence in depth so the org/invite routes no longer depend on
   `SameSite` alone.
3. `backend/tests/security.csrf.test.ts` — 7 cases covering untrusted origin,
   missing origin, Referer fallback, trusted origin passthrough, safe methods,
   cookie-less requests, and the `/api/auth/*` exemption.

### 2026-10-16 — F3 tail + F11 (backend deps, lockfiles, CI)

- **Backend dev advisory cleared.** `npm audit --omit=dev` reported 2 critical +
  1 moderate from `vitest@3.2.7`. Cause: `better-auth` declares an *optional peer*
  on `vitest`, so npm counts the runner in the production graph — which also
  exposed a stale lock where `vitest` lacked its `dev` flag. Fixed by upgrading
  `vitest` to `^4.1.12` (the advisory
  [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) is
  patched in 4.1.11; the 3.x line has no fix) and reconciling the lock. Result:
  `npm audit` and `npm audit --omit=dev` both report **0** for the backend; the
  full suite (13 files / 60 tests) passes on vitest 4. Note: vitest 4 requires
  Node `^20 || ^22 || >=24` — CI pins Node 22; local Node 23 only warns.
- **Lockfiles tracked.** Removed `package-lock.json` from the root `.gitignore`
  and committed `frontend/package-lock.json` + `backend/package-lock.json`.
  `npm ci` verified successful in both packages (frozen install).
- **CI added** (`.github/workflows/ci.yml`): on every PR/push to `develop`/`main`,
  `npm ci` (frozen) then — frontend: lint, typecheck, build, `npm audit --omit=dev
  --audit-level=high`; backend: typecheck, tests against a `postgres:16` service,
  and the same audit gate.

### 2026-10-16 — F5 + F6 (`frontend/lib/safe-redirect.ts` + auth/invite pages)

**Cause.** Two client components fed network/URL-derived strings straight to
`router.replace`/`router.push`. Next's own `useRouter` reference warns that
untrusted URLs must not be passed to the router because a `javascript:` URL is
executed in the page context. The existing `safeNext` guard on the sign-in/up
pages was a string heuristic (`startsWith("/") && !startsWith("//")`) — brittle
against backslash and encoding variants — and was duplicated across both pages.
The invite-accept page applied no guard at all.

**Fix.**
- New `frontend/lib/safe-redirect.ts` exports `safeRedirectPath(value)`. It
  resolves the value against the app's own origin (`new URL(value, origin)`) and
  returns `pathname + search + hash` only when `url.origin === origin`; otherwise
  `null`. This rejects `https://evil.com`, `//evil.com`, `/\evil.com`,
  `\\evil.com`, `javascript:`/`data:` and unparsable input, while keeping
  legitimate internal paths (including `/%2F%2Fevil.com`, which stays
  same-origin and therefore safe). During SSR (no `window`) it resolves against a
  fixed fallback origin, so root-relative paths are accepted and absolute ones
  rejected — matching the client for the internally-generated values we pass.
- `sign-in/page.tsx` and `sign-up/page.tsx` (F5): the duplicated `safeNext` is
  deleted; both now `safeRedirectPath(searchParams.get("next")) ?? "/"`.
- `invites/accept/page.tsx` (F6): `signInPath` from the API response is passed
  through `safeRedirectPath` as it enters state, so an unsafe value becomes
  `null` and the "Sign in as invited email" button is not rendered. The
  `router.push` call re-runs the guard with a `/sign-in` fallback as defence in
  depth. The server-side producer already builds the path from a fixed constant
  template (`backend/src/invitations/invitations.service.ts`), so it is
  origin-constrained by construction and needed no change.

**Verification performed** (`safe-redirect.ts` compiled from source, `window`
origin `http://localhost:3000`; all 16 cases pass):

| Input | Result |
|---|---|
| `/orgs/abc` | `/orgs/abc` |
| `/orgs/abc?tab=members#top` | `/orgs/abc?tab=members#top` |
| `/sign-in?next=%2Finvites%2Faccept%3Ftoken%3Dx` | unchanged |
| `http://localhost:3000/ok` | `/ok` (same-origin normalised) |
| `/%2F%2Fevil.com` | unchanged (stays same-origin → safe) |
| `//evil.com` | `null` |
| `https://evil.com` | `null` |
| `/\evil.com` | `null` |
| `\\evil.com` | `null` |
| `javascript:alert(1)` / `JaVaScRiPt:alert(1)` | `null` |
| `data:text/html,<script>1</script>` | `null` |
| `""` / `null` / `undefined` | `null` |

Also: SSR (no `window`) — `/a` → `/a`, `//evil.com` → `null`. `npm run
typecheck`, `npm run lint` and `npm run build` (11 routes) all green.

**Committed test (2026-10-16, follow-up applied same day):** the matrix above is
now a committed vitest suite — `frontend/lib/safe-redirect.test.ts`, 19 cases
(the same-origin allow list plus every rejected form, in both browser and SSR
modes). It runs via `npm test` (`vitest run`), and the CI frontend job
(`.github/workflows/ci.yml`) now runs `npm test` between typecheck and build.
Setup notes: `vitest@^4.1.12` added to `devDependencies` (matches the backend,
requires Node `^20 || ^22 || >=24`, so CI's Node 22 is fine). The lockfile was
updated with **npm 11** because npm 10.9.x hit an arborist crash
(`Cannot read properties of null (reading 'edgesOut')` in `loadPeerSet`) on
vitest's optional-peer graph; the result stays `lockfileVersion: 3` and a
frozen `npm ci` was re-verified with npm 10 to confirm CI compatibility. No new
production dependency and `npm audit --omit=dev` remains **0**.

### 2026-10-16 — F7 + F8 + F9 (avatar URL, sidebar cookie, error bodies)

The last three standing findings, each fixed at the layer that owns the
boundary, with a small pure helper so the rule is unit-testable without a DB or
a browser.

**F7 — avatar URL.**
- The rendered avatar comes from the **Better Auth session** (`user.image`, auth
  schema) via `authClient.getSession()`, *not* our public `users.avatar_url`, so
  a UI-only guard would have missed the persistence path. Fixed on both sides:
  - `frontend/lib/safe-image-url.ts` — `safeImageUrl` accepts only an absolute
    `https:` URL, else `null`. `global-bar.tsx` renders it with
    `referrerPolicy="no-referrer"` and falls back to the initial avatar.
  - `backend/src/auth/avatar-url.ts` — `sanitizeAvatarUrl` (https-only) wired
    into `databaseHooks.user.create.before` **and** `update.before`
    (`backend/src/auth/auth.ts`). `sanitizedImageUpdate` returns `undefined`
    when the payload has no `image` key, so an unrelated update cannot wipe a
    stored avatar — the subtle failure mode this guard had to avoid.
- Tests: `frontend/lib/safe-image-url.test.ts` (13), `backend/tests/avatar-url.test.ts` (7).

**F8 — sidebar cookie.** `frontend/lib/cookies.ts` (`serializeCookie`) emits
`SameSite` (default `Lax`), `Secure` when asked, `Path`, optional `Max-Age`, and
rejects a name that could inject attributes; `components/ui/sidebar.tsx` writes
`sidebar_state` through it with `secure: window.location.protocol === "https:"`
(so dev http keeps the cookie; https gets `Secure`).
Test: `frontend/lib/cookies.test.ts` (5).

**F9 — error bodies.** `backend/src/http/public-error.ts` (`toPublicError`)
passes our authored `InvitationError` through and maps anything else to a
generic `500 { error: "INTERNAL_ERROR", message: "Something went wrong" }`;
`server.ts` logs the real error server-side (no request URL — the invite token
lives in the path, F4). This removes the `err.message` echo that could surface
`pg` SQL text or `Unknown plan: …`. Test: `backend/tests/public-error.test.ts` (4).

**Verification performed:**
- Backend: `npm run typecheck` clean; full suite **15 files / 71 tests** pass
  (was 13 / 60 — +2 files / +11 tests).
- Frontend: `npm test` **3 files / 37 tests** pass (was 1 / 19); `npm run lint`
  clean; `npm run build` succeeds (11 routes, same route table).
- Not verified end-to-end: the Better Auth `create.before`/`update.before` hooks
  firing under a live OAuth sign-up (requires provider credentials). The hooks
  are typed against the installed `@better-auth/core` `databaseHooks` signature
  and the guard function is unit-tested; a live social-sign-in smoke test is the
  remaining gap.

## 8. Decision recorded (2026-10-16)

**Deployment topology: app and API are same-site** (`app.example.com` +
`api.example.com`, subdomains of one registrable domain). Therefore:

- Session cookie stays **`SameSite=Lax; Secure; HttpOnly; Path=/`** — no
  `SameSite=None`, no double-submit token required.
- The `Origin`/`Referer` assertion on state-changing non-auth routes is now in
  place as defence in depth.
- **Requirement to preserve:** keep app and API under one registrable domain. A
  future move to genuinely cross-site hosting invalidates the `Lax` CSRF defence
  and must be accompanied by a CSRF-token scheme and the third-party-cookie
  caveats.
