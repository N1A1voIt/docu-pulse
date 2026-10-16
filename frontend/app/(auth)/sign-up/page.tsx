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

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get("next")) ?? "/";
  const oauthError = mapOAuthError(
    searchParams.get("error"),
    searchParams.get("error_description"),
    "sign-up",
  );

  const [name, setName] = useState("");
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

  const nameInvalid = name.length > 0 && name.trim().length < 2;
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
        errorCallbackURL: `${window.location.origin}/sign-up?next=${encodeURIComponent(next)}`,
      });
      const err = (result as { error?: SocialStartError } | null)?.error;
      if (err) {
        setError(formatSocialStartError(err, "sign-up"));
        setPendingProvider(null);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setPendingProvider(null);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nameInvalid || emailInvalid || passwordInvalid) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await authClient.signUp.email({
        email,
        password,
        name: name.trim(),
      });
      if (err) {
        setError(err.message ?? "Sign up failed. Try another email.");
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
          <CardTitle>Create account</CardTitle>
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
            {loading ? "Creating account" : pendingProvider ? "Redirecting to provider" : ""}
          </div>

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4"
            aria-labelledby="signup-title"
            noValidate
          >
            <h1 id="signup-title" className="sr-only">
              Create account
            </h1>
            <p className="text-xs text-muted-foreground">
              We will never post to your accounts without permission.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Name</span>
              <Input
                autoComplete="name"
                aria-invalid={nameInvalid}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSocialBusy || loading}
                required
                minLength={2}
              />
              {nameInvalid && (
                <span className="text-xs text-destructive">
                  Name must be at least 2 characters.
                </span>
              )}
            </label>
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
              autoComplete="new-password"
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
                nameInvalid ||
                emailInvalid ||
                passwordInvalid ||
                !name ||
                !email ||
                !password
              }
              className="w-full"
            >
              {loading ? "Creating…" : "Create account"}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <a className="underline" href="/sign-in">
                Already have an account? Sign in
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

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SignUpContent />
    </Suspense>
  );
}
