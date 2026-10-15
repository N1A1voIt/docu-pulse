"use client";

import Link from "next/link";

import { useSpaces } from "@/lib/spaces";
import { useCreateSpace } from "@/components/shell/create-space-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home — the unscoped landing. It reads the spaces the shell already loaded
 * (one `/api/organizations` call, no local fetch) and keeps the public
 * front-door landing for signed-out visitors. Create-team is opened from the
 * one dialog mounted in the shell.
 */
export default function Home() {
  const { status, error, spaces, reload } = useSpaces();
  const { open: openCreateSpace } = useCreateSpace();

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  if (status === "unauth") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-semibold">DocuPulse</h1>
        <p className="max-w-sm text-gray-600">
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

  if (status === "error") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 py-8 text-center">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "Failed to load"}</AlertDescription>
        </Alert>
        <Button onClick={reload} type="button" variant="outline">
          Retry
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Your spaces</h1>
        <p className="text-sm text-muted-foreground">
          Pick a space to work in, or create a team space for others to join.
        </p>
      </div>

      <section aria-labelledby="spaces-heading">
        <h2 id="spaces-heading" className="mb-3 text-xl font-medium">
          Spaces
        </h2>
        {spaces.length === 0 ? (
          <Alert>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>
                No spaces yet — your personal space is still being provisioned.
              </span>
              <Button type="button" variant="outline" onClick={openCreateSpace}>
                Create team space
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3">
            {spaces.map((space) => (
              <Link
                key={space.id}
                href={`/orgs/${space.id}`}
                className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Card className="transition-colors hover:bg-accent/50">
                  <CardHeader>
                    <CardTitle>{space.name}</CardTitle>
                    <CardDescription>
                      {space.slug} · {space.isPersonal ? "Personal" : "Team"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {spaces.length > 0 && (
        <section aria-labelledby="teams-heading">
          <h2 id="teams-heading" className="mb-3 text-xl font-medium">
            Teams
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Create a team space to collaborate with others.
          </p>
          <Button type="button" variant="outline" onClick={openCreateSpace}>
            Create team space
          </Button>
        </section>
      )}
    </main>
  );
}
