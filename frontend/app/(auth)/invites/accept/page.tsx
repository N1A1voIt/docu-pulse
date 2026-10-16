"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeRedirectPath } from "@/lib/safe-redirect";

interface AcceptResult {
  ok: boolean;
  message?: string;
  orgId?: string | null;
  signInPath?: string | null;
  unauth?: boolean;
}

const inFlight = new Map<string, Promise<AcceptResult>>();

function acceptOnce(token: string): Promise<AcceptResult> {
  if (inFlight.has(token)) {
    return inFlight.get(token)!;
  }

  const promise: Promise<AcceptResult> = (async () => {
    const { data } = await authClient.getSession();
    if (!data?.user) {
      return { ok: false, unauth: true };
    }

    const res = await apiFetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        message: body?.message ?? body?.error ?? "Invitation invalid.",
        signInPath: safeRedirectPath(
          typeof body?.signInPath === "string" ? body.signInPath : null,
        ),
      };
    }
    return { ok: true, orgId: body?.organization?.id ?? null };
  })();

  promise
    .then((result) => {
      if (!result.ok) {
        inFlight.delete(token);
      }
    })
    .catch(() => {
      inFlight.delete(token);
    });

  inFlight.set(token, promise);
  return promise;
}

function AcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"checking" | "done" | "error">("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [signInPath, setSignInPath] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStatus("checking");
    });

    void (async () => {
      let result: AcceptResult;
      try {
        result = await acceptOnce(token);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Accept failed");
        return;
      }
      if (cancelled) return;

      if (result.unauth) {
        router.replace(
          `/sign-in?next=${encodeURIComponent(`/invites/accept?token=${token}`)}`,
        );
        return;
      }

      if (!result.ok) {
        setStatus("error");
        setMessage(result.message ?? "Invitation invalid.");
        setSignInPath(result.signInPath ?? null);
        return;
      }

      setStatus("done");
      setSignInPath(null);
      const orgId = result.orgId;
      if (orgId) {
        setTimeout(() => router.replace(`/orgs/${orgId}`), 500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router, retryCount]);

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Accept invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>Missing invitation token.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === "checking" ? (
            <p role="status">Accepting your invitation…</p>
          ) : status === "done" ? (
            <Alert>
              <AlertDescription>Invitation accepted. Redirecting…</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertDescription>{message ?? "Invitation invalid."}</AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                {signInPath && (
                  <Button
                    onClick={() => router.push(safeRedirectPath(signInPath) ?? "/sign-in")}
                  >
                    Sign in as invited email
                  </Button>
                )}
                <Button variant="outline" onClick={() => setRetryCount((n) => n + 1)}>
                  Try again
                </Button>
                <Button variant="outline" onClick={() => router.push("/sign-in")}>
                  Back to sign in
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function AcceptPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <AcceptContent />
    </Suspense>
  );
}