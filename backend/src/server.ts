import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth/auth.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { listOrganizationsForUser, createTeamOrganization } from "./organizations/organizations.service.js";
import {
  createInvitation,
  listInvitations,
  acceptInvitation,
  revokeInvitation,
  listMembers,
} from "./invitations/invitations.service.js";
import { InvitationError } from "./invitations/invitations.types.js";

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originFromReferer(referer: string | string[] | undefined): string | null {
  const value = Array.isArray(referer) ? referer[0] : referer;
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isHttpsRequest(request: { protocol?: string; headers: Record<string, unknown> }): boolean {
  if (request.protocol === "https") return true;
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

  // CSRF defence in depth for the app's own state-changing routes. Better Auth
  // origin-checks /api/auth/*, but these Fastify routes previously relied on
  // SameSite=Lax alone; assert Origin/Referer here too so a future cookie
  // change cannot silently open them up (F2). Scoped to cookie-bearing
  // requests — token-less callers still reach the normal 401 path.
  app.addHook("onRequest", async (request, reply) => {
    if (CSRF_SAFE_METHODS.has(request.method)) return;
    if (request.url.startsWith("/api/auth/")) return;
    if (!request.headers.cookie) return;

    const origin =
      (typeof request.headers.origin === "string" ? request.headers.origin : null) ??
      originFromReferer(request.headers.referer);

    if (!origin || !env.trustedOrigins.includes(origin)) {
      return reply.status(403).send({ error: "FORBIDDEN", message: "Origin not allowed" });
    }
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
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    return reply.send(session);
  });

  async function domainUserIdFor(session: { user: { email: string } }): Promise<string | null> {
    const r = await pool.query<{ id: string }>(`SELECT "id"::text AS id FROM "users" WHERE "email" = $1`, [session.user.email]);
    return r.rows[0]?.id ?? null;
  }

  function sendInvitationError(reply: any, err: unknown) {
    if (err instanceof InvitationError) {
      return reply.status(err.status).send({ error: err.code, message: err.message, ...(err.extra ?? {}) });
    }
    return reply.status(500).send({ error: "INTERNAL_ERROR", message: err instanceof Error ? err.message : "Unknown" });
  }

  app.get("/api/organizations", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const domainUser = await pool.query<{ id: string }>(
      `SELECT "id"::text AS id FROM "users" WHERE "email" = $1`,
      [session.user.email],
    );
    if (domainUser.rows.length === 0) return reply.send([]);
    const orgs = await listOrganizationsForUser(domainUser.rows[0].id);
    return reply.send(orgs);
  });

  app.post("/api/organizations", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const userId = await domainUserIdFor(session as any);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const body = (request.body ?? {}) as { name?: string; slug?: string };
    if (!body.name || typeof body.name !== "string") {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "name required" });
    }
    try {
      const org = await createTeamOrganization(userId, { name: body.name, slug: body.slug });
      return reply.status(201).send(org);
    } catch (err) {
      return sendInvitationError(reply, err);
    }
  });

  app.get("/api/organizations/:id/members", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const userId = await domainUserIdFor(session as any);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const orgId = (request.params as { id: string }).id;
    try {
      const members = await listMembers(orgId, userId);
      return reply.send(members);
    } catch (err) {
      return sendInvitationError(reply, err);
    }
  });

  app.get("/api/organizations/:id/invites", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const userId = await domainUserIdFor(session as any);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const orgId = (request.params as { id: string }).id;
    try {
      const invites = await listInvitations(orgId, userId);
      return reply.send(invites);
    } catch (err) {
      return sendInvitationError(reply, err);
    }
  });

  app.post("/api/organizations/:id/invites", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const userId = await domainUserIdFor(session as any);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const orgId = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as { email?: string; role?: string };
    if (!body.email || !body.role) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "email and role required" });
    }
    try {
      const invite = await createInvitation(orgId, userId, { email: body.email, role: body.role });
      return reply.status(201).send(invite);
    } catch (err) {
      return sendInvitationError(reply, err);
    }
  });

  app.delete("/api/organizations/:id/invites/:inviteId", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const userId = await domainUserIdFor(session as any);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const params = request.params as { id: string; inviteId: string };
    try {
      await revokeInvitation(params.id, userId, params.inviteId);
      return reply.status(204).send();
    } catch (err) {
      return sendInvitationError(reply, err);
    }
  });

  app.post("/api/invites/:token/accept", async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const userId = await domainUserIdFor(session as any);
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });
    const token = (request.params as { token: string }).token;
    try {
      const result = await acceptInvitation(token, userId, session.user.email);
      return reply.status(200).send(result);
    } catch (err) {
      return sendInvitationError(reply, err);
    }
  });

  return app;
}
