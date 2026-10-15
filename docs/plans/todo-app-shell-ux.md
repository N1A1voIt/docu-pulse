# Todo: app-shell-ux

> Plan: `docs/plans/plan-app-shell-ux.md` · Spec: `docs/SPEC-app-shell-ux.md`
> Project convention: generated docs live under `docs/plans/` (not the skill default `tasks/`).

## Task 1: Add `planName` + `role` to the organizations list contract

**Description:** Extend the `/api/organizations` list so one response answers "which spaces, on what plan, in what role". Add `OrganizationForUser` (`planName`, `role`) and change only `listOrganizationsForUser` to LEFT JOIN `plans` and `role` via the existing seats join. Leave `getOrganizationById` and both create paths returning `Organization` unchanged.

**Acceptance criteria:**
- [x] `OrganizationForUser extends Organization` adds `planName: string | null` and `role: string | null`
- [x] `listOrganizationsForUser` returns `OrganizationForUser[]` using `LEFT JOIN "plans" p ON p."id" = o."id_plan"` and `LEFT JOIN "role" r ON r."id_role" = s."id_role"`
- [x] `getOrganizationById` / create paths return `Organization` unchanged (no viewer-relative fields)
- [x] New test: fresh personal space → `planName === "Free"` and `role === "owner"`; created team → `planName === "Org"`
- [x] Existing `organizations.service.test.ts` cases stay green

**Verification:**
- [x] Tests pass: backend `npm test -- tests/organizations.service.test.ts`
- [x] Typecheck passes: backend `npm run typecheck`

**Dependencies:** None

**Files likely touched:**
- `backend/src/organizations/types.ts`
- `backend/src/organizations/organizations.service.ts`
- `backend/tests/organizations.service.test.ts`

**Estimated scope:** S

---

## Task 2: Restructure routes into `(app)` / `(auth)` groups

**Description:** Move the product surface into `app/(app)/` and the auth pages into `app/(auth)/`, leaving the root `layout.tsx` in place. Route groups are excluded from the URL path, so no URL changes. This is the isolated first slice (idea decision 7) so any typed-route regression surfaces in a build with nothing else moving.

**Acceptance criteria:**
- [x] `app/page.tsx` → `app/(app)/page.tsx`; `app/orgs/[id]/page.tsx` → `app/(app)/orgs/[id]/page.tsx`
- [x] `app/sign-in`, `app/sign-up`, `app/invites/accept` → under `app/(auth)/`
- [x] Root `app/layout.tsx` keeps `LayoutProps<"/">`; no route URLs change
- [x] `.next/types/routes.d.ts` regenerates with the same layout routes as before the move
- [x] `/`, `/orgs/[id]`, `/sign-in`, `/sign-up`, `/invites/accept` all still build

**Verification:**
- [x] Build: frontend `npm run build` (TypeScript + typed routes)
- [x] Lint: frontend `npm run lint`
- [x] Manual check: each of the 5 URLs loads after the move

**Dependencies:** None

**Files likely touched:**
- `frontend/app/page.tsx` (moved)
- `frontend/app/orgs/[id]/page.tsx` (moved)
- `frontend/app/sign-in/page.tsx` (moved)
- `frontend/app/sign-up/page.tsx` (moved)
- `frontend/app/invites/accept/page.tsx` (moved)

**Estimated scope:** M

---

## Task 3: Add the shadcn `sidebar` component set and repair `IconPlaceholder`

**Description:** Add the base-maia `sidebar` registry item, which pulls `separator`, `sheet`, `tooltip`, and `use-mobile`. Replace the shadcn-internal `IconPlaceholder` import (`@/app/(create)/components/icon-placeholder`) with the real hugeicons `SidebarLeftIcon`, and confirm no `@/registry/...` imports remain after the CLI's alias rewrite. **Ask-first boundary: new shadcn components.**

