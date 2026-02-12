"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Calendar,
  MapPin,
  Search,
  ArrowRight,
  Monitor,
  Users,
  Globe,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, EmptyState, PageHeader, CardSkeleton } from "@/components/shared";
import { ApiError, apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface PublicEvent {
  id: string;
  title: string;
  slug: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  applicationDeadline?: string;
  location?: string;
  format?: string;
  status: string;
  applicationsStatus?: string;
  applicationCount?: number;
}

interface MyApplicationSummary {
  id: string;
  eventSlug: string;
  nextAction?: string;
}

interface EventsApiMeta {
  nextCursor?: string | null;
  hasMore?: boolean;
}

type EventsPayload =
  | PublicEvent[]
  | {
      data?: Array<Record<string, unknown>>;
      events?: PublicEvent[];
      meta?: EventsApiMeta;
    };

function toNormalizedFormat(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.toUpperCase().replace(/[\s-]+/g, "_");
}

function inferApplicationsStatus(raw: Record<string, unknown>): "OPEN" | "CLOSED" {
  const explicit = raw.applicationsStatus;
  if (typeof explicit === "string") {
    return explicit.toUpperCase() === "OPEN" ? "OPEN" : "CLOSED";
  }

  const eventStatus = String(raw.status ?? "").toLowerCase();
  if (eventStatus !== "published") return "CLOSED";

  const closeAt = raw.applicationDeadline ?? raw.applicationCloseAt ?? raw.applicationsCloseAt;
  if (typeof closeAt === "string" && closeAt) {
    const closeTs = new Date(closeAt).getTime();
    if (!Number.isNaN(closeTs) && closeTs < Date.now()) return "CLOSED";
  }

  return "OPEN";
}

const FORMAT_CONFIG: Record<string, { icon: typeof Monitor; label: string }> = {
  "IN_PERSON": { icon: Users, label: "In-person" },
  "ONLINE": { icon: Monitor, label: "Online" },
  "HYBRID": { icon: Globe, label: "Hybrid" },
};

function getDeadlineLabel(deadline: string | undefined) {
  if (!deadline) return null;
  const diffMs = new Date(deadline).getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  if (diffDays === 0) return { label: "Closes today", variant: "destructive" as const };
  if (diffDays <= 3) return { label: `${diffDays}d left`, variant: "destructive" as const };
  if (diffDays <= 7) return { label: `${diffDays}d left`, variant: "default" as const };
  return { label: `${diffDays}d left`, variant: "secondary" as const };
}

function unpackEventsPayload(payload: EventsPayload): {
  rows: Array<Record<string, unknown>>;
  nextCursor: string | null;
  hasMore: boolean;
} {
  if (Array.isArray(payload)) {
    return {
      rows: payload as unknown as Array<Record<string, unknown>>,
      nextCursor: null,
      hasMore: false,
    };
  }

  const rawRows = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.events)
      ? (payload.events as unknown as Array<Record<string, unknown>>)
      : [];

  return {
    rows: rawRows,
    nextCursor: payload.meta?.nextCursor ?? null,
    hasMore: Boolean(payload.meta?.hasMore),
  };
}

