import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { pool as publicPool } from "../db/pool.js";
import { createPersonalOrganization } from "../organizations/organizations.service.js";

const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
if (!betterAuthSecret && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET is required in production");
}

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
  socialProviders,
  databaseHooks: {
    user: {
      create: {
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
    },
  },
});
