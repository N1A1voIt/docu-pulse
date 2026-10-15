"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  PlusSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { roleLabel, useActiveSpace, useSpaces } from "@/lib/spaces";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  return (
    <span className="shrink-0 rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-sidebar-accent-foreground uppercase">
      {roleLabel(role)}
    </span>
  );
}

/**
 * Space switcher: one click moves between spaces, and the trigger always
 * reflects the route (never a stored selection). `onCreateSpace` is wired by
 * the shell in Task 11; without it the footer entry is not rendered, so no
 * dead click ships in the meantime.
 */
export function SpaceSwitcher({
  onCreateSpace,
}: {
  onCreateSpace?: () => void;
}) {
  const { spaces } = useSpaces();
  const { activeSpace } = useActiveSpace();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-none ring-sidebar-ring transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 aria-expanded:bg-sidebar-accent",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">
            {activeSpace?.name ??
              (spaces.length > 0 ? "Select a space" : "No spaces yet")}
          </span>
          {activeSpace && (
            <span className="truncate text-xs text-muted-foreground">
              {activeSpace.isPersonal ? "Personal space" : "Team space"}
            </span>
          )}
        </span>
        {activeSpace && <RoleBadge role={activeSpace.role} />}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Spaces</DropdownMenuLabel>
          {spaces.map((space) => {
            const isActive = space.id === activeSpace?.id;
            return (
              <DropdownMenuItem
                key={space.id}
                render={<Link href={`/orgs/${space.id}`} />}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{space.name}</span>
                <RoleBadge role={space.role} />
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        {onCreateSpace && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateSpace}>
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              <span>Create team space</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
