# Spec: `frontend-auth-ux` - Auth UI for the personal space

> Module: frontend consumer of `identity` + `organizations`. Source idea: `docs/ideas/frontend-auth-ux.md`
> Depends on: `identity` (Fastify + Better Auth), `organizations` (list endpoint)

## Objective
Deliver a production-grade auth UI that proves the auto-personal-space motion: sign up -> session -> read-only listing of the auto-provisioned personal org. Harden sign-in/sign-up (validation, a11y, loading, inline errors, redirect) and provide an honest entry point for team creation that stays disabled until billing exists.

**User:** anonymous visitor becoming an authenticated personal-space owner.
**Success:** a fresh signup sees "Personal space" (or its empty-state) within 2 seconds of submitting `/sign-up`.

## Tech Stack
- Next.js 16 (App Router), React 19, TypeScript 5
- Tailwind CSS 4, shadcn/Base UI components
- better-auth client (`createAuthClient`) talking to Fastify backend 3001
- pnpm/npm; no new runtime deps beyond `better-auth`

## Commands
- Dev: `npm run dev` (frontend 3000) + backend `npm run dev` (3001)
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `tsc --noEmit` (via build)

Backend env required: `NEXT_PUBLIC_API_URL` (default http://localhost:3001), backend `CLIENT_ORIGIN=http://localhost:3000`.

## Project Structure
```
frontend/
  app/
    page.tsx          -> session-gated app shell (loading/unauth/error/ok)
    sign-in/page.tsx  -> hardened sign-in
    sign-up/page.tsx  -> hardened sign-up
  lib/
    auth-client.ts    -> better-auth client
    api.ts            -> fetch helper with credentials
docs/ideas/frontend-auth-ux.md -> rationale
```

## Code Style
- Client components use `"use client"`; pages co-locate with route.
- Tailwind utility classes; no inline styles.
- Form inputs wrapped in `<label>` with `aria-invalid` on validation failure.
- Inline validation appears after first keystroke in a field.
- Errors surfaced via `role="alert"`; network failures mention backend reachability.

## Testing Strategy
- **Unit/lint/build:** `npm run build` (TypeScript + route generation) is the gate; `npm run lint`.
- **Manual smoke:** sign-up -> lands on `/` -> sees "Personal space" -> reload keeps session -> sign-out -> redirect to `/sign-in`; wrong password shows inline error.
- **Backend gate:** `npm test` (19/19) must stay green (auth smoke proves personal org auto-creation).
- No Playwright/E2E harness yet - manual checklist only. Adding E2E is iteration 2.

## Boundaries
- **Always:** run `npm run build` and `npm run lint` before merging; keep cookies `credentials: "include"`; never store tokens in localStorage.
- **Ask first:** adding shadcn components beyond what's needed, new dependencies, changing routes.
- **Never:** ship a "Create team" button that calls a non-existent route; store session in localStorage; skip a11y attributes.

## Success Criteria
1. `npm run build` succeeds with 0 TypeScript errors.
2. Manual smoke: fresh signup shows org card <=2s after submit.
3. Session persists across full page reload.
4. Sign-out clears session and redirects to `/sign-in`.
5. Invalid credentials show inline `role="alert"` error without console exceptions.
6. Team-creation CTA is disabled with explanation referencing billing, not a dead click.
7. `npm run lint` passes.

## Out of Scope (Not Doing)
Settings, team creation UI, billing/upgrade, OAuth/social login, sidebar beyond top bar, E2E harness - see `docs/ideas/frontend-auth-ux.md`.

## Open Questions
1. When `billing` lands, should "Create team" be hidden or owner-only internal beta?
2. Should `domainUserId` live on the Better Auth user to avoid the `/api/organizations` email lookup?
