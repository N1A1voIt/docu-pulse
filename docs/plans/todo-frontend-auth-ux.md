# Task List: `frontend-auth-ux`

> Plan: `docs/plans/plan-frontend-auth-ux.md` · Spec: `docs/SPEC-frontend-auth-ux.md`

## Task 1: Hardened auth pages
**Acceptance:** validation, a11y labels, `aria-invalid`, inline errors, disabled submit, redirect-if-session, network-error message
**Verification:** `npm run build` + manual sign-in/up
**Files:** `frontend/app/sign-in/page.tsx`, `frontend/app/sign-up/page.tsx`
**Scope:** S

## Task 2: Session-gated app shell
**Acceptance:** loading/unauth/error/empty/ok states; disabled team CTA with title; sign-out redirects
**Verification:** `npm run build` + manual smoke
**Files:** `frontend/app/page.tsx`
**Scope:** S

## Task 3: Lint gate
**Acceptance:** `npm run lint` exits 0
**Verification:** `npm run lint`
**Files:** frontend
**Scope:** XS

## Task 4: Build gate
**Acceptance:** `npm run build` exits 0, 0 TS errors
**Verification:** `npm run build`
**Files:** frontend
**Scope:** XS

## Task 5: Manual smoke checklist
**Acceptance:** signup -> personal space <=2s; reload keeps session; signout; bad password inline error
**Verification:** manual against dev servers
**Files:** none (record results)
**Scope:** XS

## Task 6: Record verification
**Acceptance:** results captured in idea doc Verification section
**Verification:** human review
**Files:** `docs/ideas/frontend-auth-ux.md`
**Scope:** XS

## Checkpoint A (after Tasks 3-4)
- [x] `npm run lint` green
- [x] `npm run build` green
- [x] Review code diff

## Checkpoint B (after Tasks 5-6)
- [ ] All Success Criteria verified or waived
- [ ] Ready for review