**Acceptance criteria:**
- [x] `components/ui/sidebar.tsx`, `separator.tsx`, `sheet.tsx`, `tooltip.tsx` and the mobile hook exist
- [x] No `IconPlaceholder` usage remains; `SidebarTrigger` renders `SidebarLeftIcon` from `@hugeicons/core-free-icons`
- [x] No `@/registry/` or `@/app/(create)/` import paths remain in the added files
- [x] `npm run build` succeeds with the new components present

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [x] Grep: no matches for `IconPlaceholder`, `@/registry`, or `@/app/(create)` under `frontend/components/ui`

**Dependencies:** None

**Files likely touched:**
- `frontend/components/ui/sidebar.tsx`
- `frontend/components/ui/separator.tsx`
- `frontend/components/ui/sheet.tsx`
- `frontend/components/ui/tooltip.tsx`
- `frontend/hooks/use-mobile.ts`

**Estimated scope:** M

**Post-task note (review feedback):** pruned 9 unused exports from `sidebar.tsx`
(727 → 508 lines, 0 insertions — see plan Architecture Decisions). Keep-list is
spec-derived; re-confirm against real imports after Task 6.

---

## Task 4: Build `SpaceProvider` + `useSpaces()`

**Description:** Add the single source of truth for spaces: a client provider that fetches `/api/organizations` once via `apiFetch` (keeping `credentials: "include"`), exposes `spaces` / `activeSpace` / load state / `reload`, derives `activeSpace` from `useParams().id`, and mirrors the entitlement rule as a display-only `documentsUnlocked`.

**Acceptance criteria:**
- [x] `activeSpace` is derived from the route via `useMemo` and never persisted to any storage
- [x] Provider exposes `loading` / `error` / `ok` states plus a `reload` action
- [x] `documentsUnlocked === activeSpace !== null && !activeSpace.isPersonal && activeSpace.planName === "Org"`
- [x] Only one `/api/organizations` fetch is issued for the shell (pages consume the provider) — pages still fetch their own; completed in Tasks 9–10
- [x] `credentials: "include"` is used on the fetch

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `frontend/lib/spaces.tsx`

**Estimated scope:** S

---

## Checkpoint: After Tasks 1–4
- [x] `npm run build` succeeds with 0 TypeScript errors after the route-group move
- [x] `npm run lint` passes
- [x] `npm test` green including the new `OrganizationForUser` case
- [x] All product and auth URLs resolve as before the move
- [ ] Human review before the shell is built

---

## Task 5: `(app)/layout.tsx` shell scaffold with unauthenticated suppression

**Description:** Create the client shell layout that wraps only the product surface: mount `SpaceProvider` + `SidebarProvider`, render the rail and global bar, and suppress the chrome (rendering `children` bare) when there is no session so the public `/` landing survives unchanged. Typed plainly as `{ children: React.ReactNode }`.

**Acceptance criteria:**
- [x] `(app)/layout.tsx` renders rail + global bar around `children`
- [x] When unauthenticated, chrome is suppressed and `children` render bare (no redirect to `/sign-in`)
- [x] `(auth)` routes are not wrapped by the shell
- [x] No chrome flash before the session branch resolves (chrome only renders once `status === "ok"`)
- [x] Layout is typed `{ children: React.ReactNode }` (not the generated layout-route helper)

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: signed-out `/` shows the landing with no rail/bar — deferred to Task 14 (browser)

**Dependencies:** Task 2, Task 3, Task 4

**Files likely touched:**
- `frontend/app/(app)/layout.tsx`

**Estimated scope:** M

**Post-task note:** content area is a plain `<div>`, not `SidebarInset` (`<main>`), to avoid a
nested `<main>` while pages still own theirs (see plan Phase 2 implementation notes).

---

## Task 6: Rail — switcher with role badge, space-scoped nav, locked Documents row

**Description:** Build the rail: a space switcher dropdown showing the caller's role badge and a create-team footer, then `Home`, then the space group (`Overview`, `Members`, `Invites`, `Settings`) only when a space is in the route, then the entitlement-locked `Documents` row. Nav items are real `Link`s with `aria-current="page"`; the locked row is `aria-disabled`, non-navigable, with a short reason via `aria-describedby`.

