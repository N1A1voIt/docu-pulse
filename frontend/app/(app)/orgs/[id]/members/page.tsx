"use client";

import { useEffect, useState } from "react";

import { useActiveSpace } from "@/lib/spaces";
import { apiFetch } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberList, type Member } from "@/components/member-list";

/** Load result is tagged with the space id so switching spaces never shows stale rows. */
type Loaded = { id: string; members: Member[] };
type Failed = { id: string; message: string };

/**
 * The space's member list. Space identity and membership are already resolved
 * by `orgs/[id]/layout.tsx` (the route is the only owner of "where am I"), so
 * this page reads the active space from `useSpaces` rather than refetching
 * `/api/organizations`.
 */
export default function MembersPage() {
  const { activeSpace } = useActiveSpace();
  const id = activeSpace?.id ?? "";

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch(`/api/organizations/${id}/members`);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load members (${res.status})`);
        const members = (await res.json()) as Member[];
        setLoaded({ id, members });
        setFailed(null);
      } catch (err) {
        if (cancelled) return;
        setFailed({
          id,
          message: err instanceof Error ? err.message : "Failed to load members",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const state = failed?.id === id ? "error" : loaded?.id === id ? "ok" : "loading";

  if (state === "loading") {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 p-8">
        <Alert variant="destructive">
          <AlertDescription>
            {failed?.message ?? "Failed to load members"}
          </AlertDescription>
        </Alert>
        <Button
          onClick={() => {
            setFailed(null);
            setAttempt((n) => n + 1);
          }}
          variant="outline"
        >
          Retry
        </Button>
      </main>
    );
  }

  const members = loaded?.members ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">
          People with access to {activeSpace?.name}.
        </p>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <MemberList members={members} />
      )}
    </main>
  );
}
