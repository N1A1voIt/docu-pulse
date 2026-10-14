import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("auth rate limiting", () => {
  let app: any;

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.RATE_LIMIT_MAX = "3";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    const { buildServer } = await import("../src/server.js");
    app = await buildServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("returns 429 with Retry-After after bursting /api/auth/*", async () => {
    const responses = [];
    for (let i = 0; i < 5; i++) {
      responses.push(
        await app.inject({
          method: "GET",
          url: "/api/auth/rate-limit-probe",
          headers: { origin: "http://localhost:3000" },
        }),
      );
    }
    const last = responses[responses.length - 1];
    expect(last.statusCode).toBe(429);
    expect(last.headers["retry-after"]).toBeTruthy();
  });

  it("does not apply auth limits to general endpoints", async () => {
    let last: any;
    for (let i = 0; i < 5; i++) {
      last = await app.inject({ method: "GET", url: "/api/health" });
    }
    expect(last.statusCode).toBe(200);
  });
});