function normalizeEvents(rows: Array<Record<string, unknown>>): PublicEvent[] {
  return rows
    .map((record) => {
      return {
        id: String(record.id ?? ""),
        title: String(record.title ?? record.name ?? "Untitled"),
        slug: String(record.slug ?? ""),
        description:
          typeof record.description === "string" ? record.description : undefined,
        startDate:
          typeof record.startDate === "string"
            ? record.startDate
            : typeof record.startAt === "string"
              ? record.startAt
              : undefined,
        endDate:
          typeof record.endDate === "string"
            ? record.endDate
            : typeof record.endAt === "string"
              ? record.endAt
              : undefined,
        applicationDeadline:
          typeof record.applicationDeadline === "string"
            ? record.applicationDeadline
            : typeof record.applicationCloseAt === "string"
              ? record.applicationCloseAt
              : typeof record.applicationsCloseAt === "string"
                ? record.applicationsCloseAt
                : undefined,
        location:
          typeof record.location === "string"
            ? record.location
            : typeof record.venueName === "string"
              ? record.venueName
              : undefined,
        format: toNormalizedFormat(record.format),
        status: String(record.status ?? "draft").toLowerCase(),
        applicationsStatus: inferApplicationsStatus(record),
        applicationCount:
          typeof record.applicationCount === "number"
            ? record.applicationCount
            : undefined,
      };
    })
    .filter((event) => Boolean(event.slug));
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

type SortOption = "newest" | "deadline" | "name";

export default function EventsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [applicationsBySlug, setApplicationsBySlug] = useState<Record<string, MyApplicationSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState<SortOption>("newest");

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const applicationsRequest = isAuthenticated
          ? apiClient<{ applications?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
              "/applications/me",
            )
          : Promise.resolve([] as Array<Record<string, unknown>>);

        const [eventsRes, appsRes] = await Promise.allSettled([
          apiClient<EventsPayload>("/public/events?limit=24"),
          applicationsRequest,
        ]);

        if (
          appsRes.status === "rejected" &&
          appsRes.reason instanceof ApiError &&
          appsRes.reason.status === 401
        ) {
          const returnUrl = encodeURIComponent(
            `${window.location.pathname}${window.location.search}`,
          );
          window.location.assign(`/login?returnUrl=${returnUrl}`);
          return;
        }

        const payload =
          eventsRes.status === "fulfilled"
            ? unpackEventsPayload(eventsRes.value)
            : { rows: [], nextCursor: null, hasMore: false };
        const mapped = normalizeEvents(payload.rows);

        if (!cancelled) {
          setEvents(mapped);
          setNextCursor(payload.nextCursor);
          setHasMore(payload.hasMore);
        }

        if (isAuthenticated && appsRes.status === "fulfilled") {
          const payload = appsRes.value;
          const rawApps = Array.isArray(payload)
            ? payload
            : Array.isArray(payload.applications)
              ? payload.applications
              : [];

          const map: Record<string, MyApplicationSummary> = {};
          rawApps.forEach((entry) => {
            if (!entry || typeof entry !== "object") return;
            const row = entry as Record<string, unknown>;
            if (typeof row.id !== "string" || typeof row.eventSlug !== "string") return;
            map[row.eventSlug] = {
              id: row.id,
              eventSlug: row.eventSlug,
              nextAction:
                typeof row.nextAction === "string" ? row.nextAction : undefined,
            };
          });
          if (!cancelled) {
            setApplicationsBySlug(map);
          }
        } else if (!cancelled) {
          setApplicationsBySlug({});
        }
      } catch {
        /* handled */
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  async function loadMoreEvents() {
    if (!hasMore || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const payload = await apiClient<EventsPayload>(
        `/public/events?limit=24&cursor=${encodeURIComponent(nextCursor)}`
      );
      const unpacked = unpackEventsPayload(payload);
      const mapped = normalizeEvents(unpacked.rows);
      setEvents((prev) => {
        const seen = new Set(prev.map((event) => event.id));
        const appended = mapped.filter((event) => !seen.has(event.id));
        return [...prev, ...appended];
      });
      setNextCursor(unpacked.nextCursor);
      setHasMore(unpacked.hasMore);
    } catch {
      /* handled by apiClient */
    } finally {
      setIsLoadingMore(false);
    }
  }

  const filtered = useMemo(() => {
    const now = Date.now();
    const result = events.filter((e) => {
      const matchesSearch =
        !search ||
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.description?.toLowerCase().includes(search.toLowerCase());

      const matchesTab =
        tab === "all" ||
        (tab === "open" && e.applicationsStatus === "OPEN") ||
        (tab === "upcoming" &&
          !!e.startDate &&
          new Date(e.startDate).getTime() > now) ||
        (tab === "archived" && e.status === "archived");

      return matchesSearch && matchesTab;
    });

    // Sort
    switch (sort) {
      case "deadline":
        result.sort((a, b) => {
          const aDeadline = a.applicationDeadline ?? a.startDate;
          const bDeadline = b.applicationDeadline ?? b.startDate;
          if (!aDeadline) return 1;
          if (!bDeadline) return -1;
          return new Date(aDeadline).getTime() - new Date(bDeadline).getTime();
        });
        break;
      case "name":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default: // newest: keep original API order
        break;
    }

    return result;
  }, [events, search, tab, sort]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Browse competitions, training camps, and programs"
      />

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="deadline">Deadline</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Event grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={search || tab !== "all" ? "No matching events" : "No events found"}
          description={
            search
              ? "Try a different search term or change the filter."
              : tab !== "all"
              ? "No events match this filter. Try switching to \"All\"."
              : "No events are available at the moment. Check back soon!"
          }
        />
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filtered.map((event) => {
            const formatInfo = event.format ? FORMAT_CONFIG[event.format] : null;
            const deadline = getDeadlineLabel(event.applicationDeadline);
            const existingApplication = applicationsBySlug[event.slug];
            const hasApplication = Boolean(existingApplication?.id);
            const canStart = event.applicationsStatus === "OPEN";
            const applicationHref = `/applications/event/${event.slug}`;
            const ctaHref = hasApplication || canStart ? applicationHref : `/events/${event.slug}`;
            const ctaLabel = hasApplication
              ? existingApplication?.nextAction
                ? "Continue application"
                : "See application"
              : canStart
                ? "Start application"
                : "View event";

            return (
              <motion.div key={event.id} variants={itemVariants}>
                <Card className="group hover:shadow-soft-md transition-all duration-200 flex flex-col h-full">
                  {/* Color accent bar */}
                  <div className="h-1 rounded-t-[inherit] bg-gradient-to-r from-blue-500 to-violet-500 opacity-60" />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold line-clamp-2">
                        {event.title}
                      </CardTitle>
                      <StatusBadge
                        status={event.applicationsStatus ?? event.status}
                      />
                    </div>
                    {/* Format + deadline badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {formatInfo && (
                        <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                          <formatInfo.icon className="h-3 w-3" />
                          {formatInfo.label}
                        </Badge>
                      )}
                      {deadline && event.applicationsStatus === "OPEN" && (
                        <Badge variant={deadline.variant} className="text-[10px] gap-1">
                          <Timer className="h-3 w-3" />
                          {deadline.label}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    {event.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {event.description}
                      </p>
                    )}

                    <div className="mt-auto space-y-3">
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {event.startDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(event.startDate).toLocaleDateString()}
                            {event.endDate && ` - ${new Date(event.endDate).toLocaleDateString()}`}
                          </span>
                        )}
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" asChild>
                          <Link href={ctaHref}>
                            {ctaLabel}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {!isLoading && hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadMoreEvents}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading..." : "Load more events"}
          </Button>
        </div>
      )}
    </div>
  );
}

