# App Shell UX (OpenAI Rail + GCP Global Bar)

## Problem Statement
How might we give DocuPulse a persistent, app-wide workspace shell — an OpenAI-style
sidebar rail plus a GCP-style global bar — that reads as a real product for a user who
today has one personal space, no documents, and no teammates, without inventing scale
(a project-picker modal) or fake content to fill the chrome?

## Recommended Direction
Direction **B — "Two jobs, two mechanisms"**, with Direction C's honesty applied as a
constraint rather than as a separate build.

**Rail (top → bottom):** space switcher dropdown with role badge (Linear/Slack
precedent), then space-scoped nav — Home, Members, Invites, Settings, and a Documents
row locked by *real* entitlement. The active space is derived from the route and never
persisted, preserving the decision already recorded in `docs/ideas/org-team-invites.md`
("Tenant context stays route-based... no persisted 'current org' column that could
desync across devices").

**Global bar:** a `DocuPulse › {Space}` breadcrumb chip on the left carrying GCP's
visual grammar, then a ⌘K palette, a plan chip (Free/Org), and an avatar menu on the
right. Every top-bar element is backed by data that exists today: the plan label comes
from `plans` via `organizations.id_plan` (`organizations.service.ts:13,52`), and the
palette navigates already-loaded spaces, members, and settings.

**Why B and not A.** The GCP resource-picker modal exists to tame hundreds of projects,
nested folders, and per-resource IAM. With ≤3 spaces it signals a scale DocuPulse does
not have. What is worth borrowing from GCP is the visual grammar — the chip, the
`Org › Resource` breadcrumb, search-in-the-bar, restrained density — not the modal.
Hierarchy is expressed by the breadcrumb and the rail, which cost one click instead of
two.

**Why the rail switcher and the palette are not duplication.** They are given distinct
jobs: the rail switcher handles the common case (*between* spaces, one click, visible
context), the palette handles *anywhere* (jump to a space, a member, or settings without
returning to the rail). Both must read the active space from the route — neither owns it.

**Shell placement.** A route group keeps auth pages bare: `app/(app)/` is wrapped by the
shell layout, `app/(auth)/` is left alone. `/`, `/orgs/[id]`, and future document pages
inherit the shell; `/sign-in`, `/sign-up`, and `/invites/accept` do not.

## Key Assumptions to Validate
- [ ] **A sidebar primitive is available** — check the installed shadcn registry and `@base-ui/react` before choosing hand-roll vs. CLI add. *Test:* inspect `node_modules/shadcn` / registry; if absent, re-scope the rail to a hand-built `aside`.
- [ ] **Route groups preserve URLs and typed routes** — read the Next 16 file-conventions route-groups doc under `frontend/node_modules/next/dist/docs/01-app/`, then `npm run build`. *Risk:* `LayoutProps<"/">` in `app/layout.tsx:25` may need regeneration.
- [ ] **A truthful plan label can reach the frontend** — `/api/organizations` does not currently expose a plan field (the `Org` type in `app/page.tsx:12` is `{id, name, slug, isPersonal}`). *Test:* add `planName`, verify Free on a fresh signup and Org on a created team.
- [ ] **Locked-by-entitlement is credible without billing** — `canInvite.ts` gates on `plan_name === "Org"` and never checks Polar, so gating itself is real; but there are no billing routes, so any "upgrade" CTA leads nowhere. *Test:* a Free personal space shows Documents locked, an Org space does not, and no upgrade CTA is rendered.
- [ ] **A rail with 1–3 spaces looks intentional** — walkthrough at 1, 2, and 3 spaces.
- [ ] **⌘K earns its place at this data volume** — the palette would serve ~5 rows today. *Test:* go/no-go after it navigates spaces + members + settings.
- [ ] **Auth pages do not regress** — after the move, visual pass on `/sign-in`, `/sign-up`, and `/invites/accept`, including the `router.replace` redirect at `app/orgs/[id]/page.tsx:45`.

## MVP Scope
**In:**
- Route groups `app/(app)/` and `app/(auth)/`; shell layout wrapping only `(app)`.
- Shell layout: rail + global bar, built from the **unused `--sidebar-*` tokens already in `globals.css`** (lines 76–83, 110–117).
- Rail: space switcher with role badge, space-scoped nav (Home, Members, Invites, Settings), entitlement-locked Documents row.
- Global bar: breadcrumb chip, ⌘K navigation palette, plan chip, avatar menu.
- Home becomes the un-scoped landing that resolves into a space.
- Existing `Skeleton` / `Alert` / retry states preserved from the current pages.

**Out:** everything in "Not Doing".

## Not Doing (and Why)
- **GCP-style resource-picker modal** — ceremony at ≤3 spaces; it implies scale the product does not have.
- **Org hierarchy, folders, per-resource IAM** — no such model in the schema or the backend.
- **Backend search endpoint** — none exists; the palette navigates already-loaded data only.
- **Polar billing UI / upgrade flow** — no billing routes exist; the plan chip is a label, not a purchase.
- **Notification bell / help menu** — decorative chrome, which the "substantive navbar" choice rejected.
- **The Documents feature itself** — the rail previews the slot; it stays locked this iteration.
- **Space-first landing screen** (the Slack/Notion full-page chooser) — adds a mandatory click every visit and fights the app-wide layout decision.
- **Theme toggle** — the dark tokens exist, but nothing has asked for a switch.

## Open Questions
- Does the rail own space switching, or the palette — and how is state duplication prevented in practice?
- What does home show once the user *is* scoped to a space, given there are still no documents?
- Where does "Create team space" live now — rail, palette, or the switcher dropdown?
- Which rail items are real routes today vs. locked placeholders?
- Restructure route groups first (isolated, verifiable), or build the shell first (visible sooner)? — *answered: route groups first.*

## Resolved Decisions (this session)
1. Target user = the builder plus the first few testers; **credibility** ("looks like a real product") is the primary success criterion.
2. Shell is **app-wide**, not home-page-only.
3. The rail shows **spaces plus reserved future sections**, with reserved sections gated by real entitlement rather than rendered as grayed-out vaporware.
4. The navbar's right side is **substantive**: ⌘K search + plan chip, not decorative buttons.
5. The route tree **will** be restructured into `(app)` / `(auth)` route groups.
6. Direction **B** chosen over the faithful GCP shell (A) and the teammate trust shell (C).
7. First implementation slice = **route groups first**, before any shell exists.
