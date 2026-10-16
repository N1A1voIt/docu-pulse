"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { formatSocialStartError, mapOAuthError, type SocialStartError } from "@/lib/auth-errors";
import { getEnabledProviders } from "@/lib/auth-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SocialProviderButton } from "@/components/auth/social-provider-button";
import { AuthDivider } from "@/components/auth/auth-divider";
import { PasswordField } from "@/components/auth/password-field";
import { safeRedirectPath } from "@/lib/safe-redirect";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get("next")) ?? "/";
  const oauthError = mapOAuthError(
    searchParams.get("error"),
    searchParams.get("error_description"),
    "sign-in",
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(oauthError);
  const [loading, setLoading] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  const providers = getEnabledProviders();

  useEffect(() => {
    void (async () => {
      const { data } = await authClient.getSession();
      if (data?.user) router.replace(next);
    })();
  }, [router, next]);

  const emailInvalid = email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordInvalid = password.length > 0 && password.length < 8;

  const isSocialBusy = pendingProvider !== null;

  async function onSocial(provider: string) {
    setError(null);
    setPendingProvider(provider);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}${next}`,
        errorCallbackURL: `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`,
      });
      const err = (result as { error?: SocialStartError } | null)?.error;
      if (err) {
        setError(formatSocialStartError(err, "sign-in"));
        setPendingProvider(null);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setPendingProvider(null);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (emailInvalid || passwordInvalid) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await authClient.signIn.email({ email, password });
      if (err) {
        setError(err.message ?? "Sign in failed. Check your credentials.");
        return;
      }
      router.replace(next);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {providers.map((provider) => (
              <SocialProviderButton
                key={provider.id}
                provider={provider}
                loading={pendingProvider === provider.id}
                disabled={loading || isSocialBusy}
                onClick={() => onSocial(provider.id)}
              />
            ))}
          </div>

          <AuthDivider />

          <div aria-live="polite" className="sr-only">
            {loading ? "Signing in" : pendingProvider ? "Redirecting to provider" : ""}
          </div>

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4"
            aria-labelledby="signin-title"
            noValidate
          >
            <h1 id="signin-title" className="sr-only">
              Sign in
            </h1>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Email</span>
              <Input
                type="email"
                autoComplete="email"
                inputMode="email"
                aria-invalid={emailInvalid}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSocialBusy || loading}
                required
              />
              {emailInvalid && (
                <span className="text-xs text-destructive">
                  Enter a valid email address.
                </span>
              )}
            </label>
            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              disabled={isSocialBusy || loading}
              invalid={passwordInvalid}
              helperText="Password must be at least 8 characters."
              minLength={8}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={
                loading ||
                isSocialBusy ||
                emailInvalid ||
                passwordInvalid ||
                !email ||
                !password
              }
              className="w-full"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <a className="underline" href="/sign-up">
                Need an account? Sign up
              </a>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <a className="underline" href="#">
                Terms
              </a>
              <a className="underline" href="#">
                Privacy
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SignInContent />
    </Suspense>
  );
}
