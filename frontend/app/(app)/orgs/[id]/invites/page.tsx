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
type Failed = { spaceId: string; message: string };

/**
 * The space's invitations, plus the invite dialog and revoke action.
 *
 * `canManage` (owner/admin) comes from the caller's `role` in the one
 * `/api/organizations` response — never from matching the viewer's email against
 * the member list. Actually creating an invite is additionally gated server-side
 * by `canInvite` (non-personal space on the Org plan); `documentsUnlocked`
 * mirrors that same rule, so the button is only offered when the server would
 * accept it.
 */
export default function InvitesPage() {
  const { activeSpace, documentsUnlocked } = useActiveSpace();
  const id = activeSpace?.id ?? "";
  const canManage =
    activeSpace?.role === "owner" || activeSpace?.role === "admin";
  const canInvite = canManage && documentsUnlocked;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [revokeError, setRevokeError] = useState<Failed | null>(null);
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
          spaceId: id,
          message:
            err instanceof Error ? err.message : "Failed to load invites",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const state =
    failed?.spaceId === id
      ? "error"
      : loaded?.spaceId === id
        ? "ok"
        : "loading";

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
        throw new Error(
          body?.message ?? body?.error ?? "Failed to revoke invite",
        );
      }
      setAttempt((n) => n + 1);
    } catch (err) {
      setRevokeError({
        spaceId: id,
        message:
          err instanceof Error ? err.message : "Failed to revoke invite",
      });
    }
  }

  function retry() {
    setFailed(null);
    setAttempt((n) => n + 1);
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
        <Button onClick={retry} variant="outline">
          Retry
        </Button>
      </main>
    );
  }

  const invites = loaded?.invites ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invites</h1>
          <p className="text-sm text-muted-foreground">
            Invitations to {activeSpace?.name}.
          </p>
        </div>
        {canInvite ? (
          <Button onClick={() => setShowInvite(true)}>Invite member</Button>
        ) : canManage ? (
          <p className="max-w-56 text-right text-sm text-muted-foreground">
            Invites unlock on a team space with the Org plan.
          </p>
        ) : null}
      </div>

      {revokeError?.spaceId === id && (
        <Alert variant="destructive">
          <AlertDescription>{revokeError.message}</AlertDescription>
        </Alert>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invites yet.</p>
      ) : (
        <InviteList
          invites={invites}
          onRevoke={handleRevoke}
          canRevoke={canManage}
        />
      )}

      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSubmit={handleInvite}
      />
    </main>
  );
}
