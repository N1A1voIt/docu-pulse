import { describe, expect, it } from "vitest";

import { safeImageUrl } from "./safe-image-url";

// [input, expected] pairs. Avatar URLs come from the OAuth identity provider via
// the session, so they are untrusted input rendered into <img src>. Only
// absolute https URLs are allowed through; everything else falls back to the
// initial-letter avatar.
const cases: Array<[string | null | undefined, string | null]> = [
  // Allowed.
  [
    "https://lh3.googleusercontent.com/a/abc123",
    "https://lh3.googleusercontent.com/a/abc123",
  ],
  [
    "https://avatars.githubusercontent.com/u/1?v=4",
    "https://avatars.githubusercontent.com/u/1?v=4",
  ],

  // Rejected — non-https schemes.
  ["http://example.com/a.png", null],
  ["data:image/png;base64,iVBORw0KGgo=", null],
  ["blob:https://app.example.com/1234", null],
  ["javascript:alert(1)", null],
  ["JaVaScRiPt:alert(1)", null],

  // Rejected — not an absolute URL.
  ["//evil.com/a.png", null],
  ["/relative/a.png", null],
  ["not a url", null],

  // Rejected — nothing to render.
  ["", null],
  [null, null],
  [undefined, null],
];

describe("safeImageUrl", () => {
  it.each(cases)("maps %j to %j", (input, expected) => {
    expect(safeImageUrl(input)).toBe(expected);
  });
});