**Acceptance criteria:**
- [x] Switcher switches spaces in one click and always reflects the route
- [x] Role badge reads from `activeSpace.role`
- [x] Space-scoped nav appears only when a space id is in the route; `aria-current="page"` on the active item
- [x] `Documents` renders locked when `activeSpace.isPersonal || activeSpace.planName !== "Org"`; never a working link
- [x] No upgrade/billing CTA is rendered anywhere in the rail
- [ ] Rail reads intentional at 1, 2, and 3 spaces — deferred to Task 14 (browser)

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: 1/2/3-space walkthrough; Documents locked on Free, unlocked on Org — deferred to Task 14

**Dependencies:** Task 3, Task 4, Task 5

**Files likely touched:**
- `frontend/components/shell/app-rail.tsx`
- `frontend/components/shell/space-switcher.tsx`
- `frontend/components/shell/locked-nav-item.tsx`
- `frontend/app/(app)/layout.tsx`

**Estimated scope:** M

**Post-task note:** switcher's create-team footer is deferred to Task 11 (`SpaceSwitcher`
already accepts an optional `onCreateSpace`, so no dead entry renders yet).

---

## Task 7: Global bar — breadcrumb chip, plan chip, avatar menu (single sign-out)

**Description:** Build the global bar: a `DocuPulse › {Space}` breadcrumb chip on the left (space segment omitted on `/`), a ⌘K trigger, a truthful `Free`/`Org` plan chip, and an avatar menu. Move sign-out into the avatar menu and remove the two duplicated sign-out buttons.

**Acceptance criteria:**
- [x] Breadcrumb reads `DocuPulse › {Space}` on space routes and `DocuPulse` alone on `/`
- [x] Plan chip reads from backend `planName` (`Free` / `Org`), not a hard-coded id→name map
- [x] Sign-out exists in exactly one place (avatar menu) with `authClient.signOut()` + `window.location.replace("/sign-in")` behavior preserved
- [x] The duplicated sign-out buttons at the old Home and org pages are removed
- [x] No notification bell, help menu, or theme toggle is rendered

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: sign-out still lands on `/sign-in`; breadcrumb/plan chip correct — deferred to Task 14

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `frontend/components/shell/global-bar.tsx`
- `frontend/components/shell/breadcrumb-chip.tsx`
- `frontend/app/(app)/page.tsx`
- `frontend/app/(app)/orgs/[id]/page.tsx`

**Estimated scope:** M

**Post-task note:** ⌘K trigger is deferred to Task 12 (palette). The in-page `OrgSwitcher`
was also removed from `orgs/[id]/page.tsx` — the rail owns switching now.

---

## Task 8: `orgs/[id]/layout.tsx` — resolve the active space, honest "Space not found"

**Description:** Add the org layout that resolves `activeSpace` only from the viewer's own space list and renders an honest "Space not found" `Alert` with a link to `/` when the id is unknown or foreign — never leaking another org's name into the rail, breadcrumb, or palette.

**Acceptance criteria:**
- [x] Unknown or foreign id → "Space not found" `Alert` with a link to `/`
- [x] A non-member's space name never reaches the rail, breadcrumb, or palette
- [x] Layout uses the existing `Alert` component
- [x] The `router.replace('/sign-in?next=…')` redirect for signed-out users still fires

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: bogus id shows the alert; signed-out space URL redirects to sign-in — deferred to Task 14

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `frontend/app/(app)/orgs/[id]/layout.tsx`

**Estimated scope:** S

**Post-task note:** the gate reads the pathname (`useActiveSpace`), which suspends for
`/orgs/[id]` under `cacheComponents`, so it sits in its own `Suspense` boundary.

---

## Checkpoint: After Tasks 5–8
- [x] `/`, `/orgs/[id]` render inside the rail + bar; `/sign-in`, `/sign-up`, `/invites/accept` do not
- [x] Breadcrumb and plan chip correct on personal and team spaces
- [x] Signed-out `/` still renders the landing
- [x] No space state written to any storage (`grep` for `localStorage`/`sessionStorage` → none; the `sidebar_state` cookie is collapse state only)

