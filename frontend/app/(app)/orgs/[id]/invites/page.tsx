"use client";

import { useEffect, useState } from "react";

import { useActiveSpace } from "@/lib/spaces";
import { apiFetch } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InviteList, type Invite } from "@/components/invite-list";
import { InviteDialog } from "@/components/invite-dialog";

/** Load result is tagged with the space id so switching spaces never shows stale rows. */
type Loaded = { spaceId: string; invites: Invite[] };
type Failed = { id: string; message: string };

/**
 * The space's pending invitations, plus the invite dialog and revoke action.
 * `canManage` is driven by the caller's `role` from the one
 * `/api/organizations` response — never by matching the viewer's email against
 * the member list.
 */
export default function InvitesPage() {
  const { activeSpace } = useActiveSpace();
  const id = activeSpace?.id ?? "";
  const canManage = activeSpace?.role === "owner" || activeSpace?.role === "admin";

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch(`/api/organizations/${id}/invites`);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load invites (${res.status})`);
        const invites = (await res.json()) as Invite[];
        setLoaded({ spaceId: id, invites });
        setFailed(null);
      } catch (err) {
        if (cancelled) return;
        setFailed({
          id,
          message: err instanceof Error ? err.message : "Failed to load invites",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const state =
    failed?.id === id ? "error" : loaded?.spaceId === id ? "ok" : "loading";

  async function handleInvite(email: string, role: string) {
    const res = await apiFetch(`/api/organizations/${id}/invites`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message ?? body?.error ?? "Invite failed");
    }
    setAttempt((n) => n + 1);
  }

  async function handleRevoke(inviteId: string) {
    setRevokeError(null);
    try {
      const res = await apiFetch(
        `/api/organizations/${id}/invites/${inviteId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? body?.error ?? "Failed to revoke invite");
      }
      setAttempt((n) => n + 1);
    } catch (err) {
      setRevokeError(
        err instanceof Error ? err.message : "Failed to revoke invite",
      );
    }
  }

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
            {failed?.message ?? "Failed to load invites"}
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

  const invites = loaded?.invites ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invites</h1>
          <p className="text-sm text-muted-foreground">
            Pending invitations to {activeSpace?.name}.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowInvite(true)}>Invite member</Button>
        )}
      </div>

      {revokeError && (
        <Alert variant="destructive">
          <AlertDescription>{revokeError}</AlertDescription>
        </Alert>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invites yet.</p>
      ) : (
        <InviteList invites={invites} onRevoke={handleRevoke} />
      )}

      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSubmit={handleInvite}
      />
    </main>
  );
}
