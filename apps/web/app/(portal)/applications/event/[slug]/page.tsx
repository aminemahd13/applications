"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, apiClient } from "@/lib/api";
import { getProfileCompletionStatus } from "@/lib/profile-completion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader, PageSkeleton } from "@/components/shared";

interface EventSummary {
  id: string;
  slug: string;
  title?: string;
}

interface ApplicationDetail {
  id: string;
}

interface ApplicantProfileCompletionPayload {
  fullName?: string;
  phone?: string;
  education?: string;
  institution?: string;
  city?: string;
  country?: string;
}

function getApplicationDestination(application: ApplicationDetail): string {
  return `/applications/${application.id}`;
}

function unwrapResponseData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if ("data" in root) {
    const data = root.data;
    if (!data || typeof data !== "object") return null;
    return data as T;
  }
  return root as T;
}

function redirectToLogin() {
  const returnUrl = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`,
  );
  window.location.assign(`/login?returnUrl=${returnUrl}`);
}

function getProfileIncompleteErrorPayload(error: ApiError): {
  missingFields: string[];
} | null {
  if (error.status !== 403) return null;
  if (!error.data || typeof error.data !== "object") return null;

  const root = error.data as Record<string, unknown>;
  if (root.code !== "PROFILE_INCOMPLETE") return null;
  const missingFields = Array.isArray(root.missingFields)
    ? root.missingFields.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];

  return { missingFields };
}

function formatMissingFields(fields: string[]): string {
  const lower = fields.map((f) => f.toLowerCase());
  if (lower.length === 0) return "the missing details";
  if (lower.length === 1) return `your ${lower[0]}`;
  if (lower.length === 2) return `your ${lower[0]} and ${lower[1]}`;
  const head = lower.slice(0, -1).join(", ");
  const tail = lower[lower.length - 1];
  return `your ${head}, and ${tail}`;
}

export default function EventApplicationIntentPage() {
  const params = useParams();
  const router = useRouter();
  const { csrfToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const slug = params.slug as string;

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [missingProfileFields, setMissingProfileFields] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const fallbackEventUrl = useMemo(() => `/events/${slug}`, [slug]);
  const profilePromptUrl = useMemo(() => {
    const returnUrl = encodeURIComponent(`/applications/event/${slug}`);
    return `/profile?required=1&returnUrl=${returnUrl}`;
  }, [slug]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    let cancelled = false;
    setError(null);
    setMissingProfileFields(null);
    setIsLoadingSummary(true);

    (async () => {
      try {
        const [profileRes, eventRes] = await Promise.all([
          apiClient<ApplicantProfileCompletionPayload>("/auth/me/profile"),
          apiClient<unknown>(`/public/events/${slug}`),
        ]);

        if (cancelled) return;

        const resolvedEvent = unwrapResponseData<EventSummary>(eventRes);
        if (!resolvedEvent?.id) {
          throw new Error("Event not found");
        }
        setEvent(resolvedEvent);

        const completion = getProfileCompletionStatus(profileRes);
        if (!completion.isComplete) {
          setMissingProfileFields(completion.missingFields);
          return;
        }

        // If an application already exists, jump straight in (idempotent).
        // The endpoint returns { data: application | null }, so a missing app
        // simply unwraps to null — no 404.
        const existingPayload = await apiClient<unknown>(
          `/events/${resolvedEvent.id}/applications/me`,
        );
        const existing = unwrapResponseData<ApplicationDetail>(existingPayload);
        if (existing?.id && !cancelled) {
          router.replace(getApplicationDestination(existing));
          return;
        }
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin();
          return;
        }
        if (err instanceof ApiError) {
          const profileIncomplete = getProfileIncompleteErrorPayload(err);
          if (profileIncomplete) {
            setMissingProfileFields(profileIncomplete.missingFields);
            return;
          }
        }
        setError(err instanceof Error ? err.message : "Could not open application");
      } finally {
        if (!cancelled) setIsLoadingSummary(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, router, authLoading, isAuthenticated]);

  const startApplication = useCallback(async () => {
    if (!event?.id || isStarting) return;
    setIsStarting(true);
    setError(null);
    try {
      const createdPayload = await apiClient<unknown>(
        `/events/${event.id}/applications/me`,
        {
          method: "POST",
          csrfToken: csrfToken ?? undefined,
        },
      );
      const application = unwrapResponseData<ApplicationDetail>(createdPayload);
      if (!application?.id) {
        throw new Error("Unable to open application");
      }
      router.replace(getApplicationDestination(application));
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin();
        return;
      }
      if (err instanceof ApiError) {
        const profileIncomplete = getProfileIncompleteErrorPayload(err);
        if (profileIncomplete) {
          setMissingProfileFields(profileIncomplete.missingFields);
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Could not open application");
    } finally {
      setIsStarting(false);
    }
  }, [event?.id, csrfToken, isStarting, router]);

  if (authLoading || isLoadingSummary) {
    return <PageSkeleton />;
  }

  // Unrecoverable error state.
  if (error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Alert variant="destructive">
          <AlertTitle>Could not open application</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="mt-4 flex gap-2">
          <Button asChild>
            <Link href={fallbackEventUrl}>Back to event</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/events">Browse events</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Profile incomplete — show the gap inline.
  if (missingProfileFields !== null) {
    return (
      <div className="mx-auto max-w-xl space-y-6 py-6">
        <PageHeader
          eyebrow={event?.title ? `Event · ${event.title}` : undefined}
          title="Almost there"
          description="A few profile details are needed before you can apply."
        />
        <Alert>
          <AlertTitle>Add {formatMissingFields(missingProfileFields)} to apply</AlertTitle>
          <AlertDescription>
            We use your profile to pre-fill applications so you don&apos;t have to type
            it for every event.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={profilePromptUrl}>
              Complete profile
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={fallbackEventUrl}>Back to event</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Summary state — profile complete, no app yet.
  const eventTitle = event?.title?.trim() || "this event";
  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <PageHeader
        eyebrow={event?.title ? `Event · ${event.title}` : undefined}
        title={`You're applying to ${eventTitle}`}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-success" />
            All set — start application
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            We&apos;ll use your name, contact info, and education from your profile.
            You can edit anything event-specific inside the application.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={startApplication} disabled={isStarting}>
              {isStarting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              )}
              Start application
            </Button>
            <Button variant="outline" asChild disabled={isStarting}>
              <Link href={fallbackEventUrl}>Back to event</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