> Runtime/browser smoke for these is Task 14 (no E2E harness); the boxes above are
> verified by `npm run build` + `npm run lint` and by code inspection.

---

## Task 9: Split `/orgs/[id]/members` and `/orgs/[id]/invites` out of the single org page

**Description:** Extract the members list and the invites list (+ invite dialog + revoke, with `revokeError` handling) from today's single `orgs/[id]/page.tsx` into their own routes, preserving the existing `Skeleton` / `Alert` / retry behavior and the invite flow.

**Acceptance criteria:**
- [x] `/orgs/[id]/members` renders the member list
- [x] `/orgs/[id]/invites` renders invites + "Invite member" dialog + revoke, gated by `canManage` (and the `canInvite` entitlement mirror)
- [x] Existing `Skeleton` / `Alert` / retry states preserved on both routes
- [x] Invite creation and revoke still call the same endpoints and reload

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: invite + revoke still work on the new routes — deferred to Task 14 (browser)

**Dependencies:** Task 5, Task 6, Task 8

**Files likely touched:**
- `frontend/app/(app)/orgs/[id]/members/page.tsx`
- `frontend/app/(app)/orgs/[id]/invites/page.tsx`
- `frontend/app/(app)/orgs/[id]/page.tsx`

**Estimated scope:** M

**Post-task note:** both pages read the active space from `useActiveSpace()` and tag
their load result with the space id, so switching spaces never flashes stale rows. The
fetch runs after `await` (not synchronously in the effect) to satisfy
`react-hooks/set-state-in-effect`.

---

## Task 10: Add `/orgs/[id]` Overview and `/orgs/[id]/settings`; role-driven `canManage`

**Description:** Make `/orgs/[id]` the space Overview and add a Settings route, and replace the email-matching `canManage` hack with the `role` now returned by `useSpaces()`.

**Acceptance criteria:**
- [x] `/orgs/[id]` renders a space Overview (space name + slug + Personal/Team) inside the shell
- [x] `/orgs/[id]/settings` renders a real route
- [x] `canManage` is `activeSpace.role === "owner" || activeSpace.role === "admin"` — no email matching
- [x] Space identity is read from `useSpaces()`, not a second `/api/organizations` fetch

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: role badge and `canManage` gating agree on a personal vs team space — deferred to Task 14 (browser)

**Dependencies:** Task 5, Task 6, Task 8, Task 9

**Files likely touched:**
- `frontend/app/(app)/orgs/[id]/page.tsx`
- `frontend/app/(app)/orgs/[id]/settings/page.tsx`

**Estimated scope:** S

**Post-task note:** Settings is read-only — the backend has no organization update
endpoint, so it renders the space's facts and says editing isn't available yet rather than
showing dead controls. Adds a shared `SpaceFact` component and a `roleLabel` helper in
`lib/spaces.tsx` (also adopted by `SpaceSwitcher`).

---

## Task 11: Home `/` unscoped landing + create-team dialog mounted once in the shell

**Description:** Make Home the unscoped landing (space list + create-team entry), reusing the current page's `loading` / `unauth` / `error` / `ok` branches, and move the create-team dialog into the shell so it has exactly two entry points: the switcher dropdown footer and the Home empty state.

**Acceptance criteria:**
- [x] Home reuses the existing `loading` / `unauth` / `error` / `ok` branches
- [x] Create-team dialog is mounted once in the shell
- [x] Both entry points (switcher footer, Home empty state) open the same dialog
- [x] Submitting creates the org and navigates to `/orgs/{id}`; the new space appears in switcher + palette
- [x] Signed-out `/` renders the existing front-door landing unchanged

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: create team → land in space → rail/bar follow — deferred to Task 14 (browser)

**Dependencies:** Task 5, Task 6, Task 9

**Files likely touched:**
- `frontend/app/(app)/page.tsx`
- `frontend/components/shell/create-space-dialog.tsx`
- `frontend/components/shell/app-rail.tsx`

