import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth/auth.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { listOrganizationsForUser } from "./organizations/organizations.service.js";

function isHttpsRequest(request: { protocol?: string; headers: Record<string, unknown> }): boolean {
  if (request.protocol === "https") return true;
  // Only honor forwarded headers when an explicit trust-proxy setting exists,
  // so clients cannot self-declare HTTPS and trigger (or suppress) HSTS.
  if (env.trustProxy) {
    const forwarded = request.headers["x-forwarded-proto"];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof raw === "string") {
      const first = raw.split(",")[0]?.trim().toLowerCase();
      if (first === "https") return true;
    }
  }
  return env.betterAuthUrl.toLowerCase().startsWith("https://");
}

export async function buildServer() {
  const app = Fastify({ logger: false, trustProxy: env.trustProxy as any });

  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (isHttpsRequest(request)) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  await app.register(cors, {
    origin: env.trustedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });

  await app.register(rateLimit, {
    global: true,
    max: env.rateLimitApiMax,
    timeWindow: env.rateLimitApiWindowMs,
  });

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(async (authScope) => {
    await authScope.register(rateLimit, {
      global: true,
      max: env.rateLimitAuthMax,
      timeWindow: env.rateLimitAuthWindowMs,
    });

    authScope.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      async handler(request, reply) {
        const url = new URL(request.url, env.betterAuthUrl);
        const headers = fromNodeHeaders(request.headers);
        const body =
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : (request.body ?? undefined);
        const fetchReq = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const response = await auth.handler(fetchReq);
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        const text = await response.text();
        reply.type(response.headers.get("content-type") ?? "application/json");
        reply.send(text);
      },
    });
  });

  app.get("/api/me", async (request, reply) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return reply.send(session);
  });

  app.get("/api/organizations", async (request, reply) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const domainUser = await pool.query<{ id: string }>(
      `SELECT "id"::text AS id FROM "users" WHERE "email" = $1`,
      [session.user.email],
    );
    if (domainUser.rows.length === 0) {
      return reply.send([]);
    }
    const orgs = await listOrganizationsForUser(domainUser.rows[0].id);
    return reply.send(orgs);
  });

  return app;
}
