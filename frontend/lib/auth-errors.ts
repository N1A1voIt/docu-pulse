export type AuthFlow = "sign-in" | "sign-up";

/**
 * Machine-readable OAuth callback error codes emitted by better-auth
 * (`?error=<code>`), see better-auth's OAuth callback error handling.
 * The provider's own failures surface as `access_denied`.
 */
const CANCELLED_CODES = new Set(["access_denied", "user_cancelled", "user_canceled"]);
const SESSION_EXPIRED_CODES = new Set([
  "state_mismatch",
  "state_invalid",
  "state_not_found",
  "nonce_binding_missing",
]);
const ACCOUNT_CONFLICT_CODES = new Set([
  "account_not_linked",
  "email_already_exists",
  "account_exists",
  "unable_to_link_account",
  "account_already_linked_to_different_user",
]);
const PROVIDER_FAILURE_CODES = new Set([
  "no_code",
  "invalid_code",
  "unable_to_get_user_info",
  "no_callback_url",
  "issuer_missing",
  "issuer_mismatch",
  "internal_server_error",
  "state_generation_error",
]);

/** Keep provider-supplied detail readable and free of control characters. */
function cleanDescription(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}…` : cleaned;
}

/**
 * Turn the `error` / `error_description` query params from an OAuth callback
 * into a message with a recovery path. Unknown codes keep the code visible so
 * the failure can be diagnosed instead of collapsing to a generic message.
 */
export function mapOAuthError(
  code: string | null,
  description: string | null,
  flow: AuthFlow,
): string | null {
  if (!code) return null;

  const label = flow === "sign-in" ? "Sign-in" : "Sign-up";

  if (CANCELLED_CODES.has(code)) {
    return `${label} was cancelled.`;
  }
  if (SESSION_EXPIRED_CODES.has(code)) {
    return "Your sign-in session expired. Please try again.";
  }
  if (ACCOUNT_CONFLICT_CODES.has(code)) {
    return "An account with this email already exists. Sign in with your password instead.";
  }
  if (code === "email_does_not_match") {
    return "This provider's email doesn't match your account. Use the method you originally signed up with.";
  }
  if (code === "email_not_found") {
    return "We couldn't get an email address from the provider. Use email or another provider.";
  }
  if (code === "email_not_verified") {
    return "Your email isn't verified with the provider yet. Verify it there, then try again.";
  }
  if (code === "oauth_provider_not_found") {
    return "That sign-in provider isn't available. Choose another method.";
  }
  if (PROVIDER_FAILURE_CODES.has(code)) {
    return `We couldn't complete ${label.toLowerCase()} with the provider. Please try again.`;
  }

  const detail = cleanDescription(description);
  if (detail) return detail;
  return `${label} failed (${code}). Please try again.`;
}

/** Error shape returned synchronously by `authClient.signIn.social`. */
export interface SocialStartError {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Message for a social sign-in that failed before the redirect happened
 * (provider not configured, rate limited, network/API error).
 */
export function formatSocialStartError(
  error: SocialStartError | null | undefined,
  flow: AuthFlow,
): string {
  const fallback =
    flow === "sign-in"
      ? "Couldn't start sign-in with that provider. Please try again."
      : "Couldn't start sign-up with that provider. Please try again.";
  if (!error) return fallback;
  if (error.status === 429 || error.code === "rate_limit") {
    return "Too many attempts. Wait a moment and try again.";
  }
  const message = error.message?.trim();
  return message || fallback;
}
