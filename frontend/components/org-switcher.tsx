"use client";

import { useRouter } from "next/navigation";

interface Org { id: string; name: string }

export function OrgSwitcher({ orgs, currentId }: { orgs: Org[]; currentId: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Switch space"
      value={currentId}
      onChange={(e) => router.push(`/orgs/${e.target.value}`)}
      className="rounded-md border px-2 py-1 text-sm"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}