# Task List: `security-hardening` — Auth & backend security follow-ups

> Plan: `docs/plans/plan-security-hardening.md`
> Run backend commands from `backend/`; frontend commands from `frontend/`.

## Task 1: Decide and document rate-limit strategy

**Description:** Select an auth-endpoint throttling approach and record limits/dependencies before implementation. Prefer shared store in prod; in-memory only for single-instance/dev.

**Acceptance criteria:**
- [x] Document chosen plugin/store and env knobs (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`).
- [x] Human approves any new dependency (ask before installing).
- [x] Dev/prod thresholds defined (prod ~10/15 min auth; higher for general API).

**Verification:**
- [x] Plan update reviewed.

**Dependencies:** None

**Files likely touched:**
- `docs/plans/plan-security-hardening.md`
- `backend/.env.example`

**Estimated scope:** XS

---

## Task 2: Implement auth-endpoint throttling

**Description:** Add throttling scoped to `/api/auth/*` with appropriate limits and shared-store option. Add focused tests (429 under burst).

**Acceptance criteria:**
- [x] `/api/auth/*` limited; over-limit requests get 429 with `Retry-After`.
- [x] General endpoints remain reasonably limited but not blocked by auth limits.
- [x] Env override works.
- [x] Tests pass.

**Verification:**
- [x] `npm run typecheck && npm test` (backend) green.
- [x] Manual burst test (`curl`/script) confirms 429.

**Dependencies:** Task 1

**Files likely touched:**
- `backend/src/server.ts`
- `backend/src/config/env.ts`
- `backend/.env.example`
- `backend/tests/*.test.ts`

**Estimated scope:** S

---

## Task 3: Make CORS an explicit allowlist

**Description:** Derive CORS origin handling from the full `TRUSTED_ORIGINS` list, deny any unlisted origin, never `*` with credentials.

**Acceptance criteria:**
- [x] Multiple origins supported if configured.
- [x] Single origin still works (default).
- [x] Unlisted origin rejected.
- [x] Credential behavior unchanged.

**Verification:**
- [x] Unit/integration tests for allowed/disallowed origins.
- [x] `npm run typecheck && npm test` (backend) green.

**Dependencies:** None (parallel)

**Files likely touched:**
- `backend/src/server.ts`
- `backend/src/config/env.ts`
- `backend/tests/*.test.ts`

**Estimated scope:** S

---

## Task 4: Make security headers proxy/TLS-aware

**Description:** Ensure HSTS/CSP/headers are appropriate behind TLS termination and document any remaining frontend/CDN CSP responsibilities.

**Acceptance criteria:**
- [x] HSTS emitted only when effectively HTTPS.
- [x] API-friendly headers retained.
- [x] No breakage of OAuth redirects/cookies.

**Verification:**
- [x] `npm run typecheck && npm test` (backend) green.
- [x] Manual check via devtools/curl.

**Dependencies:** Tasks 2–3 (optional; can run parallel)

**Files likely touched:**
- `backend/src/server.ts`

**Estimated scope:** XS

---

## Task 5: Verify session cookie attributes

**Description:** Inspect Better Auth cookie behavior in dev and a production-like HTTPS setup; document required env/settings.

**Acceptance criteria:**
- [ ] Confirmed `httpOnly`, `Secure` in prod, `SameSite`.
- [ ] Documented any config needed if Better Auth defaults differ.

**Verification:**
- [ ] Manual dev check + prod-like check (or documented blocker).

**Dependencies:** Task 4

**Files likely touched:**
- `docs/plans/todo-security-hardening.md`
- `docs/plans/plan-security-hardening.md`

**Estimated scope:** XS

---

## Task 6: Dependency audit triage

**Description:** Run the native audits against committed lockfiles, classify by reachability, document deferrals with review dates. No `--force` unless reviewed package-by-package.

**Acceptance criteria:**
- [ ] Backend audit findings triaged (vitest/tinypool).
- [ ] Frontend audit findings triaged (shadcn/ts-morph/fast-glob).
- [ ] Deferrals documented.

**Verification:**
- [ ] `npm audit` output saved/summarized in docs.
- [ ] Build/tests still green.

**Dependencies:** None

**Files likely touched:**
- `docs/plans/todo-security-hardening.md`

**Estimated scope:** S

---

## Task 7: Privacy/data-subject requirements

**Description:** Define retention, deletion, and export requirements for personal data before launch. Not implement until scope approved.

**Acceptance criteria:**
- [ ] Written requirements doc.
- [ ] Gap list vs current capabilities.

**Verification:**
- [ ] Reviewed by human.

**Dependencies:** None

**Files likely touched:**
- `docs/plans/todo-security-hardening.md`

**Estimated scope:** XS

---

## Checkpoint A (after Tasks 1–4)
- [ ] `npm run typecheck && npm test` (backend) green
- [ ] 429 under burst
- [ ] CORS allowlist behavior verified
- [ ] Headers verified
- [ ] Review with human before cookie/dependency/privacy work

## Checkpoint B (complete)
- [ ] All tasks verified
- [ ] Ready for review