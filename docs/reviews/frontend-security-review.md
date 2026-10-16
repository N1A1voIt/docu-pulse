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
| F3 | **Medium** | `shadcn` CLI shipped as a runtime dependency (9 high audit findings) | `package.json:21`, lockfile | Open |
| F4 | **Medium** | Invite token carried in the URL query string; no `Referrer-Policy` | `app/(auth)/invites/accept/page.tsx:63` | **Partially fixed** (see 7) |
| F5 | **Low** | `next` redirect guard is string-based, not origin-based | `app/(auth)/sign-in/page.tsx:16` |
| F6 | **Low** | Server-supplied `signInPath` navigated without validation | `app/(auth)/invites/accept/page.tsx:40,156` |
| F7 | **Low** | Avatar `<img src={user.image}>` — unvalidated remote URL | `components/shell/global-bar.tsx:62` |
| F8 | **Low** | `document.cookie` sidebar write lacks `SameSite`/`Secure` | `components/ui/sidebar.tsx:85` |
| F9 | **Info** | Server error strings rendered directly in UI | `lib/spaces.tsx`, invites/members pages |
| F10 | **Info** | No install-script policy; no `middleware.ts` for nonces | repo root |

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

### F10 — Info: supply-chain and header plumbing

- No `.npmrc`/install-script policy is committed; the lockfile records at least
  one package with an install script. Adopt a documented fail-closed policy
  (`ignore-scripts=true` or an explicit allowlist) and verify with a clean
  `npm ci`.
- No `middleware.ts` exists — relevant because nonce-based CSP (F1) is easiest to
  implement there.

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
2. **F2** decide cookie topology / CSRF (with backend Task 5).
3. **F3** move `shadcn` to devDependencies, triage audit, add install-script policy (F10).
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
- [ ] Dependency audit has no unmitigated reachable critical/high — **not met (F3)**
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
