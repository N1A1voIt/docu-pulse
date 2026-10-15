# Spec: `app-shell-ux` — Persistent App Shell (Rail + Global Bar)

> Source idea: `docs/ideas/app-shell-ux.md`
> Module: frontend consumer of `organizations` (+ `entitlements` display mirror). **Adds one additive contract** to `GET /api/organizations`: `planName` and `role`. Does not introduce a new module id in `docs/CAPABILITY-MAP.md`; same precedent as `docs/SPEC-org-team-invites.md`.
> Status: **draft — pending human approval (Phase 1, spec-driven-development)**

## Objective

Give DocuPulse an app-wide workspace shell so the product reads as a real product to the person using it today — one user, one personal space, no documents, no teammates — without inventing scale (no project-picker modal) or fake content to fill the chrome.

Two mechanisms, two jobs (Direction B from the idea):

- **Rail** = *between* spaces. One click, visible context: space switcher with role badge, then Home and space-scoped nav.
- **Global bar** = *anywhere*. Breadcrumb chip (`DocuPulse › {Space}`), ⌘K palette, plan chip, avatar menu.

Both read the active space from the route. Neither owns it. No persisted "current space" anywhere (honors `docs/ideas/org-team-invites.md` decision 5).

**User:** the builder plus the first few testers.
**Success:** an authenticated user sees a persistent rail + bar on every product route, the breadcrumb names the space they are in, the plan chip tells the truth, and locked features look locked for real reasons. Nothing in the chrome is decorative.

## Tech Stack

- Next.js 16.4 (App Router, route groups, typed routes), React 19, TypeScript 5
- Tailwind CSS 4 + shadcn `base-maia` style on `@base-ui/react` 1.9
- `sidebar` from the base-maia registry (verified available — see Assumptions)
- Backend: Fastify 5 + `pg` (one additive query change)
- No new runtime dependency beyond what `shadcn add sidebar` pulls in

## Commands

Frontend (from `frontend/`):
```
Dev:        npm run dev            # next dev (3000)
Build:      npm run build          # TypeScript + typed-route generation (primary gate)
Lint:       npm run lint           # eslint
Add sidebar: npx shadcn@latest add sidebar
```
Backend (from `backend/`):
```
Test:       npm test               # vitest run
Typecheck:  npm run typecheck
DB init:    npm run db:init
```

## Project Structure

