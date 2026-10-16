/**
 * Validates an avatar URL before it is rendered into `<img src>`.
 *
 * The URL arrives from the OAuth identity provider (via the session's
 * `user.image`), so it is untrusted input. `<img>` cannot execute a
 * `javascript:` URL, but an attacker-influenced value could still be a
 * `data:`/`blob:` payload or an unexpected host. We therefore accept **only
 * absolute `https:` URLs** and return `null` for everything else, so the caller
 * falls back to the initial-letter avatar.
 *
 * This is defence in depth, not the primary control: the app's CSP
 * (`img-src`, see `next.config.ts`) already restricts which hosts may load, and
 * `referrerPolicy="no-referrer"` stops the URL leaking to the image host. It
 * pairs with the backend ingest sanitizer
 * (`backend/src/auth/avatar-url.ts`), which persists https-only avatar URLs.
 */
export function safeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Relative, protocol-relative (`//host/x`) or garbage input.
    return null;
  }

  if (url.protocol !== "https:") return null;

  return url.href;
}
