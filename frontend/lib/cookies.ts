/**
 * Minimal `document.cookie` serializer with secure-by-default attributes.
 *
 * Exists so non-auth UI cookies (currently just `sidebar_state`) carry
 * `SameSite` and — over HTTPS — `Secure`. The review (F8) flagged the hand-rolled
 * `document.cookie` string in `components/ui/sidebar.tsx` as the pattern that
 * tends to get copied onto a real, security-relevant cookie later; routing it
 * through one tested serializer removes that footgun.
 *
 * Deliberately not a general cookie library: no signing, no parsing, no
 * `Domain`. `HttpOnly` is supported for completeness but cannot be set from
 * client-side JS (browsers ignore it on `document.cookie`) — server-set cookies
 * remain the only way to get it.
 */

export interface CookieOptions {
  /** `Path` attribute. Defaults to `/`. */
  path?: string;
  /** `Max-Age` in seconds. Omitted when undefined (making it a session cookie). */
  maxAgeSeconds?: number;
  /** `SameSite` attribute. Defaults to `Lax`. */
  sameSite?: "Strict" | "Lax" | "None";
  /** When true, append `Secure`. Pass based on the page protocol. */
  secure?: boolean;
  /** Append `HttpOnly` (ignored by browsers on `document.cookie`). */
  httpOnly?: boolean;
}

// RFC 6265 cookie-name token: no control chars, separators, or whitespace.
const INVALID_NAME = /[()<>@,;:\\"/[\]?={} \t\u0000-\u001f\u007f]/;

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  if (name.length === 0 || INVALID_NAME.test(name)) {
    throw new Error(`Invalid cookie name: ${JSON.stringify(name)}`);
  }

  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];

  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAgeSeconds)}`);
  }

  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);

  if (options.secure) parts.push("Secure");
  if (options.httpOnly) parts.push("HttpOnly");

  return parts.join("; ");
}
