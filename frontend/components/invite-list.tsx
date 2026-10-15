"use client";

export interface Invite {
  id: string;
  invitedEmail: string;
  role: string;
  createdAt?: string;
  expiresAt?: string;
  revokedAt?: string | null;
  acceptedAt?: string | null;
}

export function InviteList({
  invites,
  onRevoke,
  canRevoke = true,
}: {
  invites: Invite[];
  onRevoke: (id: string) => void;
  canRevoke?: boolean;
}) {
  return (
    <ul className="grid gap-2">
      {invites.map((inv) => (
        <li key={inv.id} className="rounded-md border p-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">{inv.invitedEmail}</div>
            <div className="text-xs text-muted-foreground">
              {inv.role} · {inv.acceptedAt ? "accepted" : inv.revokedAt ? "revoked" : "pending"}
            </div>
          </div>
          {canRevoke && !inv.acceptedAt && !inv.revokedAt && (
            <button type="button" className="text-sm underline" onClick={() => onRevoke(inv.id)}>
              Revoke
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}