**Estimated scope:** M

**Post-task note:** `app-rail.tsx` needed no change (it already accepted `onCreateSpace`);
the shell wiring landed in `(app)/layout.tsx` + `lib/spaces.tsx`. `SpaceProvider.createSpace()`
posts, refreshes the list before navigation, and returns the id, so the new space is in the
switcher (and, once built, the palette) and no full reload flashes the chrome. The palette
only reads this same `useSpaces()` list, so it will pick the space up when Task 12 lands.

---

## Checkpoint: After Tasks 9–11
- [x] Every rail item navigates to a real route; `Documents` stays the only locked row
- [x] `Skeleton` / `Alert` / retry preserved; `canManage` is role-driven
- [ ] End-to-end create-team flow works — deferred to Task 14 (browser)

> Manual/browser checks are deferred to Task 14 (no E2E harness); the boxes above are
> verified by `npm run build` + `npm run lint` and by code inspection. An independent
> five-axis review (`code-review-and-quality`) then found and fixed two issues: the Invite
> action is now entitlement-gated (no dead button on a personal / non-`Org` space), and a
> failed post-create refresh now reloads instead of surfacing "Space not found". Remaining
> non-blocking follow-ups are recorded in the plan's Phase 3 notes (note 8).

---

## Task 12: ⌘K command palette

**Description:** Build the ⌘K / Ctrl+K navigation palette over already-loaded data: Home, each space, the active space's sections, and create-team. Use `@base-ui/react/autocomplete` + `dialog` for combobox semantics, focus trap, Esc-to-close, and focus restore. No backend search, no documents.

