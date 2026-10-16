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
| F2 | **Medium** | Cross-site session cookie + no CSRF token on state-changing API calls | `lib/api.ts`, `app/(auth)/invites/accept` | Open |
| F3 | **Medium** | `shadcn` CLI shipped as a runtime dependency (9 high audit findings) | `package.json:21`, lockfile | **Fixed** |
| F4 | **Medium** | Invite token carried in the URL query string; no `Referrer-Policy` | `app/(auth)/invites/accept/page.tsx:63` | **Partially fixed** (see 7) |
| F5 | **Low** | `next` redirect guard is string-based, not origin-based | `app/(auth)/sign-in/page.tsx:16` |
| F6 | **Low** | Server-supplied `signInPath` navigated without validation | `app/(auth)/invites/accept/page.tsx:40,156` |
| F7 | **Low** | Avatar `<img src={user.image}>` — unvalidated remote URL | `components/shell/global-bar.tsx:62` |
| F8 | **Low** | `document.cookie` sidebar write lacks `SameSite`/`Secure` | `components/ui/sidebar.tsx:85` |
| F9 | **Info** | Server error strings rendered directly in UI | `lib/spaces.tsx`, invites/members pages |
| F10 | **Info** | No install-script policy; no `middleware.ts` for nonces | repo root |
| F11 | **High** | No lockfile tracked anywhere — installs are non-reproducible | root `.gitignore` |

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

### F6 — Low: server-supplied `signInPath` navigated unvalidated

`app/(auth)/invites/accept/page.tsx:40` reads `body.signInPath` from the API
response and `:156` does `router.push(signInPath)` with no validation. Today the
value is server-controlled and well-behaved, but the client treats a
network-supplied string as a safe internal route. Apply the same `safeNext`
guard client-side and allowlist the path server-side.

### F7 — Low: unvalidated avatar URL rendered into `<img>`

`components/shell/global-bar.tsx:62-70` renders `user.image` directly. `<img>`
will not execute `javascript:`, but an attacker-influenced value can still be an
unexpected remote URL (privacy/tracking, mixed content, and it widens the CSP
`img-src` we must allow in F1). Validate/persist avatar URLs as `https:` only at
ingest (backend), and render with `referrerPolicy="no-referrer"`.

### F8 — Low: sidebar cookie lacks `SameSite`/`Secure`

`components/ui/sidebar.tsx:85` writes `sidebar_state` via `document.cookie`
without `SameSite` or `Secure`. It is non-sensitive UI state (not auth), so this
is hygiene rather than a vuln — but it is the kind of pattern that gets copied
onto a real cookie later. Add `; SameSite=Lax` (and `Secure` in prod).

### F9 — Info: server error strings rendered directly

`lib/spaces.tsx:98`, `app/(app)/orgs/[id]/members/page.tsx:46`, and the invites
page surface either client-constructed status strings or `body.message`/`body.error`
from the API. React escapes them, so this is not XSS; it is an
information-disclosure concern. Rule: the API must keep user-facing `message`
generic and log internals server-side only. Confirm backend error bodies never
carry stack traces/SQL text.

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
2. **F2** decide cookie topology / CSRF (with backend Task 5) — **investigated**, awaiting topology decision (see §7).
3. **F3** move `shadcn` to devDependencies — **DONE** (production graph clean); dev-only advisories deferred (see §7). Install-script policy (F10) and lockfile tracking (F11) remain.
4. **F5/F6** extract and apply one redirect-safety helper.
5. **F7/F8/F9** hardening hygiene + backend error-body review.

## 6. Review checklist status (`security-and-hardening` §Verification, frontend half)

- [x] Security headers present on app responses (F1) — **met** (verified 2026-10-16)
- [ ] No secrets in source/history — **met**
- [x] No `dangerouslySetInnerHTML`/`eval` with untrusted data — **met**
- [ ] All user input validated at the boundary — **met for forms; server is the boundary**
- [ ] Rate limiting backed by shared store (frontend relies on API) — **n/a / backend**
- [ ] Server-side URL fetches validated against allowlist — **n/a (no frontend SSR fetch)**
- [ ] LLM/model output validated — **n/a (no AI features)**
- [~] Dependency audit has no unmitigated reachable critical/high — **production: met (`--omit=dev` = 0); dev/build tooling: deferred (F3, no upstream fix for `braces`)**
- [ ] The authoritative lockfile is committed and CI installs frozen — **not met (F11)**
- [ ] Error responses don't expose internals — **client ok; confirm API bodies (F9)**

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

### 2026-10-16 — F2 investigation (awaiting topology decision)

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

## 8. F2 decision requested

F2's fix depends on one answer: **are the app and API served from the same
registrable domain in production** (e.g. `app.example.com` + `api.example.com`)?

- **Yes (same-site)** → keep `SameSite=Lax`; apply the low-risk hardening (1)+(2)+(3)
  above. No CSRF tokens needed because `Lax` already blocks cross-site writes.
- **No (truly cross-site)** → cookie must be `SameSite=None; Secure`; then (2)
  becomes mandatory and should be a double-submit CSRF token, plus the third-party
  cookie-support caveat documented.
