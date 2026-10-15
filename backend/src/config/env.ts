export type ProviderId = "google" | "github" | "microsoft";

export interface GoogleCredentials {
  clientId?: string;
  clientSecret?: string;
}

export interface GitHubCredentials {
  clientId?: string;
  clientSecret?: string;
}

export interface MicrosoftCredentials {
  clientId?: string;
  clientSecret?: string;
  tenantId: string;
}

const AUTH_PROVIDER_DEFAULTS = "google,github,microsoft";

function parseCommaList(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

function hasGoogleCredentials(creds: GoogleCredentials): boolean {
  return Boolean(creds.clientId && creds.clientSecret);
}

function hasGitHubCredentials(creds: GitHubCredentials): boolean {
  return Boolean(creds.clientId && creds.clientSecret);
}

function hasMicrosoftCredentials(creds: MicrosoftCredentials): boolean {
  return Boolean(creds.clientId && creds.clientSecret);
}

const port = Number(process.env.PORT ?? 3001);
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/docupulse";
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production";

// Centralized email-related configuration. Resend is selected only when a
// non-empty key is present; missing keys fall back to the no-op sender.
const appUrl = process.env.APP_URL ?? clientOrigin;
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

const authProviders = parseCommaList(
  process.env.AUTH_PROVIDERS,
  AUTH_PROVIDER_DEFAULTS,
).map(normalizeProviderId);

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

const uniqueAuthProviders = dedupe(authProviders);

const googleCredentials: GoogleCredentials = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

const githubCredentials: GitHubCredentials = {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
};

const microsoftCredentials: MicrosoftCredentials = {
  clientId: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  tenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
};

function hasCredentials(provider: string): boolean {
  if (provider === "google") return hasGoogleCredentials(googleCredentials);
  if (provider === "github") return hasGitHubCredentials(githubCredentials);
  if (provider === "microsoft") return hasMicrosoftCredentials(microsoftCredentials);
  return false;
}

const missingProviders = uniqueAuthProviders.filter(
  (provider) => !hasCredentials(provider),
);

if (isProduction && missingProviders.length > 0) {
  throw new Error(
    `Missing credentials for enabled auth providers: ${missingProviders.join(", ")}`,
  );
}

const enabledProviders = isProduction
  ? uniqueAuthProviders
  : uniqueAuthProviders.filter((provider) => hasCredentials(provider));

const betterAuthUrl =
  process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`;

const trustedOrigins = parseCommaList(
  process.env.TRUSTED_ORIGINS,
  clientOrigin,
);

// Trust proxy configuration (used for correct client IP / forwarded headers).
const trustProxyRaw = process.env.TRUST_PROXY;
let trustProxy: boolean | string | number = false;
if (trustProxyRaw === "true") {
  trustProxy = true;
} else if (trustProxyRaw === "false" || trustProxyRaw == null || trustProxyRaw === "") {
  trustProxy = false;
} else {
  const asNumber = Number(trustProxyRaw);
  trustProxy = Number.isFinite(asNumber) && trustProxyRaw.trim() !== ""
    ? asNumber
    : trustProxyRaw;
}

// Rate-limit knobs. RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS govern auth endpoints
// (stricter). General API limits default higher and can be overridden separately.
const rateLimitAuthMaxRaw = process.env.RATE_LIMIT_MAX;
const rateLimitAuthMax = Number.isFinite(Number(rateLimitAuthMaxRaw))
  ? Number(rateLimitAuthMaxRaw)
  : isProduction
    ? 10
    : 100;
const rateLimitAuthWindowMsRaw = process.env.RATE_LIMIT_WINDOW_MS;
const rateLimitAuthWindowMs = Number.isFinite(Number(rateLimitAuthWindowMsRaw))
  ? Number(rateLimitAuthWindowMsRaw)
  : 15 * 60 * 1000;
const rateLimitApiMaxRaw = process.env.RATE_LIMIT_API_MAX;
const rateLimitApiMax = Number.isFinite(Number(rateLimitApiMaxRaw))
  ? Number(rateLimitApiMaxRaw)
  : isProduction
    ? 300
    : 1000;
const rateLimitApiWindowMsRaw = process.env.RATE_LIMIT_API_WINDOW_MS;
const rateLimitApiWindowMs = Number.isFinite(Number(rateLimitApiWindowMsRaw))
  ? Number(rateLimitApiWindowMsRaw)
  : 60 * 1000;

export const env = {
  port,
  databaseUrl,
  clientOrigin,
  appUrl,
  nodeEnv: process.env.NODE_ENV ?? "development",
  resendApiKey,
  emailFrom,
  isProduction,
  // Requested provider ids (normalized, as configured by AUTH_PROVIDERS).
  authProviders: uniqueAuthProviders,
  // Provider ids that are actually registered with Better Auth (creds present).
  enabledProviders,
  google: googleCredentials,
  github: githubCredentials,
  microsoft: microsoftCredentials,
  googleClientId: googleCredentials.clientId,
  googleClientSecret: googleCredentials.clientSecret,
  githubClientId: githubCredentials.clientId,
  githubClientSecret: githubCredentials.clientSecret,
  microsoftClientId: microsoftCredentials.clientId,
  microsoftClientSecret: microsoftCredentials.clientSecret,
  microsoftTenantId: microsoftCredentials.tenantId,
  betterAuthUrl,
  // Alias kept for callers that prefer the env-var casing.
  betterAuthURL: betterAuthUrl,
  trustedOrigins,
  trustProxy,
  rateLimitAuthMax,
  rateLimitAuthWindowMs,
  rateLimitApiMax,
  rateLimitApiWindowMs,
};

export function validateEnv(): void {
  if (isProduction && missingProviders.length > 0) {
    throw new Error(
      `Missing credentials for enabled auth providers: ${missingProviders.join(", ")}`,
    );
  }
}
