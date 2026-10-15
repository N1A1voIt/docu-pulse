"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { LogOutIcon } from "@hugeicons/core-free-icons";

import { authClient } from "@/lib/auth-client";
import { useActiveSpace, useSpaces } from "@/lib/spaces";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BreadcrumbChip } from "./breadcrumb-chip";

/**
 * The global bar: breadcrumb (left), then the space's plan chip and the avatar
 * menu (right). The ⌘K palette trigger is added by Task 12; sign-out lives in
 * exactly one place — this avatar menu — and nowhere else in the product.
 */
export function GlobalBar() {
  const { activeSpace } = useActiveSpace();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <BreadcrumbChip />
      <div className="ml-auto flex items-center gap-3">
        {activeSpace?.planName && <PlanChip plan={activeSpace.planName} />}
        <AvatarMenu />
      </div>
    </header>
  );
}

function PlanChip({ plan }: { plan: string }) {
  return (
    <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {plan}
    </span>
  );
}

function AvatarMenu() {
  const { user } = useSpaces();

  const displayName = user?.name ?? user?.email ?? "Account";
  const initial = displayName.trim().charAt(0).toUpperCase();

  async function handleSignOut() {
    await authClient.signOut();
    window.location.replace("/sign-in");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none ring-ring focus-visible:ring-2">
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full object-cover ring-1 ring-foreground/10"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-1 ring-foreground/10"
          >
            {initial}
          </span>
        )}
        <span className="sr-only">Account menu</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-52">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">
            {user?.name ?? "Signed in"}
          </p>
          {user?.email && (
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <HugeiconsIcon icon={LogOutIcon} strokeWidth={2} />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
