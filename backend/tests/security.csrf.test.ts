import { describe, it, expect, beforeAll, afterAll } from "vitest";

// F2 — the app's own state-changing routes must reject cross-site requests that
// carry a session cookie, independent of the SameSite cookie attribute.
describe("CSRF origin assertion", () => {
  let app: any;
  const trusted = "http://localhost:3000";

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000,http://localhost:3001";
    const { buildServer } = await import("../src/server.js");
    app = await buildServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("rejects a cookie-bearing POST from an untrusted origin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: { cookie: "better-auth.session_token=abc", origin: "https://evil.example" },
      payload: { name: "Acme" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "FORBIDDEN" });
  });

  it("rejects a cookie-bearing POST with no Origin or Referer", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: { cookie: "better-auth.session_token=abc" },
      payload: { name: "Acme" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("falls back to Referer when Origin is absent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: {
        cookie: "better-auth.session_token=abc",
        referer: `${trusted}/dashboard`,
      },
      payload: { name: "Acme" },
    });
    // Passes the origin assertion and reaches the route, where the bogus
    // session is rejected with 401 — i.e. not blocked by CSRF (403).
    expect(res.statusCode).toBe(401);
  });

  it("allows a cookie-bearing POST from a trusted origin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: { cookie: "better-auth.session_token=abc", origin: trusted },
      payload: { name: "Acme" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not gate safe methods", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/organizations",
      headers: { cookie: "better-auth.session_token=abc", origin: "https://evil.example" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not gate requests without a session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/organizations",
      headers: { origin: "https://evil.example" },
      payload: { name: "Acme" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not interfere with the Better Auth routes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/get-session",
      headers: { cookie: "better-auth.session_token=abc", origin: "https://evil.example" },
    });
    // Our assertion is skipped for /api/auth/*; Better Auth handles the request
    // and never returns our origin payload.
    let body: { message?: string } | null = null;
    try {
      body = res.json();
    } catch {
      body = null;
    }
    expect(body?.message).not.toBe("Origin not allowed");
  });
});
