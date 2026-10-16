import { describe, expect, it } from "vitest";

import { serializeCookie } from "./cookies";

describe("serializeCookie", () => {
  it("defaults to SameSite=Lax and omits Secure when not secure", () => {
    expect(
      serializeCookie("sidebar_state", "true", { maxAgeSeconds: 604800 }),
    ).toBe("sidebar_state=true; Path=/; Max-Age=604800; SameSite=Lax");
  });

  it("adds Secure when secure is true", () => {
    expect(
      serializeCookie("sidebar_state", "false", {
        maxAgeSeconds: 60,
        secure: true,
      }),
    ).toBe("sidebar_state=false; Path=/; Max-Age=60; SameSite=Lax; Secure");
  });

  it("honours an explicit SameSite and path", () => {
    expect(
      serializeCookie("a", "b", { path: "/app", sameSite: "Strict" }),
    ).toBe("a=b; Path=/app; SameSite=Strict");
  });

  it("percent-encodes the value", () => {
    expect(serializeCookie("a", "x y;z").startsWith("a=x%20y%3Bz")).toBe(true);
  });

  it("rejects names that could inject extra cookie attributes", () => {
    expect(() => serializeCookie("bad;name", "v")).toThrow();
    expect(() => serializeCookie("bad name", "v")).toThrow();
  });
});
