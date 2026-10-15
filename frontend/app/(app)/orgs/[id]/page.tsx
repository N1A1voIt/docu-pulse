"use client";

import { useActiveSpace } from "@/lib/spaces";

/**
 * The space Overview. Members and Invites are their own routes now; this page
 * is the landing for a space and reads its identity from the single
 * `/api/organizations` response via `useActiveSpace` (never a second fetch).
 */
export default function OverviewPage() {
  const { activeSpace } = useActiveSpace();

  if (!activeSpace) return null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{activeSpace.name}</h1>
        <p className="text-xs text-muted-foreground">
          {activeSpace.slug} · {activeSpace.isPersonal ? "Personal" : "Team"}
        </p>
      </div>
    </main>
  );
}
