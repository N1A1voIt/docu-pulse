"use client";

import { roleLabel, useActiveSpace } from "@/lib/spaces";
import { SpaceFact } from "@/components/shell/space-fact";

/**
 * Space settings. Read-only for now: the backend exposes no update endpoint for
 * an organization, so this renders the space's facts and says so plainly rather
 * than showing controls that lead nowhere.
 */
export default function SettingsPage() {
  const { activeSpace } = useActiveSpace();

  if (!activeSpace) return null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Details for {activeSpace.name}.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <SpaceFact label="Space name" value={activeSpace.name} />
        <SpaceFact label="URL slug" value={activeSpace.slug} />
        <SpaceFact
          label="Space type"
          value={activeSpace.isPersonal ? "Personal" : "Team"}
        />
        <SpaceFact label="Plan" value={activeSpace.planName ?? "Unknown"} />
        <SpaceFact label="Your role" value={roleLabel(activeSpace.role)} />
      </dl>

      <p className="text-sm text-muted-foreground">
        Editing space settings isn’t available yet.
      </p>
    </main>
  );
}
