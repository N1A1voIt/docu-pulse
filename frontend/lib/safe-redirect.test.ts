import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

const ORIGIN = "http://localhost:3000";

// [input, expected] pairs. Covers the attack forms called out in the F5/F6
// review (external, protocol-relative, backslash and encoding variants,
// javascript:/data: schemes) plus the legitimate internal paths that must keep
// working.
const cases: Array<[string | null | undefined, string | null]> = [
  // Allowed — same-origin internal paths.
  ["/orgs/abc", "/orgs/abc"],
  ["/", "/"],
  ["/orgs/abc?tab=members#top", "/orgs/abc?tab=members#top"],
  [
    "/sign-in?next=%2Finvites%2Faccept%3Ftoken%3Dx",
    "/sign-in?next=%2Finvites%2Faccept%3Ftoken%3Dx",
  ],
  ["http://localhost:3000/ok", "/ok"],
  ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
  ["   /spaced   ", "/spaced"],

  // Rejected — off-origin, protocol-relative, backslash, or dangerous scheme.
  ["//evil.com", null],
  ["https://evil.com", null],
  ["/\\evil.com", null],
  ["\\\\evil.com", null],
  ["javascript:alert(1)", null],
  ["JaVaScRiPt:alert(1)", null],
  ["data:text/html,<script>alert(1)</script>", null],

  // Rejected — nothing to redirect to.
  ["", null],
  [null, null],
  [undefined, null],
];

describe("safeRedirectPath (browser, origin http://localhost:3000)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(cases)("maps %j to %j", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe("safeRedirectPath (SSR, no window)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts root-relative paths", () => {
    expect(safeRedirectPath("/orgs/abc?x=1")).toBe("/orgs/abc?x=1");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirectPath("//evil.com")).toBeNull();
    expect(safeRedirectPath("https://evil.com")).toBeNull();
  });
});
