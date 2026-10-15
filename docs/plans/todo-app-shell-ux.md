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

---

## Task 4: Build `SpaceProvider` + `useSpaces()`

**Description:** Add the single source of truth for spaces: a client provider that fetches `/api/organizations` once via `apiFetch` (keeping `credentials: "include"`), exposes `spaces` / `activeSpace` / load state / `reload`, derives `activeSpace` from `useParams().id`, and mirrors the entitlement rule as a display-only `documentsUnlocked`.

**Acceptance criteria:**
- [x] `activeSpace` is derived from the route via `useMemo` and never persisted to any storage
- [x] Provider exposes `loading` / `error` / `ok` states plus a `reload` action
- [x] `documentsUnlocked === activeSpace !== null && !activeSpace.isPersonal && activeSpace.planName === "Org"`
- [ ] Only one `/api/organizations` fetch is issued for the shell (pages consume the provider) — pages still fetch their own; completed in Tasks 9–10
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
- [ ] `(app)/layout.tsx` renders rail + global bar around `children`
- [ ] When unauthenticated, chrome is suppressed and `children` render bare (no redirect to `/sign-in`)
- [ ] `(auth)` routes are not wrapped by the shell
- [ ] No chrome flash before the session branch resolves
- [ ] Layout is typed `{ children: React.ReactNode }` (not the generated layout-route helper)

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: signed-out `/` shows the landing with no rail/bar

**Dependencies:** Task 2, Task 3, Task 4

**Files likely touched:**
- `frontend/app/(app)/layout.tsx`

**Estimated scope:** M

---

## Task 6: Rail — switcher with role badge, space-scoped nav, locked Documents row

**Description:** Build the rail: a space switcher dropdown showing the caller's role badge and a create-team footer, then `Home`, then the space group (`Overview`, `Members`, `Invites`, `Settings`) only when a space is in the route, then the entitlement-locked `Documents` row. Nav items are real `Link`s with `aria-current="page"`; the locked row is `aria-disabled`, non-navigable, with a short reason via `aria-describedby`.

**Acceptance criteria:**
- [ ] Switcher switches spaces in one click and always reflects the route
- [ ] Role badge reads from `activeSpace.role`
- [ ] Space-scoped nav appears only when a space id is in the route; `aria-current="page"` on the active item
- [ ] `Documents` renders locked when `activeSpace.isPersonal || activeSpace.planName !== "Org"`; never a working link
- [ ] No upgrade/billing CTA is rendered anywhere in the rail
- [ ] Rail reads intentional at 1, 2, and 3 spaces

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: 1/2/3-space walkthrough; Documents locked on Free, unlocked on Org

**Dependencies:** Task 3, Task 4, Task 5

**Files likely touched:**
- `frontend/components/shell/app-rail.tsx`
- `frontend/components/shell/space-switcher.tsx`
- `frontend/components/shell/locked-nav-item.tsx`
- `frontend/app/(app)/layout.tsx`

**Estimated scope:** M

---

## Task 7: Global bar — breadcrumb chip, plan chip, avatar menu (single sign-out)

**Description:** Build the global bar: a `DocuPulse › {Space}` breadcrumb chip on the left (space segment omitted on `/`), a ⌘K trigger, a truthful `Free`/`Org` plan chip, and an avatar menu. Move sign-out into the avatar menu and remove the two duplicated sign-out buttons.

**Acceptance criteria:**
- [ ] Breadcrumb reads `DocuPulse › {Space}` on space routes and `DocuPulse` alone on `/`
- [ ] Plan chip reads from backend `planName` (`Free` / `Org`), not a hard-coded id→name map
- [ ] Sign-out exists in exactly one place (avatar menu) with `authClient.signOut()` + `window.location.replace("/sign-in")` behavior preserved
- [ ] The duplicated sign-out buttons at the old Home and org pages are removed
- [ ] No notification bell, help menu, or theme toggle is rendered

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: sign-out still lands on `/sign-in`; breadcrumb/plan chip correct

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `frontend/components/shell/global-bar.tsx`
- `frontend/components/shell/breadcrumb-chip.tsx`
- `frontend/app/(app)/page.tsx`
- `frontend/app/(app)/orgs/[id]/page.tsx`

