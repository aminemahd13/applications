/**
 * Outcome of checking a session cookie against the API.
 * - "valid": the API confirmed a signed-in user.
 * - "invalid": the API explicitly said there is no session (401,
 *   `authenticated: false`, or `user: null`).
 * - "unknown": no usable answer (timeout, network error, 5xx, unexpected
 *   reply). The request must not be treated as logged out.
 */
export type SessionValidationResult = "valid" | "invalid" | "unknown";

export function hasAuthenticatedUser(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;

  const root = payload as Record<string, unknown>;
  const candidate = "user" in root ? root.user : root;
  if (!candidate || typeof candidate !== "object") return false;

  const user = candidate as Record<string, unknown>;
  return typeof user.id === "string" && user.id.length > 0;
}

/**
 * Classifies an answer from GET /auth/session (or the legacy GET /auth/me)
 * that is neither 404 nor 5xx. `payload` is the parsed JSON body, or null.
 */
export function classifySessionResponse(
  status: number,
  payload: unknown,
): SessionValidationResult {
  if (status === 401) return "invalid";
  if (status < 200 || status >= 300) return "unknown";
  if (!payload || typeof payload !== "object") return "unknown";

  const root = payload as Record<string, unknown>;
  if (typeof root.authenticated === "boolean") {
    return root.authenticated ? "valid" : "invalid";
  }
  if (hasAuthenticatedUser(payload)) return "valid";
  if ("user" in root && root.user === null) return "invalid";
  return "unknown";
}
