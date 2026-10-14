# Implementation Plan: `frontend-auth-ux`

> Spec: `docs/SPEC-frontend-auth-ux.md` · Idea: `docs/ideas/frontend-auth-ux.md`
> Task list: `docs/plans/todo-frontend-auth-ux.md`
> Note: canonical `docs/plans/plan.md`/`todo.md` remain the completed `schema` module; this module uses scoped filenames per the earlier project decision.

## Overview
Harden the Next.js auth UX so a fresh signup lands on a personal space, with loading/error/empty states and an honest disabled team entry point. Implementation largely already landed; this plan tracks the remaining hardening and verification gates.

## Architecture Decisions
- Keep Better Auth client in-browser with `credentials: "include"`; no SSR session proxy for MVP.
- Read-only org context only; team creation stays disabled (no backend route yet).
- Backend gate: 19/19 tests including `auth.smoke.test.ts` proves auto-personal-org.
- Product gate: `npm run build` + `npm run lint` + manual smoke checklist.

## Dependency Graph
```
backend gate (existing) ─► frontend build/lint ─► manual smoke ─► review
```

## Task List

### Phase 1 — Build & lint gates
- [x] Task 1: Hardened auth pages (`sign-in`, `sign-up`) — validation, a11y, loading, inline errors, redirect
- [x] Task 2: Session-gated app shell (`/`) — loading/unauth/error/empty/ok states + disabled team CTA
- [x] Task 3: `npm run lint` clean (run and fix any issues)
- [x] Task 4: `npm run build` clean (run and fix any issues)

### Checkpoint A (after Tasks 3–4)
- [x] Lint + build green
- [x] Review code diff

### Phase 2 — End-to-end smoke
- [ ] Task 5: Manual smoke checklist against running backend (signup -> personal space -> reload -> signout -> bad password)
- [ ] Task 6: Record results in `docs/ideas/frontend-auth-ux.md` verification section

### Checkpoint B (complete)
- [ ] All success criteria in SPEC verified or explicitly waived
- [ ] Ready for review

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Manual-only verification | Med | Backend auth smoke already automates personal-org proof |
| Next static export may hide runtime errors | Med | Manual smoke required before merge |
| Cookies across origins | Med | CORS + credentials configured; verify in smoke |

## Open Questions
- Move from manual smoke to Playwright in iteration 2?
