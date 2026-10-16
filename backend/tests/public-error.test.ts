import { describe, expect, it } from "vitest";

import { InvitationError } from "../src/invitations/invitations.types.js";
import { toPublicError } from "../src/http/public-error.js";

describe("toPublicError", () => {
  it("passes an InvitationError through with its code, message and status", () => {
    const err = new InvitationError(
      "INVITE_INVALID",
      "Invitation is invalid or expired",
      400,
    );

    expect(toPublicError(err)).toEqual({
      status: 400,
      body: {
        error: "INVITE_INVALID",
        message: "Invitation is invalid or expired",
      },
    });
  });

  it("carries the InvitationError extra fields (e.g. signInPath)", () => {
    const err = new InvitationError("EMAIL_MISMATCH", "Sign in as that email", 400, {
      signInPath: "/sign-in?next=%2Finvites%2Faccept%3Ftoken%3Dx",
    });

    expect(toPublicError(err).body).toMatchObject({
      signInPath: "/sign-in?next=%2Finvites%2Faccept%3Ftoken%3Dx",
    });
  });

  it("does not leak an unexpected Error's message or internals", () => {
    const err = new Error('relation "users" does not exist at character 42');

    const result = toPublicError(err);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
    // The raw SQL text must not survive in the serialized body.
    expect(JSON.stringify(result.body)).not.toContain("users");
  });

  it("maps a non-Error throw to the same generic 500", () => {
    for (const thrown of ["boom", undefined, { code: "ECONNRESET" }]) {
      const result = toPublicError(thrown);
      expect(result.status).toBe(500);
      expect(result.body).toEqual({
        error: "INTERNAL_ERROR",
        message: "Something went wrong",
      });
    }
  });
});
