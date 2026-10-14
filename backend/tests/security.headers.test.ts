import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("security headers", () => {
  let app: any;

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.BETTER_AUTH_URL = "http://localhost:3001";
    process.env.TRUST_PROXY = "true";
    const { buildServer } = await import("../src/server.js");
    app = await buildServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("emits HSTS when X-Forwarded-Proto is https", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("does not emit HSTS on plain http without proxy hint", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });
});