Route groups keep auth pages bare and wrap only the product surface. **No URL changes** — groups are excluded from the path (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`).

```
frontend/
  app/
    layout.tsx                      root (html/body) — unchanged
    (auth)/                         bare chrome, shell must NOT wrap
      sign-in/page.tsx
      sign-up/page.tsx
      invites/accept/page.tsx
    (app)/
      layout.tsx                    shell: SpaceProvider + rail + global bar
      page.tsx                      Home — unscoped landing (space list + create team)
      orgs/[id]/
        layout.tsx                  resolves active space from the route
        page.tsx                    Overview
        members/page.tsx
        invites/page.tsx
        settings/page.tsx
  components/
    shell/
      app-rail.tsx                  switcher + nav groups
      space-switcher.tsx            dropdown + role badge + create-team footer
      global-bar.tsx                breadcrumb chip, palette trigger, plan chip, avatar menu
      command-palette.tsx           ⌘K navigation palette
      breadcrumb-chip.tsx           DocuPulse › {Space}
      locked-nav-item.tsx           entitlement-locked row (no CTA)
    ui/                             sheet.tsx, tooltip.tsx, separator.tsx, sidebar.tsx (added)
  lib/
    spaces.tsx                      SpaceProvider + useSpaces() (single source of truth)
    use-mobile.ts                   pulled in by sidebar (if not already present)
```

## Code Style

Active space is always derived, never stored:

```tsx
// lib/spaces.tsx (excerpt) — route is the only owner of "where am I"
const params = useParams<{ id?: string }>();
const activeSpace = useMemo(
  () => spaces.find((s) => s.id === params?.id) ?? null,
  [spaces, params?.id],
);

// entitlements mirror the server rule in backend/src/entitlements/canInvite.ts
// (non-personal AND plan_name === "Org") — display only, never the enforcement point
const documentsUnlocked =
  activeSpace !== null && !activeSpace.isPersonal && activeSpace.planName === "Org";
```

- Client components use `"use client"`; the shell is a client layout, pages stay as they are.
- Tailwind utilities only, no inline styles; shell colors come from the existing `--sidebar-*` tokens (`app/globals.css:76–83`, `110–117`) — no new token definitions.
- Nav items are real `<a>`/`Link`s with `aria-current="page"` when active; locked items are `aria-disabled`, not links.
- Any error surface uses the existing `Alert`; any loading surface uses the existing `Skeleton` + `Button` retry.

## Data Contract (the one backend change)

`GET /api/organizations` today returns `{id, name, slug, isPersonal, planId}` — note `planId` is already exposed by `listOrganizationsForUser` (`backend/src/organizations/organizations.service.ts:108–124`) but the frontend's `Org` type drops it (`frontend/app/page.tsx:12`). The rail needs a **name**, not an id, plus the caller's role for the badge.

```ts
// backend/src/organizations/types.ts
export interface Organization { id; name; slug; isPersonal; planId }              // unchanged
export interface OrganizationForUser extends Organization {
  planName: string | null;   // plans.plan_name via LEFT JOIN
  role: string | null;       // role.slug for THIS user via the existing seats join
}
```

- `listOrganizationsForUser` returns `OrganizationForUser[]` by adding `LEFT JOIN "plans" p ON p."id" = o."id_plan"` and `LEFT JOIN "role" r ON r."id_role" = s."id_role"`.
- `getOrganizationById` / create paths return `Organization` unchanged (`role` is per-viewer and has no meaning there).
- Purely additive and back-compatible: `backend/tests/organizations.service.test.ts` asserts plan via raw SQL, not the endpoint shape, so existing tests stay green. One new case asserts `planName === "Free"` + `role === "owner"` for a fresh personal space and `planName === "Org"` for a created team.
- Effect: `/api/organizations` becomes one call that answers "which spaces, on what plan, in what role" — the rail, switcher badge, plan chip, and `canManage` all read from it. This also removes the email-matching hack at `frontend/app/orgs/[id]/page.tsx:34–37`.

## Shell Behavior

**Rail** (top → bottom): switcher with role badge → `Home` → *space group, only when a space is in the route* (`Overview`, `Members`, `Invites`, `Settings`) → `Documents` locked row → footer.

**Global bar** (left → right): `DocuPulse › {Space}` chip (space segment omitted on `/`) → ⌘K / Ctrl+K trigger → plan chip (`Free` / `Org`) → avatar menu (sign out lives here; the two duplicated sign-out buttons at `app/page.tsx:155–164` and `app/orgs/[id]/page.tsx:126–133` are removed).

**Unscoped `/` (Home):** the space list plus create-team entry, reusing the current page's approved `loading` / `unauth` / `error` / `ok` branches and the existing create-team dialog (`app/page.tsx:196–238`). Breadcrumb shows `DocuPulse` alone.

**Create team space** has exactly two entry points, both opening the one dialog mounted in the shell: the switcher dropdown's footer (Linear precedent, one click) and the Home page's empty state.

**Unauthenticated `/`:** the shell suppresses its chrome and `children` render bare, so the current front-door landing (`app/page.tsx:87–105`) survives unchanged. Rationale: the shell wraps the *product*; the front door stays bare.

**Unknown / foreign space id:** `orgs/[id]/layout.tsx` resolves `activeSpace` only from the viewer's own space list. No match → an honest "Space not found" `Alert` with a link to `/`. A non-member's space name must never reach the rail, breadcrumb, or palette.

**Palette scope:** navigates already-loaded data only — Home, each space, and the active space's sections, plus create-team. No backend search, no documents. `@base-ui/react/autocomplete` + `dialog` give combobox semantics, focus trap, Esc-to-close, and focus restore.

**Entitlement display:** `Documents` renders locked (aria-disabled, non-navigable, short reason from `aria-describedby`) when `activeSpace.isPersonal || activeSpace.planName !== "Org"`. The rule deliberately mirrors `canInvite.ts:11–15`. No upgrade button or link is rendered anywhere — billing does not exist, so a CTA would be a dead click.

## Testing Strategy

- **Primary gate:** `npm run build` (TypeScript + typed-route generation) and `npm run lint`.
- **Backend gate:** `npm test` stays green, plus the one new `OrganizationForUser` case above.
- **Manual smoke checklist** (no E2E harness exists; adding one is out of scope):
  1. Fresh signup → `/` shows Home; Personal space, plan chip `Free`, Documents locked.
  2. Create team space → `/orgs/{id}` → breadcrumb names it, chip reads `Org`, Documents unlocked, no upgrade CTA appears on any route.
  3. Rail switcher moves between personal and team space in one click; the bar + nav follow; reload on a space URL keeps that space (route-derived, nothing persisted).
  4. ⌘K opens, navigates to a space, a member, and settings; Esc closes and restores focus.
  5. Rail reads intentional at 1, 2, and 3 spaces.
  6. `/sign-in`, `/sign-up`, `/invites/accept` render with no rail/bar; the `router.replace` redirect at `app/orgs/[id]/page.tsx:45` still fires when signed out.
  7. Signed-out `/` still renders the landing.
- **No frontend unit tests:** the frontend has no test runner (`frontend/package.json` has no `test` script and no vitest). Adding one is a `ask first` boundary, not part of this slice.

## Boundaries

- **Always:** run `npm run build` + `npm run lint` (frontend) and `npm test` (backend) before merging; read `frontend/node_modules/next/dist/docs/` before writing Next-specific code (per `frontend/AGENTS.md` — this Next.js version differs from training data); derive the active space from the route; keep `credentials: "include"` on every fetch; preserve existing `Skeleton` / `Alert` / retry states.
- **Ask first:** adding shadcn components (`sidebar` pulls `separator`, `sheet`, `tooltip`, `use-mobile`) or any new dependency; changing any existing URL; adding anything to the `/api/organizations` response beyond `planName` + `role`; introducing a frontend test runner; adding a row for this work to `docs/CAPABILITY-MAP.md`.
- **Never:** persist a "current space" to localStorage, cookie, or DB; render an upgrade/billing CTA that leads nowhere; render placeholder rows, a notification bell, or a help menu to fill the chrome; render a locked row as a working link; show another org's name to a non-member; define new color tokens when `--sidebar-*` already exist.

## Success Criteria

1. `npm run build` succeeds with 0 TypeScript errors after the route-group move; `npm run lint` passes.
2. `/`, `/orgs/[id]`, `/orgs/[id]/members`, `/orgs/[id]/invites`, `/orgs/[id]/settings` all render inside the shell; `/sign-in`, `/sign-up`, `/invites/accept` do not.
3. Rail switcher switches spaces in one click and always reflects the route; no space state is written to any storage.
4. Breadcrumb reads `DocuPulse › {Space}` on space routes and `DocuPulse` on `/`.
5. Plan chip shows `Free` on a fresh personal space and `Org` on a created team space; backend `planName` is the source.
6. Documents is locked on a Free personal space and unlocked on an Org space; no upgrade CTA exists on any route.
7. ⌘K palette navigates Home, every space, and the active space's sections; keyboard-only operation works end to end.
8. All 8 manual smoke checks pass, including the signed-out `/` landing and the signed-out `/orgs/[id]` → `/sign-in?next=…` redirect.
9. `npm test` (backend) is green, including the new `OrganizationForUser` case.
10. Sign-out exists in exactly one place (avatar menu) with no regression to the redirect behavior.

## Not Doing (and Why)

- **GCP-style resource-picker modal** — ceremony at ≤3 spaces; implies scale the product does not have.
- **Org hierarchy, folders, per-resource IAM** — no such model in the schema or backend.
- **Backend search endpoint** — none exists; the palette navigates loaded data only.
- **Polar billing UI / upgrade flow** — no billing routes; the plan chip is a label, not a purchase.
- **Notification bell / help menu / theme toggle** — decorative chrome; nothing has asked for them.
- **The Documents feature itself** — the rail previews the slot; it stays locked this iteration.
- **Space-first full-page chooser** — mandatory click every visit; fights the app-wide layout.
- **Frontend test runner / E2E harness** — out of scope; manual checklist remains the contract.

## Assumptions (validated in this session — correct me if any is wrong)

1. **A sidebar primitive is available.** Confirmed: `sidebar` exists in the base-maia registry (`https://ui.shadcn.com/r/styles/base-maia/sidebar.json`). It declares `registryDependencies: button, input, separator, sheet, skeleton, tooltip, use-mobile` — the project has `button`, `input`, `skeleton`; the rest arrive with the add. `@base-ui/react/merge-props` and `use-render` are present in 1.9.0. **Known follow-up from that file:** it imports `IconPlaceholder` from `@/app/(create)/components/icon-placeholder` (a shadcn-internal path) which must be replaced with a real hugeicons icon; the CLI's import rewrite does not cover it.
2. **`SidebarProvider`'s `sidebar_state` cookie is not a violation** of the route-based tenant decision — it stores collapse state (chrome), not which space you are in (context).
3. **Route groups preserve URLs and typed routes.** Typed routes are generated into `frontend/.next/types/routes.d.ts` on build; today `LayoutRoutes = "/"`. The root layout keeps `LayoutProps<"/">`. The new `(app)/layout.tsx` will be typed plainly as `{ children: React.ReactNode }` rather than through the generated helper, because a group layout's generated layout-route key is not something I want the build to be the first thing to discover.
4. **`planId` is already on the wire**, contrary to the idea doc's claim that `/api/organizations` exposes no plan field — it is dropped by the frontend `Org` type, not by the backend. We still add `planName`, since rendering a truthful label from a plan id would mean hard-coding the id→name mapping client-side.
5. **Locked-by-entitlement is credible without billing.** `canInvite.ts` gates on `plan_name === "Org"` and never touches Polar, so the gate itself is real; only the purchase path is missing, which is why no CTA is rendered.
6. **`cacheComponents: true` and `partialPrefetching: true`** are already on in `frontend/next.config.ts`; the shell stays a client component reading from `useParams`/`usePathname`, which is compatible. Anything touching `useSearchParams` stays inside a `Suspense` boundary as the existing pages already do.

## Resolved Decisions (this session)

1. **Signed-out `/` keeps the public landing.** The shell renders bare when there is no session; no redirect to `/sign-in`, no new route.
2. **Members / Invites / Settings become real routes.** Today's single `orgs/[id]/page.tsx` (169 lines, member and invite sections) splits into `/orgs/[id]/members`, `/orgs/[id]/invites`, `/orgs/[id]/settings`, with `/orgs/[id]` as the space Overview. Every rail item navigates; `Documents` stays the only locked row.
3. **Create team space lives in the switcher footer and the Home empty state**, both opening one dialog mounted in the shell.
4. **`role` ships with `planName`.** `/api/organizations` returns `OrganizationForUser` (`planName`, `role`); the role powers the switcher badge and replaces the email-matching `canManage` hack at `frontend/app/orgs/[id]/page.tsx:34–37`.

