"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

type VerificationStatus =
  | "loading"
  | "success"
  | "already_verified"
  | "expired"
  | "no_longer_valid"
  | "invalid"
  | "error";

function extractErrorCode(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const candidate = (data as { code?: unknown }).code;
  return typeof candidate === "string" ? candidate : null;
}

function resolveVerificationErrorStatus(error: unknown): VerificationStatus {
  if (!(error instanceof ApiError)) return "error";

  const code = extractErrorCode(error.data);
  if (code === "EMAIL_VERIFICATION_EXPIRED") return "expired";
  if (code === "EMAIL_VERIFICATION_NO_LONGER_VALID") return "no_longer_valid";
  if (code === "EMAIL_VERIFICATION_INVALID") return "invalid";
  return "error";
}

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<VerificationStatus>(
    token ? "loading" : "invalid",
  );
  const [email, setEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const canResend = useMemo(
    () =>
      status === "expired" ||
      status === "no_longer_valid" ||
      status === "invalid" ||
      status === "error",
    [status],
  );

  useEffect(() => {
    if (!user?.email) return;
    setEmail((current) => current || user.email);
  }, [user?.email]);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    (async () => {
      try {
        const result = await apiClient<{ status?: string }>("/auth/verify-email", {
          method: "POST",
          body: { token },
        });
        setStatus(
          result.status === "already_verified" ? "already_verified" : "success",
        );
        void refreshUser().catch(() => undefined);
      } catch (error) {
        setStatus(resolveVerificationErrorStatus(error));
      }
    })();
  }, [refreshUser, token]);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast.error("Enter your email address to receive a new verification link.");
      return;
    }

    setIsResending(true);
    try {
      await apiClient("/auth/email/verify/request-public", {
        method: "POST",
        body: { email: normalizedEmail },
      });
      toast(
        "If that email exists, a verification link will be sent. Check your inbox and spam folder.",
      );
    } catch {
      // apiClient already shows the error toast.
    } finally {
      setIsResending(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Verifying your email...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-4"
    >
      {status === "success" || status === "already_verified" ? (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h2 className="text-xl font-bold">
            {status === "already_verified" ? "Email already verified" : "Email verified!"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {status === "already_verified"
              ? "This email address was already confirmed. You can sign in to your account."
              : "Your email has been verified. You can now sign in to your account."}
          </p>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </>
      ) : (
        <>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold">Verification failed</h2>
          <p className="text-sm text-muted-foreground">
            {status === "expired" &&
              "This verification link has expired. Request a new verification email below."}
            {status === "no_longer_valid" &&
              "This verification link is no longer valid. A newer verification email may have been sent."}
            {status === "invalid" &&
              "This verification link is invalid. Request a new verification email below."}
            {status === "error" &&
              "We couldn't verify your email right now. Request a new link or try again shortly."}
          </p>
          {canResend && (
            <form onSubmit={handleResend} className="mx-auto flex w-full max-w-sm flex-col gap-3 pt-2">
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" disabled={isResending}>
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send a new verification email"
                )}
              </Button>
            </form>
          )}
          <Button variant="outline" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </>
      )}
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
