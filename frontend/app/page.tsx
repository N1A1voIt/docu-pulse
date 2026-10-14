"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";

interface Org {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
}

type LoadState = "loading" | "ok" | "error" | "unauth";

export default function Home() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [session, setSession] = useState<null | { user?: { name?: string | null; email?: string | null; image?: string | null } }>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function load() {
    setErrorMsg(null);
    try {
      const { data } = await authClient.getSession();
      if (!data?.user) {
        setLoadState("unauth");
        return;
      }
      setSession(data);
      const res = await apiFetch("/api/organizations");
      if (!res.ok) {
        throw new Error(`Failed to load spaces (${res.status})`);
      }
      setOrgs(await res.json());
      setLoadState("ok");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load");
      setLoadState("error");
    }
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  if (loadState === "loading") {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  if (loadState === "unauth") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <h1 className="text-3xl font-semibold">DocuPulse</h1>
        <p className="text-gray-600 max-w-sm">
          Every account starts with a free personal space. Create one in a few
          seconds.
        </p>
        <div className="flex gap-3">
          <a className="underline" href="/sign-in">
            Sign in
          </a>
          <a className="underline" href="/sign-up">
            Sign up
          </a>
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6 max-w-md mx-auto">
        <Alert variant="destructive">
          <AlertDescription>{errorMsg ?? "Failed to load"}</AlertDescription>
        </Alert>
        <Button
          onClick={() => {
            setLoadState("loading");
            void load();
          }}
          type="button"
          variant="outline"
        >
          Retry
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt={session.user.name ?? session.user.email ?? "User avatar"}
              className="size-8 rounded-full object-cover ring-1 ring-foreground/10"
              width={32}
              height={32}
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-1 ring-foreground/10"
            >
              {(session?.user?.name ?? session?.user?.email ?? "?")
                .trim()
                .charAt(0)
                .toUpperCase()}
            </span>
          )}
          <h1 className="text-2xl font-semibold">
            Welcome, {session?.user?.name ?? session?.user?.email}
          </h1>
        </div>
        <button
          className="text-sm underline"
          type="button"
          onClick={async () => {
            await authClient.signOut();
            window.location.replace("/sign-in");
          }}
        >
          Sign out
        </button>
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-medium mb-3">Your spaces</h2>
        {orgs.length === 0 ? (
          <Alert>
            <AlertDescription>
              No spaces yet — your personal space is still being provisioned.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3">
            {orgs.map((org) => (
              <Card key={org.id}>
                <CardHeader>
                  <CardTitle>{org.name}</CardTitle>
                  <CardDescription>
                    {org.slug} · {org.isPersonal ? "Personal" : "Team"}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-medium mb-3">Teams</h2>
        <Button
          type="button"
          variant="outline"
          disabled
          title="Team creation arrives with billing in the next iteration."
        >
          Create team space (coming with billing)
        </Button>
        <p className="text-xs text-gray-500 mt-2">
          Multi-seat organizations require a Polar subscription, which ships in
          the next module.
        </p>
      </section>
    </main>
  );
}
