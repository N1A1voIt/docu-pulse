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

- [x] Task 5: `(app)/layout.tsx` shell scaffold — provider wiring + unauthenticated chrome suppression
- [x] Task 6: Rail — switcher with role badge + space-scoped nav + locked `Documents` row
- [x] Task 7: Global bar — breadcrumb chip, plan chip, avatar menu (single sign-out)
- [x] Task 8: `orgs/[id]/layout.tsx` — resolve the active space, honest "Space not found"

### Checkpoint: Shell Scaffold
- [x] `/`, `/orgs/[id]` render inside rail + bar; `/sign-in`, `/sign-up`, `/invites/accept` do not
- [x] Breadcrumb names the space on space routes and `DocuPulse` alone on `/`
- [x] Plan chip reads `Free` on a personal space and `Org` on a team space
- [x] Signed-out `/` still renders the landing

#### Phase 2 implementation notes (2026-10-15)

Browser smoke is deferred to Task 14 (no E2E harness); items above are verified by
`npm run build` + `npm run lint` and by code inspection.

1. **Content wrapper is a plain `<div>`, not `SidebarInset`.** `SidebarInset` renders
   `<main>`, and the pages still own their own `<main>` until the Phase 3 route split — two
   nested `<main>`s is invalid HTML. `SidebarInset` stays exported but unused; re-evaluate in
   Phase 3 once pages drop their own `<main>`.
2. **`dropdown-menu` added** via `shadcn add dropdown-menu` (ask-first approved this session).
   Wraps `@base-ui/react/menu`; no new npm dependency.
3. **Create-team footer deferred to Task 11.** `SpaceSwitcher` already accepts an optional
   `onCreateSpace`; without it no footer entry renders, so no dead click ships in the meantime.
4. **⌘K trigger deferred to Task 12.** `global-bar.tsx` gains it when the palette exists.
5. **`Documents` never navigates this iteration.** Entitlement (`documentsUnlocked`) only
   changes its *appearance*: locked → `aria-disabled` + lock + reason; unlocked → a plain
   non-link row. The feature does not exist, so neither state is a working link (plan Task 6).
6. **In-page `OrgSwitcher` removed** from `orgs/[id]/page.tsx` — the rail owns switching now;
   leaving both would show two switchers at once.
7. **`usePathname` suspension handled twice** under `cacheComponents`: the shell chrome sits in
   a `Suspense` boundary in `(app)/layout.tsx`, and the space gate in `orgs/[id]/layout.tsx`
   sits in its own `Suspense`.

### Phase 3: Routes and Landing

- [x] Task 9: Split `/orgs/[id]/members` and `/orgs/[id]/invites` out of the single org page
- [x] Task 10: Add `/orgs/[id]` Overview and `/orgs/[id]/settings`; replace the email-matching `canManage`
- [x] Task 11: Home `/` unscoped landing + create-team dialog mounted once in the shell

### Checkpoint: Routes and Landing
- [x] Every rail item navigates to a real route; `Documents` stays the only locked row
- [x] `/orgs/[id]/members`, `/invites`, `/settings` render with existing `Skeleton`/`Alert`/retry preserved
- [x] `canManage` is driven by `role`, not email matching
- [ ] End-to-end create-team → land in space → rail/bar follow — deferred to Task 14 (browser)

#### Phase 3 implementation notes (2026-10-15)

1. **No backend change was required.** `planName` + `role` from Task 1 already carry
   everything the split routes need, so the backend contract is untouched (as the skill's
   interface-design rules require). `npm run typecheck` is the backend gate this phase; the
   DB-backed `npm test` schema suite needs `DATABASE_URL_TEST` exported and resets a schema,
   so it was not run against the shared dev database (no backend code changed).
2. **Load results are tagged with the space id** on Members and Invites, and the fetch runs
   after `await` (never synchronously in an effect) — this both satisfies the
   `react-hooks/set-state-in-effect` rule and prevents stale rows when switching spaces.
3. **`/orgs/[id]` is the Overview** (name/slug/type + plan + role). **Settings is read-only**:
   the backend exposes no organization update endpoint, so it states that editing isn't
   available yet rather than rendering controls that lead nowhere (no dead buttons).
4. **`canManage` is role-driven** (`owner`/`admin`) from the single `/api/organizations`
   response; the email-matching hack is removed. `SpaceSwitcher` now shares the exported
   `roleLabel` helper instead of its own map.
5. **Home consumes the shell's data** (`useSpaces()`, no second fetch) and the create-team
   dialog is mounted once in `(app)/layout.tsx`, opened from both the switcher footer and the
   Home empty state. `SpaceProvider.createSpace()` posts, refreshes the list before
   navigation, and returns the id — one source of truth for spaces, no full-reload chrome flash.
