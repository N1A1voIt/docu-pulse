import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TRACKED_KEYS = [
  "NODE_ENV",
  "AUTH_PROVIDERS",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
] as const;

describe("env config (fail-fast)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of TRACKED_KEYS) {
      saved[key] = process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of TRACKED_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    vi.resetModules();
  });

  it("throws in production when an enabled provider lacks credentials", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_PROVIDERS = "google";
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    await expect(import("../src/config/env.js")).rejects.toThrow(
      /Missing credentials for enabled auth providers: google/,
    );
  });

  it("omits an unconfigured provider in development without throwing", async () => {
    process.env.NODE_ENV = "development";
    process.env.AUTH_PROVIDERS = "google";
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const mod = await import("../src/config/env.js");
    expect(mod.env.enabledProviders).not.toContain("google");
    expect(mod.env.enabledProviders).toEqual([]);
  });
});
