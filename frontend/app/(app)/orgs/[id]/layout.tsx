"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useActiveSpace, useSpaces } from "@/lib/spaces";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Resolves the space named in the route against the viewer's own space list
 * before any page renders. A space id that is unknown *or* belongs to someone
 * else is the same outcome — "Space not found" — so a non-member's space name
 * can never leak into the rail, breadcrumb, or palette.
 *
 * `usePathname` (via `useActiveSpace`) suspends for `/orgs/[id]` under
 * `cacheComponents`, so the gate lives inside its own Suspense boundary.
 */
export default function SpaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<SpaceSkeleton />}>
      <SpaceGate>{children}</SpaceGate>
    </Suspense>
  );
}

function SpaceGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, reload } = useSpaces();
  const { activeSpaceId, activeSpace } = useActiveSpace();

  useEffect(() => {
    if (status === "unauth") {
      const next = activeSpaceId ? `/orgs/${activeSpaceId}` : "/";
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
    }
  }, [status, activeSpaceId, router]);

  if (status === "unauth") {
    return null;
  }

  if (status === "loading") {
    return <SpaceSkeleton />;
  }

  if (status === "error") {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-8">
        <Alert variant="destructive">
          <AlertDescription>
            We couldn’t load your spaces.
          </AlertDescription>
        </Alert>
        <Button onClick={reload} variant="outline">
          Retry
        </Button>
      </main>
    );
  }

  if (!activeSpace) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <Alert>
          <AlertTitle>Space not found</AlertTitle>
          <AlertDescription>
            This space doesn’t exist, or you don’t have access to it.{" "}
            <Link href="/">Back to Home</Link>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return <>{children}</>;
}

function SpaceSkeleton() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
    </main>
  );
}
