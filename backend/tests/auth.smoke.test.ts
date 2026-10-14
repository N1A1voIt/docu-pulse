import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetSchema } from "./helpers/db.js";
import { buildServer } from "../src/server.js";

describe("auth smoke", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    await resetSchema();
    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("signs up and auto-creates a personal org", async () => {
    const signUp = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        email: "smoke@example.com",
        password: "password123",
        name: "Smoke User",
      },
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    });

    expect(signUp.statusCode).toBeLessThan(400);
    const setCookie = signUp.headers["set-cookie"];
    expect(setCookie).toBeTruthy();

    const cookie = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);

    const orgs = await app.inject({
      method: "GET",
      url: "/api/organizations",
      headers: { cookie, origin: "http://localhost:3000" },
    });

    expect(orgs.statusCode).toBe(200);
    const body = JSON.parse(orgs.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].isPersonal).toBe(true);
  });
});
