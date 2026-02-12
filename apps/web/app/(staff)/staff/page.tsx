"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarDays,
  LayoutDashboard,
  Search,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { AppShell, type NavGroup } from "@/components/layout/app-shell";
import { useRequireAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface StaffEventSummary {
  eventId: string;
  title: string;
  slug: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  applicationOpenAt: string | null;
  applicationCloseAt: string | null;
  roles: string[];
}

const ROLE_COLORS: Record<string, string> = {
  organizer: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  reviewer:
    "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  checkin_staff:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  content_editor:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

function formatRoleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

function formatDateRange(
  startAt: string | null,
  endAt: string | null,
): string | null {
  if (!startAt && !endAt) return null;
  const start = startAt ? new Date(startAt).toLocaleDateString() : "TBD";
  const end = endAt ? new Date(endAt).toLocaleDateString() : null;
  if (!end || end === start) return start;
  return `${start} - ${end}`;
}

function normalizeStatus(status: string): string {
  const value = String(status ?? "").toLowerCase();
  if (!value) return "unknown";
  return value;
}

function fallbackFromEventRoles(
  eventRoles?: Array<{ eventId: string; role: string }>,
): StaffEventSummary[] {
  if (!eventRoles || eventRoles.length === 0) return [];

  const grouped = new Map<string, Set<string>>();
  for (const assignment of eventRoles) {
    if (!assignment.eventId) continue;
    if (!grouped.has(assignment.eventId))
      grouped.set(assignment.eventId, new Set());
    grouped
      .get(assignment.eventId)
      ?.add(String(assignment.role ?? "").toLowerCase());
  }

  return Array.from(grouped.entries()).map(([eventId, roles]) => ({
    eventId,
    title: `Event ${eventId.slice(0, 8)}`,
    slug: "",
    status: "unknown",
    startAt: null,
    endAt: null,
    applicationOpenAt: null,
    applicationCloseAt: null,
    roles: Array.from(roles).sort((a, b) => a.localeCompare(b)),
  }));
}

export default function StaffDashboardPage() {
  const auth = useRequireAuth();
  const [events, setEvents] = useState<StaffEventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (auth.isLoading || !auth.user) return;

    if (auth.user.isGlobalAdmin) {
      window.location.assign("/admin");
      return;
    }

    if ((auth.user.eventRoles?.length ?? 0) === 0) {
      window.location.assign("/dashboard");
      return;
    }

    (async () => {
      try {
        const res = await apiClient<{ data: StaffEventSummary[] }>(
          "/auth/me/staff-events",
        );
        const data = Array.isArray(res.data) ? res.data : [];
        setEvents(data);
      } catch {
        // Fallback to role-only data if endpoint is temporarily unavailable.
        setEvents(fallbackFromEventRoles(auth.user?.eventRoles));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [auth.isLoading, auth.user]);

  const filteredEvents = useMemo(() => {
    if (!query.trim()) return events;
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      const haystack = [
        event.title,
        event.slug,
        ...event.roles.map((role) => formatRoleLabel(role)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, query]);

  const organizerEventCount = useMemo(
    () => events.filter((event) => event.roles.includes("organizer")).length,
    [events],
  );

  const navGroups: NavGroup[] = [
    {
      label: "Staff",
      items: [{ label: "Dashboard", href: "/staff", icon: LayoutDashboard }],
    },
    {
      label: "My Events",
      items: events.map((event) => ({
        label: event.title,
        href: `/staff/${event.eventId}`,
        icon: CalendarDays,
      })),
    },
  ].filter((group) => group.items.length > 0);

  if (auth.isLoading || isLoading) {
    return (
      <AppShell
        navGroups={navGroups}
        headerTitle="Math&Maroc"
        headerSubtitle="Staff Dashboard"
      >
        <div className="space-y-6">
          <PageHeader title="Staff Dashboard" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <CardSkeleton key={idx} />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      navGroups={navGroups}
      headerTitle="Math&Maroc"
      headerSubtitle="Staff Dashboard"
    >
      <div className="space-y-6">
        <PageHeader
          title="Staff Dashboard"
          description="Choose an event workspace to manage applications, reviews, messaging, and check-in."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BriefcaseBusiness className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{events.length}</p>
                <p className="text-xs text-muted-foreground">Assigned events</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{organizerEventCount}</p>
                <p className="text-xs text-muted-foreground">
                  Organizer events
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {events.reduce((sum, event) => sum + event.roles.length, 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Role assignments
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events by name, slug, or role..."
            className="pl-9"
          />
        </div>

        {filteredEvents.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={
              events.length === 0 ? "No assigned events" : "No matching events"
            }
            description={
              events.length === 0
                ? "You do not have any staff or organizer assignments yet."
                : "Try a different search term."
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredEvents.map((event) => {
              const dateRange = formatDateRange(event.startAt, event.endAt);
              const status = normalizeStatus(event.status);
              const isOrganizer = event.roles.includes("organizer");

              return (
                <Card key={event.eventId} className="flex h-full flex-col">
                  <CardHeader className="space-y-2">
                    <CardTitle className="line-clamp-2 text-base">
                      {event.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="capitalize">
                        {status}
                      </Badge>
                      {event.slug && (
                        <span className="truncate">/{event.slug}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      {event.roles.map((role) => (
                        <span
                          key={`${event.eventId}-${role}`}
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {formatRoleLabel(role)}
                        </span>
                      ))}
                    </div>

                    {dateRange && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Dates:
                        </span>{" "}
                        {dateRange}
                      </div>
                    )}

                    <div className="mt-auto flex gap-2">
                      <Button asChild className="flex-1">
                        <Link href={`/staff/${event.eventId}`}>
                          Open workspace
                        </Link>
                      </Button>
                      {isOrganizer && (
                        <Button variant="outline" asChild>
                          <Link href={`/staff/${event.eventId}/settings`}>
                            <Settings className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