6. **`SidebarInset` re-evaluated and still unused.** Every page owns its own `<main>`, and
   `SidebarInset` renders a `<main>`, so wrapping would nest two landmarks. The shell keeps its
   plain `<div>`; the comment in `(app)/layout.tsx` was updated to say so.
7. **Invite action is entitlement-gated (fixed in review).** An independent five-axis review
   (`code-review-and-quality`) found that a personal / non-`Org` space (where the viewer is
   `owner`) rendered an "Invite member" button that `backend/src/entitlements/canInvite.ts`
   would refuse. The button is now gated on `canManage && documentsUnlocked` — the same
   `!isPersonal && plan_name === "Org"` mirror already used for `Documents` — and shows a
   short reason when a manager lacks the entitlement. `Revoke` is hidden from non-managers
   too (the backend requires owner/admin). The same review hardened `createSpace`: if the
   post-create refresh fails, it now `reload()`s so the space gate re-resolves instead of
   reporting the just-created space as "not found".
8. **Review follow-ups (not blocking).** The same review flagged, deliberately deferred:
   the hand-rolled create/invite dialogs set `role="dialog" aria-modal="true"` without a
   focus trap or focus restore (reuse the base-ui dialog primitive in a later slice); the
   shell renders bare — no rail/bar — while `status === "loading"` on a hard reload, causing a
   layout shift; the space gate's error branch offers no retry; and Members/Invites share a
   near-identical load scaffold that could become a `useSpaceResource` hook if a third space
   resource appears. `frontend/components/org-switcher.tsx` is dead code (no importers) left
   from the pre-shell page — remove it once confirmed.

### Phase 4: Palette

- [x] Task 12: ⌘K command palette (Home, every space, active space's sections, create-team)

### Checkpoint: Palette
- [ ] ⌘K opens, navigates a space / member / settings, Esc closes, focus restores
- [x] Palette reads already-loaded data only (no backend search, no documents)

#### Phase 4 implementation notes (2026-10-16)

1. **No backend change was required.** The palette reads only `useSpaces()` and
   `useActiveSpace()` — Home, the user's spaces, the active space's sections and the
   create-team action. The `/api/organizations` contract is untouched
   (`api-and-interface-design`: negotiate nothing that isn't needed). `npm run typecheck`
   is the backend gate this phase; the DB-backed suite was not run (no backend code changed).
2. **`@base-ui/react/autocomplete` + `dialog`, per the plan.** `Autocomplete.Root inline open`
   plus a `Dialog` give combobox semantics (`role="combobox"`/`aria-activedescendant` on the
   input, `role="option"` rows), focus trap, Esc-to-close and focus restore without
   hand-rolled ARIA. Navigation rows render as real `<Link>`s, so Enter and click both
   navigate and the palette can never dead-end.
3. **Go/no-go: kept.** With the shell's spaces plus the active space's four sections plus
   create-team, the palette navigates more than it decorates (spec assumption validated).
   It stays in scope for Task 13–15 rather than being cut.
4. **Focus restore uses the Base UI default, not an explicit `finalFocus` ref (review fix).**
   The `FloatingFocusManager` treats an explicit element ref as `hasExplicitReturnFocus` and
   focuses it unconditionally on close (`floating-ui-react/components/FloatingFocusManager.js:530–544`).
   An explicit `finalFocus={triggerRef}` would therefore steal focus back from the create-team
   dialog that the create-team action had just opened. The default (`returnFocus: true`)
   restores focus to the trigger only when focus is still inside the palette, which is exactly
   the desired behavior: Esc/⌘K/backdrop return to the trigger, while "Create team space"
   leaves focus in the create dialog.
5. **No stacked modals.** `CreateSpaceContextValue` gained an additive `isOpen`; the ⌘K handler
   stands down while the create-team dialog is open, so two `aria-modal` layers can never be
   open at once (which would let a single Esc close both).
6. **Accessibility hardening from review:** the trigger keeps an `aria-label` when its text is
   hidden at narrow widths; a visible close button replaces the sr-only one; the input is
   `aria-describedby`-linked to the keyboard-shortcut legend; `event.repeat` is ignored;
   the help footer wraps and the dialog viewport scrolls on very short screens.
7. **Runtime focus/ARIA and the create-team transition remain browser checks** (Task 14);
   this phase's automated evidence is `npm run build` + `npm run lint` (both green, all 8
   routes build). An independent five-axis review found no blockers and produced fix 4–6.

### Phase 5: Verification

- [x] Task 13: Frontend build + lint gate across all routes
- [ ] Task 14: Run the 8-check manual smoke checklist — human-owned; see notes
- [x] Task 15: Final review against success criteria 1–10; record follow-up gaps

### Checkpoint: Complete
- [x] All 10 success criteria verified or gap recorded
- [x] No upgrade CTA, no persisted space state, no decorative chrome
- [x] Ready for human review

#### Phase 5 implementation notes (2026-10-16)

1. **Gates green; the two human-owned checks are deferred.** `npm run build` (all 8
   routes), `npm run lint`, and backend `npm run typecheck` pass. `npm test` was **not**
   run: `DATABASE_URL_TEST` resolves to the same `localhost:5432/docupulse` database as
   `DATABASE_URL`, and `resetSchema()` drops every table before re-migrating, so it is
   destructive to the shared dev DB (2 users / 2 orgs). The `OrganizationForUser` case is
   unchanged from Task 1, where it passed. The 8-check browser smoke stays with the human
   (no E2E harness; adding one is ask-first). Both are recorded under "Follow-up gaps".
2. **Review hardening (frontend, `frontend-ui-engineering`).** The independent Phase 3
   review's three deferred accessibility/UX items in plan note 8 were fixed this phase:
   - A shared `frontend/components/ui/modal.tsx` built on Base UI's `Dialog` now backs
     both the create-team and invite dialogs. The hand-rolled overlays declared
     `role="dialog" aria-modal="true"` but trapped no focus and restored none; the
     primitive supplies the trap, Esc/backdrop dismissal, page-scroll lock, focus
     restore, and (per its docs) the close control touch screen readers need. `Cancel`
     and the new visible close button both route through the same open state.
   - The space gate's `status: "error"` branch now renders a `Retry` button wired to
     `useSpaces().reload()`, matching the `Skeleton`/`Alert`/retry the Members and
     Invites routes already preserve, instead of only telling the user to go Home.
3. **No backend change (`api-and-interface-design`).** The Task 1 contract
   (`planName` + `role` on `GET /api/organizations`) already answers every question the
   shell asks; verification surfaced nothing to add, so the endpoint is untouched.
4. **Success criteria coverage.** Verified by gate or inspection: 1 (build+lint), 5
   (plan chip reads backend `planName`), 9's contract shape (the additive
   `OrganizationForUser`; the DB-run test is a gap), 10 (single `signOut`, redirect kept).
   Runtime-dependent or structural-in-browser: 2, 3, 4, 6, 7, 8 — recorded as gaps below.
   Inspection also confirmed no `localStorage`/`sessionStorage` of space state and no
   upgrade/billing CTA anywhere in the frontend.
