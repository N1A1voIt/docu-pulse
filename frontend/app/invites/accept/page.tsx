"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const attempted = new Set<string>();

function AcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"checking" | "working" | "done" | "error">("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!token) {
        setStatus("error");
        setMessage("Missing invitation token.");
        return;
      }
      const { data } = await authClient.getSession();
      if (!data?.user) {
        router.replace(`/sign-in?next=${encodeURIComponent(`/invites/accept?token=${token}`)}`);
        return;
      }
      if (attempted.has(token)) return;
      attempted.add(token);
      setStatus("working");
      try {
        const res = await apiFetch(`/api/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus("error");
          setMessage(body?.message ?? body?.error ?? "Invitation invalid.");
          return;
        }
        setStatus("done");
        const orgId = body?.organization?.id;
        if (orgId) {
          setTimeout(() => router.replace(`/orgs/${orgId}`), 500);
        }
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Accept failed");
      }
    })();
  }, [token, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === "checking" || status === "working" ? (
            <p>Accepting your invitation…</p>
          ) : status === "done" ? (
            <Alert>
              <AlertDescription>Invitation accepted. Redirecting…</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertDescription>{message ?? "Invitation invalid."}</AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.push("/sign-in")}>Sign in</Button>
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