import type { NextConfig } from "next";

/**
 * Security headers for the app origin.
 *
 * The Fastify API sets its own headers (backend/src/server.ts), but HTML pages
 * are served by Next on the app origin and carried none — no CSP, no
 * clickjacking protection, no referrer policy. These are the frontend half of
 * the deferred backend note ("No API CSP added (left to frontend/CDN)").
 *
 * Why a static CSP rather than a per-request nonce:
 * the CSP guide states nonce-based CSP requires every page to be dynamically
 * rendered and is incompatible with Partial Prerendering. This app enables
 * `cacheComponents` (PPR is the default under it), so a nonce would leave the
 * prerendered shell's scripts without one and break hydration. We therefore use
 * the guide's "Without Nonces" path and keep PPR intact. Tightening to a nonce
 * is a follow-up gated on dropping `cacheComponents`.
 *
 * `'unsafe-inline'` is required because, without a nonce, Next's inline
 * bootstrap/flight scripts and React's inline `style` attributes would be
 * blocked. The policy still meaningfully constrains script/connect/img/font
 * origins and locks down object-src, base-uri, form-action and framing.
 */
const isDev = process.env.NODE_ENV === "development";

/** Same origin the browser calls for the API (mirrors lib/api.ts). */
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Reduce a configured URL to its scheme://host origin; fall back to a safe value. */
function apiOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3001";
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next/React inline bootstrap scripts + (dev) React's eval-based debug stack.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // React emits inline `style` attributes (e.g. sidebar width vars).
  "style-src 'self' 'unsafe-inline'",
  // OAuth avatars are remote; allow only the providers this app enables.
  "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com https://*.microsoft.com",
  "font-src 'self'",
  "connect-src 'self' " + apiOrigin(apiUrl),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  // Upgrade http subresources to https in prod only; in dev the API is http.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS only over HTTPS; browsers ignore it on http, so dev is unaffected.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
