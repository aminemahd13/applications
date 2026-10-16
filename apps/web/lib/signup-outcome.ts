import { formatRetryWait } from "./http-errors";

export interface SignupOutcome {
  /** False when the API created the account but no verification email went out. */
  verificationEmailSent: boolean;
  /** Seconds until a new verification email can be requested, when known. */
  verificationRetryAfterSeconds: number | null;
}

/** Reads the POST /auth/signup body. Older API builds don't report delivery. */
export function parseSignupOutcome(payload: unknown): SignupOutcome {
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const retry = body.verificationRetryAfterSeconds;
  return {
    verificationEmailSent: body.verificationEmailSent !== false,
    verificationRetryAfterSeconds:
      typeof retry === "number" && Number.isFinite(retry) && retry > 0
        ? Math.ceil(retry)
        : null,
  };
}

/** Title and text for the screen shown after a successful signup. */
export function describeSignupSuccess(
  outcome: SignupOutcome,
  emailVerificationRequired: boolean,
): { title: string; description: string } {
  if (!emailVerificationRequired) {
    return {
      title: "Account created",
      description:
        "Your account is ready. You can sign in and start your application now.",
    };
  }

  if (outcome.verificationEmailSent) {
    return {
      title: "Check your email",
      description:
        "We've sent a verification link to your email address. Please check your inbox and click the link to activate your account.",
    };
  }

  const wait = formatRetryWait(outcome.verificationRetryAfterSeconds);
  if (wait) {
    return {
      title: "Verify your email",
      description: `Your account is created, but we couldn't send a new verification email because too many were requested for this address. Check your inbox and spam folder for an earlier email, or sign in and request a new one in ${wait}.`,
    };
  }
  return {
    title: "Verify your email",
    description:
      "Your account is created, but we couldn't send the verification email right now. Sign in and request a new verification email in a few minutes.",
  };
}
