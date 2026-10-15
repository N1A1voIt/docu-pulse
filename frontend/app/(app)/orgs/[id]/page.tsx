"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberList } from "@/components/member-list";
import { InviteList } from "@/components/invite-list";
import { InviteDialog } from "@/components/invite-dialog";

interface Org { id: string; name: string; slug: string; isPersonal: boolean }
interface MemberItem { id?: string; seatId?: string; email?: string; name?: string; role?: string; user?: { id?: string; email?: string; name?: string } }
interface InviteItem { id: string; invitedEmail: string; role: string; acceptedAt?: string | null; revokedAt?: string | null }

function OrgPageContent() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const router = useRouter();
  const [session, setSession] = useState<{ user?: { email?: string | null } } | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const currentOrg = orgs.find((o) => o.id === id);

  const currentMember = members.find(
    (m) => m.email === session?.user?.email || m.user?.email === session?.user?.email,
  );
  const canManage = currentMember?.role === "owner" || currentMember?.role === "admin";

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await authClient.getSession();
      if (!data?.user) {
        router.replace(`/sign-in?next=${encodeURIComponent(`/orgs/${id}`)}`);
        return;
      }
      setSession(data);
      const resOrgs = await apiFetch("/api/organizations");
      if (!resOrgs.ok) throw new Error("Failed to load spaces");
      const o = await resOrgs.json();
      setOrgs(o);
      const resMembers = await apiFetch(`/api/organizations/${id}/members`);
      if (resMembers.ok) setMembers(await resMembers.json());
      const resInvites = await apiFetch(`/api/organizations/${id}/invites`);
      if (resInvites.ok) setInvites(await resInvites.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      if (id) await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleInvite(email: string, role: string) {
    const res = await apiFetch(`/api/organizations/${id}/invites`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message ?? body?.error ?? "Invite failed");
    }
    await load();
  }

  async function handleRevoke(inviteId: string) {
    setRevokeError(null);
    try {
      const res = await apiFetch(`/api/organizations/${id}/invites/${inviteId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? body?.error ?? "Failed to revoke invite");
      }
      await load();
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : "Failed to revoke invite");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => void load()} className="mt-3">Retry</Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{currentOrg?.name ?? "Space"}</h1>
          <p className="text-xs text-muted-foreground">{currentOrg?.slug} · {currentOrg?.isPersonal ? "Personal" : "Team"}</p>
        </div>
      </div>

      <section>
        <h2 className="text-xl font-medium mb-3">Members</h2>
        <MemberList members={members} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-medium">Invites</h2>
          {canManage && <Button onClick={() => setShowInvite(true)}>Invite member</Button>}
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
      </section>

      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} onSubmit={handleInvite} />
    </main>
  );
}

export default function OrgPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <OrgPageContent />
    </Suspense>
  );
}