**Estimated scope:** M

---

## Task 8: `orgs/[id]/layout.tsx` — resolve the active space, honest "Space not found"

**Description:** Add the org layout that resolves `activeSpace` only from the viewer's own space list and renders an honest "Space not found" `Alert` with a link to `/` when the id is unknown or foreign — never leaking another org's name into the rail, breadcrumb, or palette.

**Acceptance criteria:**
- [ ] Unknown or foreign id → "Space not found" `Alert` with a link to `/`
- [ ] A non-member's space name never reaches the rail, breadcrumb, or palette
- [ ] Layout uses the existing `Alert` component
- [ ] The `router.replace('/sign-in?next=…')` redirect for signed-out users still fires

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: bogus id shows the alert; signed-out space URL redirects to sign-in

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `frontend/app/(app)/orgs/[id]/layout.tsx`

**Estimated scope:** S

---

## Checkpoint: After Tasks 5–8
- [ ] `/`, `/orgs/[id]` render inside the rail + bar; `/sign-in`, `/sign-up`, `/invites/accept` do not
- [ ] Breadcrumb and plan chip correct on personal and team spaces
- [ ] Signed-out `/` still renders the landing
- [ ] No space state written to any storage

---

## Task 9: Split `/orgs/[id]/members` and `/orgs/[id]/invites` out of the single org page

**Description:** Extract the members list and the invites list (+ invite dialog + revoke, with `revokeError` handling) from today's single `orgs/[id]/page.tsx` into their own routes, preserving the existing `Skeleton` / `Alert` / retry behavior and the invite flow.

**Acceptance criteria:**
- [ ] `/orgs/[id]/members` renders the member list
- [ ] `/orgs/[id]/invites` renders invites + "Invite member" dialog + revoke, gated by `canManage`
- [ ] Existing `Skeleton` / `Alert` / retry states preserved on both routes
- [ ] Invite creation and revoke still call the same endpoints and reload

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: invite + revoke still work on the new routes

**Dependencies:** Task 5, Task 6, Task 8

**Files likely touched:**
- `frontend/app/(app)/orgs/[id]/members/page.tsx`
- `frontend/app/(app)/orgs/[id]/invites/page.tsx`
- `frontend/app/(app)/orgs/[id]/page.tsx`

**Estimated scope:** M

---

## Task 10: Add `/orgs/[id]` Overview and `/orgs/[id]/settings`; role-driven `canManage`

**Description:** Make `/orgs/[id]` the space Overview and add a Settings route, and replace the email-matching `canManage` hack with the `role` now returned by `useSpaces()`.

**Acceptance criteria:**
- [ ] `/orgs/[id]` renders a space Overview (space name + slug + Personal/Team) inside the shell
- [ ] `/orgs/[id]/settings` renders a real route
- [ ] `canManage` is `activeSpace.role === "owner" || activeSpace.role === "admin"` — no email matching
- [ ] Space identity is read from `useSpaces()`, not a second `/api/organizations` fetch

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: role badge and `canManage` gating agree on a personal vs team space

**Dependencies:** Task 5, Task 6, Task 8, Task 9

**Files likely touched:**
- `frontend/app/(app)/orgs/[id]/page.tsx`
- `frontend/app/(app)/orgs/[id]/settings/page.tsx`

**Estimated scope:** S

---

## Task 11: Home `/` unscoped landing + create-team dialog mounted once in the shell

**Description:** Make Home the unscoped landing (space list + create-team entry), reusing the current page's `loading` / `unauth` / `error` / `ok` branches, and move the create-team dialog into the shell so it has exactly two entry points: the switcher dropdown footer and the Home empty state.

**Acceptance criteria:**
- [ ] Home reuses the existing `loading` / `unauth` / `error` / `ok` branches
- [ ] Create-team dialog is mounted once in the shell
- [ ] Both entry points (switcher footer, Home empty state) open the same dialog
- [ ] Submitting creates the org and navigates to `/orgs/{id}`; the new space appears in switcher + palette
- [ ] Signed-out `/` renders the existing front-door landing unchanged

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: create team → land in space → rail/bar follow

