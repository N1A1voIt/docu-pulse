# Implementation Plan: `security-hardening` — Auth & backend security follow-ups

> Extends: `identity` (Fastify + Better Auth) and `auth-social-parity`
> Task list: `docs/plans/todo-security-hardening.md`
> Scoped filenames (canonical `docs/plans/plan.md`/`todo.md` remain the completed `schema` module).

## Overview

Harden the DocuPulse Fastify backend and auth flows for production traffic: add throttling to auth endpoints, make CORS respect the full trusted-origin list, ensure production security attributes are correct behind TLS/proxies, verify Better Auth cookie defaults, and document dependency/privacy follow-ups. No DB migration or schema changes.

## Architecture Decisions

- **No secrets in code.** All config comes from `env`/`process.env`; placeholders live in `backend/.env.example`.
- **Defense in depth on `/api/auth/*`.** Better Auth remains the authority; Fastify adds edge-level throttling and security headers without duplicating auth logic.
- **Origin trust stays explicit.** No wildcard origins with credentials; the full `TRUSTED_ORIGINS` list (default client origin) is the only source.
- **Choose a shared limiter before scaling.** In-memory counters are acceptable for a single node in dev; production with multiple instances requires a shared store (Redis/Postgres), addressed as a checkpoint.
- **Privacy is a follow-up, not a silent default.** Data retention/deletion/export is documented as an open item until legal/product defines requirements.
- **No new dep without approval.** `@fastify/rate-limit` (or comparable) is proposed but not yet installed.

## Dependency Graph

```
Task 1 (rate-limit design choice) ──► Task 2 (implement throttling) ──► Checkpoint A
Task 3 (CORS multi-origin) ───────────────────────────────────────────► Checkpoint A
Task 4 (proxy-aware HSTS/headers) ───────────────────────────────────► Checkpoint A
Task 5 (session cookie verification) depends on Task 4 (needs HTTPS endpoint)
Task 6 (dependency audit triage) independent
Task 7 (privacy/data-retention spec) independent
```

Frontend unaffected beyond integration tests.

## Task List (index)

### Phase 1 — Backend edge hardening
- [x] Task 1: Decide and document rate-limit strategy (in-memory vs shared store; dependency approval)
- [x] Task 2: Implement auth-endpoint throttling + tests
- [x] Task 3: Make CORS origin an explicit allowlist (full `TRUSTED_ORIGINS`)
- [x] Task 4: Make security headers proxy/TLS-aware (HSTS, CSP considerations)

### Checkpoint A (after Task 4)
- [x] `npm run typecheck` green
- [x] `npm test` green
- [x] Manual burst test shows 429 on `/api/auth/*`
- [ ] Review with human before cookie/dependency work

### Phase 2 — Verification & supply chain
- [ ] Task 5: Verify Better Auth session cookie attributes in dev + prod-like HTTPS
- [ ] Task 6: Dependency audit triage and documentation (no forced remediation)
- [ ] Task 7: Document privacy/data-subject requirements and gaps

### Checkpoint B (complete)
- [ ] All tasks verified
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limiter in-memory resets on restart / multi-node ineffective | Med | Document shared-store requirement; gate behind env threshold |
| Burst testing could block legitimate dev traffic | Low | Configurable limits; dev higher limits |
| CORS multi-origin change accidentally wildcard | High | Unit test asserting exact allowlist; never `*` with credentials |
| HSTS lock-in on mixed HTTP dev | Med | Only emit when public URL is HTTPS |
| Dep audit forced upgrade may break build | Med | Preview, changelog review, per-package PRs |
| Privacy ambiguity legal risk | High | Separate spec required before implementation |

## Open Questions (need human input)
1. Approve `@fastify/rate-limit` (or provide Redis) for production.
2. Target rate-limit thresholds per environment.
3. Whether to add a minimal CSP for API responses or leave to frontend/CDN.
4. Scope of privacy work (retention, deletion, export) and jurisdiction requirements.
EOF
---

## Phase 1 implementation notes (completed)

- Rate limiter: `@fastify/rate-limit` approved and installed.
- Auth endpoints (`/api/auth/*`) use `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` (dev default 100/15min, prod 10/15min).
- General API uses higher defaults (`RATE_LIMIT_API_MAX` / `RATE_LIMIT_API_WINDOW_MS`, dev 1000/1min, prod 300/1min).
- In-memory store only; production multi-instance requires a shared store (Redis) — dependency not yet approved.
- CORS origin is the full `TRUSTED_ORIGINS` list; no wildcard with credentials.
- HSTS is emitted when the request is effectively HTTPS (`request.protocol`, `X-Forwarded-Proto` behind a trusted proxy, or `BETTER_AUTH_URL` https). No API CSP added (left to frontend/CDN).
- `TRUST_PROXY` config controls Fastify trust-proxy behavior for client IP / forwarded headers.
