"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { LockIcon } from "@hugeicons/core-free-icons";
import { useId } from "react";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type IconElement = React.ComponentProps<typeof HugeiconsIcon>["icon"];

/**
 * A non-navigable rail row that looks locked for a real reason. It stays
 * focusable (`aria-disabled`, not `disabled`) so the reason reaches assistive
 * tech through `aria-describedby` — a `disabled` button is skipped entirely.
 */
export function LockedNavItem({
  icon,
  label,
  reason,
  className,
}: {
  icon: IconElement;
  label: string;
  reason: string;
  className?: string;
}) {
  const reasonId = useId();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-disabled="true"
        aria-describedby={reasonId}
        className={cn("cursor-not-allowed hover:bg-transparent", className)}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} />
        <span>{label}</span>
        <HugeiconsIcon
          icon={LockIcon}
          strokeWidth={2}
          className="ml-auto size-3.5 text-sidebar-foreground/40"
          aria-hidden="true"
        />
      </SidebarMenuButton>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </SidebarMenuItem>
  );
}
