# Implementation Plan: app-shell-ux (Persistent App Shell — Rail + Global Bar)

> Spec: `docs/SPEC-app-shell-ux.md` · Idea: `docs/ideas/app-shell-ux.md`
> Task list: `docs/plans/todo-app-shell-ux.md`
> Project convention: all generated documents live under `docs/` (deviates from skill default `tasks/`).
> Status: **draft — pending human approval (Phase 1, planning-and-task-breakdown)**

## Overview

Give DocuPulse an app-wide workspace shell so the product reads as a real product at its
current scale (one user, one personal space, no documents, no teammates): a route-derived
**rail** for moving *between* spaces and an app-wide **global bar** for acting *anywhere*.
Neither owns the active space — both read it from the route. No "current space" is persisted
anywhere.

The slice delivers: a route-group restructure (`(app)` / `(auth)`) that keeps every URL
unchanged, one additive backend contract (`planName` + `role` on `GET /api/organizations`),
a rail with a space switcher + role badge + entitlement-locked `Documents` row, a global bar
with a `DocuPulse › {Space}` breadcrumb, a ⌘K palette, a truthful plan chip, and a single
sign-out in an avatar menu, plus real `/members`, `/invites`, `/settings` routes split out of
today's single org page.

Success is defined by the 10 criteria in the spec. This plan decomposes them into 15
verifiable tasks across 5 phases, with content/gates that already exist reused rather than
rebuilt (`Skeleton`, `Alert`, retry, the create-team dialog, the login/signup pages).

## Architecture Decisions

