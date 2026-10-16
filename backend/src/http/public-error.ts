import { InvitationError } from "../invitations/invitations.types.js";

export interface PublicError {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Maps an arbitrary thrown value to a client-safe error response.
 *
 * `InvitationError` is the app's own typed error: its `code`, `message` and
 * `extra` are authored constants that the frontend renders, so they pass
 * through unchanged. Anything else is an *unexpected* failure — a `pg` driver
 * error, a schema/typo error like `Unknown plan: …` — whose `message` can carry
 * SQL text, table/column names, or other internals. Those are replaced with a
 * generic body (F9); the caller is responsible for logging the real error
 * server-side.
 */
export function toPublicError(err: unknown): PublicError {
  if (err instanceof InvitationError) {
    return {
      status: err.status,
      body: { error: err.code, message: err.message, ...(err.extra ?? {}) },
    };
  }

  return {
    status: 500,
    body: { error: "INTERNAL_ERROR", message: "Something went wrong" },
  };
}