5. **Deviations recorded.** `use-mobile` landed at `frontend/hooks/use-mobile.ts`
   (the `hooks: @/hooks` alias), not `lib/` as the spec sketch showed — followed the CLI
   output, per the plan's risk row. No row was added to `docs/CAPABILITY-MAP.md`
   (untouched), same precedent as `SPEC-org-team-invites.md`.
6. **Observation, deliberately not changed.** `components/ui/*` import `cn` from the
   `"cn"` package while the shell components import it from `@/lib/utils` (which merely
   re-exports the same `cn`). Both resolve identically; unifying them is churn, not a fix.

**Follow-up gaps (carried, non-blocking):**

- **Browser smoke (Task 14)** — human: fresh signup → Personal/`Free`/Documents locked;
  create team → `Org`/Documents unlocked/no CTA; one-click switching + reload keeps the
  route-derived space; ⌘K open → navigate → Esc → focus restore; rail at 1/2/3 spaces;
  auth pages bare; signed-out `/` landing; signed-out `/orgs/[id]` → `/sign-in?next=…`.
- **`npm test` (Task 14)** — run on a non-destructive database (either point
  `DATABASE_URL_TEST` at a scratch DB *and* make `runMigrationScript()` target it, or run
  it against a disposable environment). Expected green, including the `OrganizationForUser`
  case from Task 1.
- **Loading layout shift** — on a hard reload the shell renders bare until
  `status === "ok"`, so the rail/bar pop in. Deferred (plan note 8); a static chrome
  skeleton is the likely fix.
- **Members/Invites scaffold dedup** — the two routes share a near-identical
  load/retry scaffold. Extract a `useSpaceResource` hook only when a third space
  resource appears, to avoid a two-use abstraction (plan note 8).
- **Invite dialog field reset** — dismissing the invite dialog keeps the typed email
  (only a successful invite clears it). Pre-existing; noted while touching the file.

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