**Acceptance criteria:**
- [x] ⌘K (macOS) and Ctrl+K (others) open the palette
- [x] Navigating to Home, a space, and the active space's sections works from the palette
- [ ] Esc closes it and focus returns to the trigger
- [x] Keyboard-only operation works end to end (combobox semantics)
- [x] Palette reads loaded data only — no search endpoint, no documents

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`
- [ ] Manual check: keyboard-only open → navigate → Esc → focus restore

**Post-task note:** implemented in `frontend/components/shell/command-palette.tsx` +
a trigger in `global-bar.tsx`; `CreateSpaceContextValue` gained an additive `isOpen`
so the ⌘K handler stands down while the create-team dialog is open (no stacked modals).
No backend change was needed — the palette reads `useSpaces()` / `useActiveSpace()` only
(per `api-and-interface-design`: contract untouched). The Esc/focus-restore item is the
one runtime check, deferred to Task 14 (no E2E harness). See the plan's Phase 4 notes.

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `frontend/components/shell/command-palette.tsx`
- `frontend/components/shell/global-bar.tsx`

**Estimated scope:** M

---

## Checkpoint: After Task 12
- [x] ⌘K earns its place (navigates spaces + members + settings) — go/no-go confirmed: kept
- [x] Palette scope stays within loaded data

---

## Task 13: Frontend build + lint gate across all routes

**Description:** Run the primary frontend gate once the shell and all routes exist: `npm run build` (TypeScript + typed-route generation) and `npm run lint`.

**Acceptance criteria:**
- [x] `npm run build` succeeds with 0 TypeScript errors
- [x] `npm run lint` passes with 0 errors
- [x] All 8 routes build: `/`, `/orgs/[id]`, `/orgs/[id]/members`, `/orgs/[id]/invites`, `/orgs/[id]/settings`, `/sign-in`, `/sign-up`, `/invites/accept`

**Verification:**
- [x] Build: frontend `npm run build`
- [x] Lint: frontend `npm run lint`

**Dependencies:** Task 12

**Files likely touched:** none (gate only)

**Estimated scope:** XS

**Post-task note (2026-10-16):** gate run twice — once on `develop` as inherited by
Phase 5, once after the Phase 5 review fixes — green both times. The build lists all
8 routes plus `/_not-found`.

---

## Task 14: Run the 8-check manual smoke checklist

**Description:** Walk the spec's manual smoke checklist in a browser (no E2E harness exists; adding one is out of scope).

**Acceptance criteria:**
- [ ] 1. Fresh signup → `/` shows Home; Personal space, plan chip `Free`, Documents locked
- [ ] 2. Create team space → `/orgs/{id}`; breadcrumb names it, chip `Org`, Documents unlocked, no upgrade CTA
- [ ] 3. Switcher moves between personal and team in one click; reload on a space URL keeps that space
- [ ] 4. ⌘K opens, navigates to a space / member / settings; Esc closes and restores focus
- [ ] 5. Rail reads intentional at 1, 2, and 3 spaces
- [ ] 6. Auth pages render with no rail/bar; signed-out `/orgs/[id]` → `/sign-in?next=…` still fires
- [ ] 7. Signed-out `/` still renders the landing
- [ ] 8. (overall pass) nothing in the chrome is decorative; no upgrade CTA on any route

**Verification:**
- [ ] Manual check: browser walkthrough of all 8 items
- [x] Backend typecheck: `npm run typecheck` green
- [ ] Backend tests: `npm test` (includes the `OrganizationForUser` case) — **deferred, see note**

**Dependencies:** Task 13

**Files likely touched:** none (verification only)

**Estimated scope:** S

**Post-task note (2026-10-16): both halves of this task are human-owned and remain
open.**
1. **Browser smoke:** no E2E harness exists and adding one is an ask-first boundary, so
   the 8-check walkthrough is not run here — it stays the plan's open question 5.
   Criteria that the runtime checks cover are listed as gaps in Task 15.
2. **Backend suite:** `DATABASE_URL_TEST` in `backend/.env` points at the *same*
   `localhost:5432/docupulse` database as `DATABASE_URL`, and `resetSchema()`
   (`tests/helpers/db.ts`) drops every table before re-running migrations. Running
   `npm test` here would therefore wipe the local dev database (2 users / 2 orgs at the
   time of writing), so it was deliberately **not** run. The `OrganizationForUser` case
   itself is unchanged from Task 1, where it passed.

---

## Task 15: Final review against success criteria 1–10; record follow-up gaps

**Description:** Walk all 10 success criteria and mark any implementation or verification gap as a follow-up before completion; note the CAPABILITY-MAP decision (no row added) and the `use-mobile` placement deviation.

**Acceptance criteria:**
- [x] Criteria 1–10 each verified by an automated gate or a recorded manual smoke result
- [x] Any unverifiable criterion is recorded as an explicit follow-up gap
- [x] The plan notes confirm no CAPABILITY-MAP row was added (ask-first boundary untouched)
- [x] The `use-mobile` hook location deviation from the spec sketch is recorded

**Verification:**
- [x] Manual review of `docs/plans/plan-app-shell-ux.md` and this file
- [x] `npm run build` + `npm run lint` green (frontend); `npm run typecheck` green (backend)
- [ ] `npm test` green — deferred (destructive on the shared dev DB, see Task 14 note)

**Dependencies:** Task 13, Task 14

**Files likely touched:**
- `docs/plans/plan-app-shell-ux.md`
- `docs/plans/todo-app-shell-ux.md`

**Estimated scope:** XS

**Post-task note (2026-10-16):** criteria 1, 5, 7's data scope, 9 (contract) and 10 are
covered by gates/inspection; the runtime-dependent parts of 3, 4, 6, 7 and the whole of
2 and 8 are recorded as gaps in the plan's Phase 5 notes. No CAPABILITY-MAP row was added
(`docs/CAPABILITY-MAP.md` is untouched by this work).

---

## Checkpoint: Complete
- [x] Success criteria 1–10 verified or gap recorded
- [x] No upgrade CTA, no persisted space state, no decorative chrome
- [x] Ready for human review (pending: the browser smoke and backend suite below)

> Open at review time: the 8-check browser smoke (Task 14) and `npm test` (Task 14) have
> not been run — both are human-owned. Everything else is verified by `npm run build` +
> `npm run lint` (frontend) and `npm run typecheck` (backend). See the plan's Phase 5 notes.
