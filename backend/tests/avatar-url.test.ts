import { describe, expect, it } from "vitest";

import {
  sanitizeAvatarUrl,
  sanitizedImageUpdate,
} from "../src/auth/avatar-url.js";

describe("sanitizeAvatarUrl", () => {
  it("keeps absolute https URLs", () => {
    expect(sanitizeAvatarUrl("https://lh3.googleusercontent.com/a/abc")).toBe(
      "https://lh3.googleusercontent.com/a/abc",
    );
    expect(
      sanitizeAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4"),
    ).toBe("https://avatars.githubusercontent.com/u/1?v=4");
  });

  it("drops every non-https value", () => {
    for (const value of [
      "http://example.com/a.png",
      "data:image/png;base64,iVBORw0KGgo=",
      "javascript:alert(1)",
      "//evil.com/a.png",
      "/relative/a.png",
      "not a url",
      "",
    ]) {
      expect(sanitizeAvatarUrl(value)).toBeNull();
    }
  });

  it("drops non-string values", () => {
    for (const value of [null, undefined, 123, {}, []]) {
      expect(sanitizeAvatarUrl(value)).toBeNull();
    }
  });
});

describe("sanitizedImageUpdate (databaseHooks.user.before)", () => {
  it("does not touch image when the payload has no image key", () => {
    // An unrelated update (e.g. changing the display name) must not wipe a
    // previously stored avatar by setting `image: null`.
    expect(sanitizedImageUpdate({ name: "New name" })).toBeUndefined();
    expect(sanitizedImageUpdate({})).toBeUndefined();
  });

  it("rewrites an https image through unchanged", () => {
    expect(
      sanitizedImageUpdate({ image: "https://lh3.googleusercontent.com/a/abc" }),
    ).toEqual({ data: { image: "https://lh3.googleusercontent.com/a/abc" } });
  });

  it("replaces a non-https image with null", () => {
    expect(sanitizedImageUpdate({ image: "http://evil.com/track.gif" })).toEqual({
      data: { image: null },
    });
    expect(sanitizedImageUpdate({ image: "javascript:alert(1)" })).toEqual({
      data: { image: null },
    });
  });

  it("normalises a null image to null", () => {
    expect(sanitizedImageUpdate({ image: null })).toEqual({
      data: { image: null },
    });
  });
});
