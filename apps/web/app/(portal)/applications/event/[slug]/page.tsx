"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface EventSummary {
  id: string;
  slug: string;
}

interface ApplicationDetail {
  id: string;
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

export default function EventApplicationIntentPage() {
  const params = useParams();
  const router = useRouter();
  const { csrfToken, isLoading: authLoading, isAuthenticated } = useAuth();
  const slug = params.slug as string;
  const [error, setError] = useState<string | null>(null);

  const fallbackEventUrl = useMemo(() => `/events/${slug}`, [slug]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const eventPayload = await apiClient<unknown>(`/public/events/${slug}`);
        const event = unwrapResponseData<EventSummary>(eventPayload);

        if (!event?.id) {
          throw new Error("Event not found");
        }

        const existingPayload = await apiClient<unknown>(`/events/${event.id}/applications/me`);
        let application = unwrapResponseData<ApplicationDetail>(existingPayload);

        if (!application) {
          const createdPayload = await apiClient<unknown>(`/events/${event.id}/applications/me`, {
            method: "POST",
            csrfToken: csrfToken ?? undefined,
          });
          application = unwrapResponseData<ApplicationDetail>(createdPayload);
        }

        if (!application?.id) {
          throw new Error("Unable to open application");
        }

        if (!cancelled) {
          router.replace(getApplicationDestination(application));
        }
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin();
          return;
        }
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open application");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, router, csrfToken, authLoading, isAuthenticated]);

  if (!error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Opening your application...</p>
      </div>
    );
  }

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