**Dependencies:** Task 5, Task 6, Task 9

**Files likely touched:**
- `frontend/app/(app)/page.tsx`
- `frontend/components/shell/create-space-dialog.tsx`
- `frontend/components/shell/app-rail.tsx`

**Estimated scope:** M

---

## Checkpoint: After Tasks 9–11
- [ ] Every rail item navigates to a real route; `Documents` stays the only locked row
- [ ] `Skeleton` / `Alert` / retry preserved; `canManage` is role-driven
- [ ] End-to-end create-team flow works

---

## Task 12: ⌘K command palette

**Description:** Build the ⌘K / Ctrl+K navigation palette over already-loaded data: Home, each space, the active space's sections, and create-team. Use `@base-ui/react/autocomplete` + `dialog` for combobox semantics, focus trap, Esc-to-close, and focus restore. No backend search, no documents.

**Acceptance criteria:**
- [ ] ⌘K (macOS) and Ctrl+K (others) open the palette
- [ ] Navigating to Home, a space, and the active space's sections works from the palette
- [ ] Esc closes it and focus returns to the trigger
- [ ] Keyboard-only operation works end to end (combobox semantics)
- [ ] Palette reads loaded data only — no search endpoint, no documents

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`
- [ ] Manual check: keyboard-only open → navigate → Esc → focus restore

**Dependencies:** Task 4, Task 5

**Files likely touched:**
- `frontend/components/shell/command-palette.tsx`
- `frontend/components/shell/global-bar.tsx`

**Estimated scope:** M

---

## Checkpoint: After Task 12
- [ ] ⌘K earns its place (navigates spaces + members + settings) — go/no-go confirmed
- [ ] Palette scope stays within loaded data

---

## Task 13: Frontend build + lint gate across all routes

**Description:** Run the primary frontend gate once the shell and all routes exist: `npm run build` (TypeScript + typed-route generation) and `npm run lint`.

**Acceptance criteria:**
- [ ] `npm run build` succeeds with 0 TypeScript errors
- [ ] `npm run lint` passes with 0 errors
- [ ] All 8 routes build: `/`, `/orgs/[id]`, `/orgs/[id]/members`, `/orgs/[id]/invites`, `/orgs/[id]/settings`, `/sign-in`, `/sign-up`, `/invites/accept`

**Verification:**
- [ ] Build: frontend `npm run build`
- [ ] Lint: frontend `npm run lint`

**Dependencies:** Task 12

**Files likely touched:** none (gate only)

**Estimated scope:** XS

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
- [ ] Backend gate: `npm test` + `npm run typecheck` green (includes the `OrganizationForUser` case)

**Dependencies:** Task 13

**Files likely touched:** none (verification only)

**Estimated scope:** S

---

## Task 15: Final review against success criteria 1–10; record follow-up gaps

**Description:** Walk all 10 success criteria and mark any implementation or verification gap as a follow-up before completion; note the CAPABILITY-MAP decision (no row added) and the `use-mobile` placement deviation.

**Acceptance criteria:**
- [ ] Criteria 1–10 each verified by an automated gate or a recorded manual smoke result
- [ ] Any unverifiable criterion is recorded as an explicit follow-up gap
- [ ] The plan notes confirm no CAPABILITY-MAP row was added (ask-first boundary untouched)
- [ ] The `use-mobile` hook location deviation from the spec sketch is recorded

**Verification:**
- [ ] Manual review of `docs/plans/plan-app-shell-ux.md` and this file
- [ ] `npm run build`, `npm run lint`, `npm test` all green

**Dependencies:** Task 13, Task 14

**Files likely touched:**
- `docs/plans/plan-app-shell-ux.md`
- `docs/plans/todo-app-shell-ux.md`

**Estimated scope:** XS

---

## Checkpoint: Complete
- [ ] Success criteria 1–10 verified or gap recorded
- [ ] No upgrade CTA, no persisted space state, no decorative chrome
- [ ] Ready for human review
