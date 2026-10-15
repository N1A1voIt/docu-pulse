"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  File02Icon,
  Home01Icon,
  Layout01Icon,
  Mail01Icon,
  Settings01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";

import { useActiveSpace } from "@/lib/spaces";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SpaceSwitcher } from "./space-switcher";
import { LockedNavItem } from "./locked-nav-item";

type IconElement = React.ComponentProps<typeof HugeiconsIcon>["icon"];

interface RailSection {
  href: string;
  label: string;
  icon: IconElement;
  /** Only the Overview route is an exact match; the rest own their subtree. */
  exact?: boolean;
}

function isSectionActive(
  pathname: string | null,
  href: string,
  exact: boolean,
): boolean {
  if (!pathname) return false;
  return exact ? pathname === href : pathname.startsWith(href);
}

/**
 * The rail: space switcher (with the caller's role badge) → Home → the active
 * space's sections (only when a space is in the route) → the entitlement-
 * locked Documents row. Everything reads the route through `useActiveSpace`,
 * so the rail can never disagree with the URL.
 */
export function AppRail({ onCreateSpace }: { onCreateSpace?: () => void }) {
  const pathname = usePathname();
  const { activeSpace, documentsUnlocked } = useActiveSpace();

  const sections: RailSection[] = activeSpace
    ? [
        {
          href: `/orgs/${activeSpace.id}`,
          label: "Overview",
          icon: Layout01Icon,
          exact: true,
        },
        {
          href: `/orgs/${activeSpace.id}/members`,
          label: "Members",
          icon: UserMultiple02Icon,
        },
        {
          href: `/orgs/${activeSpace.id}/invites`,
          label: "Invites",
          icon: Mail01Icon,
        },
        {
          href: `/orgs/${activeSpace.id}/settings`,
          label: "Settings",
          icon: Settings01Icon,
        },
      ]
    : [];

  const homeActive = pathname === "/";

  return (
    <Sidebar aria-label="Workspace navigation">
      <SidebarHeader>
        <SpaceSwitcher onCreateSpace={onCreateSpace} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/" />}
                  isActive={homeActive}
                  aria-current={homeActive ? "page" : undefined}
                >
                  <HugeiconsIcon icon={Home01Icon} strokeWidth={2} />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {activeSpace && (
          <SidebarGroup>
            <SidebarGroupLabel>Space</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sections.map((section) => {
                  const active = isSectionActive(
                    pathname,
                    section.href,
                    Boolean(section.exact),
                  );
                  return (
                    <SidebarMenuItem key={section.href}>
                      <SidebarMenuButton
                        render={<Link href={section.href} />}
                        isActive={active}
                        aria-current={active ? "page" : undefined}
                      >
                        <HugeiconsIcon icon={section.icon} strokeWidth={2} />
                        <span>{section.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {documentsUnlocked ? (
                // Entitlement met: not locked. The Documents feature does not
                // exist yet, so this is a preview row, never a working link.
                <SidebarMenuItem>
                  <SidebarMenuButton render={<span />}>
                    <HugeiconsIcon icon={File02Icon} strokeWidth={2} />
                    <span>Documents</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <LockedNavItem
                  icon={File02Icon}
                  label="Documents"
                  reason="Documents unlock on a team space with the Org plan."
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