- **Route groups, not URL changes.** `app/(app)/` holds the shell-wrapped product surface;
  `app/(auth)/` holds the bare auth pages. Groups are excluded from the path
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`),
  so `/`, `/orgs/[id]`, `/sign-in`, `/sign-up`, `/invites/accept` keep their URLs.
- **Route groups first** (idea decision 7): the isolated, verifiable restructure lands before
  any shell exists, so a typed-route regression is caught by a build with nothing else moving.
- **The route is the only owner of "where am I."** `SpaceProvider` derives `activeSpace` from
  the route; it is never written to localStorage, a cookie, or the DB. `SidebarProvider`'s
  `sidebar_state` cookie is collapse state (chrome), not space context — allowed.
  - **Deviation from the spec sketch (2026-10-15, during Task 4):** the active space is derived
    from `usePathname()`, not `useParams()`. `useParams()` returns the params of *its own*
    segment, and the shell chrome lives in `app/(app)/layout.tsx` — **above** `[id]` — where it
    returns `{}`. The spec's `useParams<{ id?: string }>()` would have silently produced
    `activeSpace === null` on every space route. The pathname is unambiguous at any depth.
  - **Consequence (Task 5):** with `cacheComponents: true`, both `usePathname` and `useParams`
    suspend for `/orgs/[id]` (no `generateStaticParams`), and the Next docs call out this exact
    case ("a sidebar with active links rendered in a layout suspends on any page below it that
    has an unknown dynamic param"). The shell chrome must therefore render inside a `Suspense`
    boundary, or the build fails.
- **One fetch answers four questions.** Extend `listOrganizationsForUser` to return
  `OrganizationForUser` (`planName`, `role`) via `LEFT JOIN plans` + `LEFT JOIN role`, so the
  rail, switcher badge, plan chip, and `canManage` all read one response. Additive and
  back-compatible; `getOrganizationById`/create paths stay `Organization`.
- **Entitlement display mirrors, never enforces.** `documentsUnlocked` is a display mirror of
  `backend/src/entitlements/canInvite.ts:11–15` (`!isPersonal && planName === "Org"`); the
  server stays the enforcement point. No upgrade/billing CTA is ever rendered (billing does
  not exist, so a CTA is a dead click).
- **One dialog, two entry points.** The create-team dialog is mounted once in the shell and
  opened from the switcher footer and the Home empty state.
- **The `sidebar` primitive is pruned to the shell's actual surface (2026-10-15, review feedback:
  "sidebar code is way too long").** The registry item ships 24 exports / 727 lines — a full
  responsive + collapsible + tooltip primitive with submenus, inline actions, badges, an input,
  a drag-resize rail, and a skeleton. Our rail is a flat list of 5 items, so 9 unused exports
  were deleted: **727 → 508 lines (−219)**, with **zero insertions** (retained code is
  byte-identical; verified via `git diff --numstat` + lint + build). Diverges from the registry
  by design — `shadcn add sidebar --overwrite` would clobber it, which we accept.
  - Kept: `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`,
    `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`,
    `SidebarMenuButton` (+ internal `sidebarMenuButtonVariants`), `SidebarSeparator`,
    `SidebarInset`, `SidebarTrigger`, `useSidebar`.
  - The keep-list is **spec-derived**, not usage-derived (nothing imported the file when pruned).
    Re-confirm it against real imports after Task 6; re-add an export if the rail needs one.
- **Honest failure and bare auth.** Unknown/foreign space ids resolve to a "Space not found"
  `Alert` (never another org's name); unauthenticated `/` renders its existing landing with
  chrome suppressed.

## Task List

### Phase 1: Foundation

- [ ] Task 1: Add `planName` + `role` to the organizations list contract (`OrganizationForUser`) + backend test
- [ ] Task 2: Restructure routes into `(app)` / `(auth)` groups (URLs unchanged)
- [ ] Task 3: Add the shadcn `sidebar` component set and repair its `IconPlaceholder` import
- [ ] Task 4: Build `SpaceProvider` + `useSpaces()` in `lib/spaces.tsx` (route-derived active space)

### Checkpoint: Foundation
- [ ] `npm run build` succeeds with 0 TypeScript errors after the route-group move
- [ ] `npm run lint` passes
- [ ] `npm test` (backend) green including the new `OrganizationForUser` case
- [ ] All five product URLs and all three auth URLs still resolve as before
- [ ] Review with human before building the shell

### Phase 2: Shell Scaffold

- [ ] Task 5: `(app)/layout.tsx` shell scaffold — provider wiring + unauthenticated chrome suppression
- [ ] Task 6: Rail — switcher with role badge + space-scoped nav + locked `Documents` row
- [ ] Task 7: Global bar — breadcrumb chip, plan chip, avatar menu (single sign-out)
- [ ] Task 8: `orgs/[id]/layout.tsx` — resolve the active space, honest "Space not found"

### Checkpoint: Shell Scaffold
- [ ] `/`, `/orgs/[id]` render inside rail + bar; `/sign-in`, `/sign-up`, `/invites/accept` do not
- [ ] Breadcrumb names the space on space routes and `DocuPulse` alone on `/`
- [ ] Plan chip reads `Free` on a personal space and `Org` on a team space
- [ ] Signed-out `/` still renders the landing

### Phase 3: Routes and Landing

- [ ] Task 9: Split `/orgs/[id]/members` and `/orgs/[id]/invites` out of the single org page
- [ ] Task 10: Add `/orgs/[id]` Overview and `/orgs/[id]/settings`; replace the email-matching `canManage`
- [ ] Task 11: Home `/` unscoped landing + create-team dialog mounted once in the shell

### Checkpoint: Routes and Landing
- [ ] Every rail item navigates to a real route; `Documents` stays the only locked row
- [ ] `/orgs/[id]/members`, `/invites`, `/settings` render with existing `Skeleton`/`Alert`/retry preserved
- [ ] `canManage` is driven by `role`, not email matching
- [ ] End-to-end create-team → land in space → rail/bar follow

### Phase 4: Palette

- [ ] Task 12: ⌘K command palette (Home, every space, active space's sections, create-team)

### Checkpoint: Palette
- [ ] ⌘K opens, navigates a space / member / settings, Esc closes, focus restores
- [ ] Palette reads already-loaded data only (no backend search, no documents)

### Phase 5: Verification

- [ ] Task 13: Frontend build + lint gate across all routes
- [ ] Task 14: Run the 8-check manual smoke checklist
- [ ] Task 15: Final review against success criteria 1–10; record follow-up gaps

### Checkpoint: Complete
- [ ] All 10 success criteria verified or gap recorded
- [ ] No upgrade CTA, no persisted space state, no decorative chrome
- [ ] Ready for human review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Route-group move breaks typed routes (`LayoutProps<"/">`, `.next/types/routes.d.ts`) | High | Do it first (Task 2), isolated; gate on `npm run build`; keep `LayoutProps<"/">` in the root layout |
| `shadcn add sidebar` leaves shadcn-internal imports (`@/registry/...`, `@/app/(create)/components/icon-placeholder`) | High | Task 3 greps for both patterns and replaces `IconPlaceholder` with `SidebarLeftIcon` (confirmed present in `@hugeicons/core-free-icons`) |
| `use-mobile` lands at `@/hooks/use-mobile.ts` (alias `hooks: @/hooks`), not `lib/` as the spec sketch says | Low | Follow the CLI's actual output; note the deviation, do not hand-move it |
| `useParams<{ id?: string }>()` friction under typed routes | Medium | Read the generated types; fall back to an untyped string read (`String(params?.id ?? "")`) as the current org page already does |
| Duplicate `/api/organizations` fetches (shell + pages) drift | Medium | Pages consume `useSpaces()` from Task 4 instead of refetching; one source of truth |
| Removing the two duplicated sign-out buttons regresses the redirect | Medium | Keep `authClient.signOut()` + `window.location.replace("/sign-in")` behavior in the avatar menu; smoke check 10 |
| Chrome flashes before session resolves on unauth `/` | Medium | Suppress rail/bar until the session branch is known; verify the landing renders bare |
| `@base-ui/react/autocomplete` API differs from training data | Medium | Read `frontend/node_modules/` docs + base-maia registry before writing Task 12 |
| `cacheComponents` / `partialPrefetching` interact with a client shell | Low | Shell stays a client component reading `useParams`/`usePathname`; anything using `useSearchParams` stays inside `Suspense` |

## Open Questions

Resolved during plan approval (human-review gate):

1. **Plan approved as written.** 15 tasks / 5 phases, `docs/plans/` location, route-groups-first
   ordering.
2. **Route split confirmed:** `/orgs/[id]` is the space **Overview**; **Settings splits out now**
   as `/orgs/[id]/settings` (Task 10), matching rail nav and success criterion 2.
3. **`docs/CAPABILITY-MAP.md` stays untouched** (no new module id; same precedent as
   `SPEC-org-team-invites.md`). Ask-first boundary not exercised.

Still open (carry into implementation):

4. **Palette go/no-go:** the spec keeps "⌘K earns its place at this volume" as a validated
   assumption; confirm at the Phase 4 checkpoint whether it stays in scope rather than being cut.
5. **Manual smoke ownership:** no E2E harness exists; the human runs the 8-check checklist in a
   browser (Task 14) before the plan is marked complete.

## Boundaries (carried from the spec)

- **Always:** `npm run build` + `npm run lint` (frontend) and `npm test` + `npm run typecheck`
  (backend) before merging; derive the active space from the route; keep `credentials: "include"`;
  preserve `Skeleton`/`Alert`/retry; read `frontend/node_modules/next/dist/docs/` before Next code.
- **Ask first:** adding shadcn components / any dependency; changing any URL; adding anything to
  `/api/organizations` beyond `planName` + `role`; adding a frontend test runner; a CAPABILITY-MAP row.
- **Never:** persist a "current space"; render an upgrade/billing CTA; render placeholder rows,
  a notification bell, or a help menu; render a locked row as a working link; show another org's
  name to a non-member; define new color tokens when `--sidebar-*` exists.

## Parallelization Opportunities

- Task 1 (backend) and Task 2 (route groups) are independent and can run in parallel.
- Task 3 (`shadcn add sidebar`) can run alongside Task 1.
- Tasks 3 and 4 must finish before Task 5; Tasks 5–8 are sequential (shared shell layout).
- Tasks 9–11 depend on the shell scaffold (Phase 2) and can be parallelized once Task 8 lands.
- Task 12 (palette) is independent of Tasks 9–11.
- Backend gate (in Checkpoint 1) can run while the shell scaffold is built.
