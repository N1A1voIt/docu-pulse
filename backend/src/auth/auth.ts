import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { pool as publicPool } from "../db/pool.js";
import { createPersonalOrganization } from "../organizations/organizations.service.js";
import { sanitizedImageUpdate } from "./avatar-url.js";

const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
if (!betterAuthSecret && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}

// Session cookies must only carry the Secure attribute (and the __Secure-
// name prefix) over HTTPS. Production sets BETTER_AUTH_URL to an https origin;
// local development talks to http://localhost.
const secureCookies = env.betterAuthUrl.toLowerCase().startsWith("https://");

const pool = new Pool({
  connectionString: env.databaseUrl,
  options: "-c search_path=auth",
});

// Build the social provider configuration only from providers that have
// credentials available in this environment (see src/config/env.ts).
const socialProviders: Record<string, Record<string, unknown>> = {};

if (env.enabledProviders.includes("google")) {
  socialProviders.google = {
    clientId: env.google.clientId,
    clientSecret: env.google.clientSecret,
  };
}

if (env.enabledProviders.includes("github")) {
  socialProviders.github = {
    clientId: env.github.clientId,
    clientSecret: env.github.clientSecret,
  };
}

if (env.enabledProviders.includes("microsoft")) {
  socialProviders.microsoft = {
    clientId: env.microsoft.clientId,
    clientSecret: env.microsoft.clientSecret,
    tenantId: env.microsoft.tenantId,
  };
}

export const auth = betterAuth({
  baseURL: env.betterAuthUrl,
  secret: betterAuthSecret ?? "dev-only-insecure-secret-change-me",
  database: pool,
  trustedOrigins: env.trustedOrigins,
  // Do not link a social identity onto an existing password account.
  // A collision must surface as an error instead of merging identities.
  // Better Auth redirects such collisions with ?error=account_not_linked.
  account: {
    accountLinking: {
      enabled: false,
      disableImplicitLinking: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  advanced: {
    // Pin the session-cookie posture explicitly rather than relying on Better
    // Auth defaults, so a dependency upgrade cannot silently weaken it (F2).
    //
    // SameSite=Lax is the CSRF defence for cookie-authenticated routes: it
    // stops the browser attaching the session cookie to cross-site
    // state-changing requests (POST/DELETE). It uses *site* scope, so it keeps
    // working when the app and API live on subdomains of one registrable
    // domain (app.example.com <-> api.example.com) — the supported topology.
    // A genuinely cross-site deployment would need SameSite=None, which removes
    // this defence and would require CSRF tokens; see
    // docs/plans/todo-security-hardening.md.
    useSecureCookies: secureCookies,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/",
    },
  },
  socialProviders,
  databaseHooks: {
    user: {
      create: {
        // Persist only https avatar URLs (F7). Runs before Better Auth writes
        // the user, so the stored row — and therefore the `user.image` the
        // shell renders from the session — can only hold a safe URL.
        before: async (user) => sanitizedImageUpdate(user),
        after: async (user) => {
          const normalizedName = user.name?.trim() || null;
          const res = await publicPool.query<{ id: string }>(
            `INSERT INTO "users" ("uuid", "name", "email", "avatar_url")
             VALUES (gen_random_uuid(), $1, $2, $3)
             ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"
             RETURNING "id"`,
            [normalizedName ?? "", user.email, user.image ?? null],
          );
          const domainUserId = res.rows[0].id;
          await createPersonalOrganization(domainUserId, normalizedName);
        },
      },
      update: {
        // Same guard for profile updates. A no-op when the update carries no
        // image, so an unrelated change cannot wipe a stored avatar.
        before: async (user) => sanitizedImageUpdate(user),
      },
    },
  },
});
