"use client";

import { Suspense } from "react";
import { SpaceProvider, useSpaces } from "@/lib/spaces";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppRail } from "@/components/shell/app-rail";
import { GlobalBar } from "@/components/shell/global-bar";

/**
 * Shell layout for the product surface (everything the authenticated user
 * works in). Auth pages live under `(auth)`, so they are never wrapped.
 *
 * Typed plainly as `{ children }` rather than the generated `LayoutProps<"/">`
 * helper: a route group's generated layout-route key is not something the build
 * should be the first to discover (see plan Architecture Decisions).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SpaceProvider>
      <Shell>{children}</Shell>
    </SpaceProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { status } = useSpaces();

  // No session yet, or none at all: render the surface bare so the public
  // landing keeps its own chrome and no shell ever flashes in then out.
  // Suppressing on "loading" too is what avoids the flash.
  if (status !== "ok") {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <Suspense fallback={null}>
        <AppRail />
      </Suspense>
      {/*
        A plain div, not `SidebarInset` (which renders `<main>`): the pages
        still own their own `<main>` landmark until the Phase 3 route split, and
        two nested `<main>`s is invalid HTML.
      */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <GlobalBar />
        </Suspense>
        {children}
      </div>
    </SidebarProvider>
  );
}
