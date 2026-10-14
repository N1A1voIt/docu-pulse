import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("CORS allowlist", () => {
  let app: any;

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000,http://localhost:3001";
    const { buildServer } = await import("../src/server.js");
    app = await buildServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("allows each configured origin", async () => {
    for (const origin of ["http://localhost:3000", "http://localhost:3001"]) {
      const res = await app.inject({
        method: "OPTIONS",
        url: "/api/health",
        headers: {
          origin,
          "access-control-request-method": "GET",
        },
      });
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    }
  });

  it("rejects an unlisted origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/api/health",
      headers: {
        origin: "http://evil.example",
        "access-control-request-method": "GET",
      },
    });
    expect(res.headers["access-control-allow-origin"]).not.toBe("http://evil.example");
  });
});
