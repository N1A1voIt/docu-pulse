"use client";

export interface Member {
  id?: string;
  seatId?: string;
  userId?: string;
  email: string;
  name: string;
  role: string;
  user?: { id: string; email: string; name: string };
}

export function MemberList({ members }: { members: Member[] }) {
  return (
    <ul className="grid gap-2">
      {members.map((m) => (
        <li key={m.seatId ?? m.id ?? m.email} className="rounded-md border p-3">
          <div className="font-medium">{m.name || m.user?.name || m.email}</div>
          <div className="text-xs text-muted-foreground">{m.email || m.user?.email} · {m.role}</div>
        </li>
      ))}
    </ul>
  );
}