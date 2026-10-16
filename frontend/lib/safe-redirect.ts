/**
 * Redirect-safety helper for client-side navigation.
 *
 * Next's `useRouter` docs are explicit: "You must not send untrusted or
 * unsanitized URLs to `router.push` or `router.replace`, as this can open your
 * site to cross-site scripting (XSS) vulnerabilities. For example, `javascript:`
 * URLs sent to `router.push` or `router.replace` will be executed in the context
 * of your page."
 *
 * Both of our untrusted sources go through here:
 *   - the `next` query param on the sign-in / sign-up pages (F5), and
 *   - the server-supplied `signInPath` on the invite-accept page (F6).
 *
 * Rather than string heuristics (`startsWith("/")`, `!startsWith("//")`) that
 * are brittle against backslash/encoding variants (`/\evil.com`,
 * `/%2F%2Fevil.com`), we resolve the value against the app's own origin and
 * only allow it through when it stays on that origin. `javascript:`, absolute
 * `https://evil.com`, protocol-relative `//evil.com`, and backslash forms all
 * resolve to a different origin (or no origin) and are rejected.
 *
 * @returns an internal path (`pathname + search + hash`) safe to pass to
 *   `router.push`/`router.replace`, string concatenation (`origin + path`), and
 *   `encodeURIComponent`; or `null` when the value is missing or unsafe. Callers
 *   choose their own fallback (e.g. `safeRedirectPath(x) ?? "/"`).
 */

// Used only when there is no `window` (server render of a client component).
// Any root-relative path resolves against it; any absolute/protocol-relative
// URL resolves elsewhere and is rejected. The client always uses the real
// origin, and `next`/`signInPath` values are internally generated root-relative
// paths, so the two agree in practice.
const SSR_FALLBACK_ORIGIN = "http://localhost";

export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;

  const base =
    typeof window !== "undefined" ? window.location.origin : SSR_FALLBACK_ORIGIN;

  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }

  // Reject anything that does not stay on this origin (external, javascript:,
  // data:, protocol-relative, backslash-normalised host swaps).
  if (url.origin !== base) return null;

  return url.pathname + url.search + url.hash;
}
