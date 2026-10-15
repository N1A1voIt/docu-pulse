"use client";

import { roleLabel, useActiveSpace } from "@/lib/spaces";
import { SpaceFact } from "@/components/shell/space-fact";

/**
 * The space Overview — an at-a-glance view of the space you are in. Identity,
 * plan and the caller's role all come from the single `/api/organizations`
 * response via `useActiveSpace` (never a second fetch).
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

      <dl className="grid gap-3 sm:grid-cols-2">
        <SpaceFact label="Plan" value={activeSpace.planName ?? "Unknown"} />
        <SpaceFact label="Your role" value={roleLabel(activeSpace.role)} />
      </dl>
    </main>
  );
}
