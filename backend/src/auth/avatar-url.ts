/**
 * Avatar-ingest guard for Better Auth's user persistence (F7).
 *
 * A social provider supplies `user.image`; it is stored in the auth schema and
 * later returned by `getSession()` straight into the shell's `<img src>`. We
 * refuse to persist anything that is not an absolute `https:` URL, so a
 * provider compromise, an unusual provider response, or a crafted value cannot
 * plant a `data:`/`javascript:`/`http:` URL on the record. `null` means "no
 * avatar" and the UI falls back to the initial letter.
 *
 * Kept in sync with the client-side mirror in `frontend/lib/safe-image-url.ts`.
 */

export function sanitizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  return url.href;
}

/**
 * Builds the `databaseHooks.user.{create,update}.before` return value for the
 * `image` field.
 *
 * Returns `undefined` (a no-op) when the incoming payload carries no `image`
 * key. This matters for updates: `update.before` receives only the *changed*
 * fields, so naively returning `{ image: null }` would wipe a user's existing
 * avatar on an unrelated update (e.g. a display-name change).
 */
export function sanitizedImageUpdate(
  user: Record<string, unknown>,
): { data: { image: string | null } } | undefined {
  if (!("image" in user)) return undefined;
  return { data: { image: sanitizeAvatarUrl(user.image) } };
}
