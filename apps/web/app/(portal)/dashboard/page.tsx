"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  MapPin,
  Clock,
  Inbox,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

interface ApplicationSummary {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventStartDate?: string;
  eventLocation?: string;
  decisionStatus: string;
  stepsCompleted: number;
  stepsTotal: number;
  nextAction?: string;
  nextDeadline?: string;
}

function getDeadlineInfo(deadline: string | undefined) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const diffMs = dl.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: "Overdue", days: diffDays, urgency: "destructive" as const };
  if (diffDays === 0) return { label: "Due today", days: 0, urgency: "destructive" as const };
  if (diffDays <= 3) return { label: `${diffDays}d left`, days: diffDays, urgency: "destructive" as const };
  if (diffDays <= 7) return { label: `${diffDays}d left`, days: diffDays, urgency: "default" as const };
  return { label: `${diffDays}d left`, days: diffDays, urgency: "secondary" as const };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

type FilterTab = "all" | "in_progress" | "accepted" | "waitlisted" | "rejected";
type SortOption = "latest" | "deadline" | "event";

export default function DashboardPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortOption>("latest");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [appsRes, inboxRes] = await Promise.allSettled([
          apiClient<{ applications: ApplicationSummary[] }>("/applications/me"),
          apiClient<{ data: Array<{ readAt: string | null }> }>(
            "/me/inbox?limit=100&unreadOnly=true"
          ),
        ]);

        const unauthorized = [appsRes, inboxRes].some(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof ApiError &&
            result.reason.status === 401,
        );

        if (unauthorized) {
          const returnUrl = encodeURIComponent(
            `${window.location.pathname}${window.location.search}`,
          );
          window.location.assign(`/login?returnUrl=${returnUrl}`);
          return;
        }

        if (appsRes.status === "fulfilled") {
          if (!cancelled) {
            setApplications(appsRes.value.applications ?? []);
          }
        }
        if (inboxRes.status === "fulfilled") {
          if (!cancelled) {
            setUnreadCount(inboxRes.value.data?.length ?? 0);
          }
        }
      } catch {
        /* handled by apiClient */
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

  // Upcoming deadlines (applications with deadlines in the future, sorted by soonest)
  const upcomingDeadlines = useMemo(() => {
    return applications
      .filter(
        (a) =>
          a.nextDeadline && new Date(a.nextDeadline).getTime() > Date.now()
      )
      .sort((a, b) => new Date(a.nextDeadline!).getTime() - new Date(b.nextDeadline!).getTime())
      .slice(0, 3);
  }, [applications]);

  // Filtered and sorted applications
  const filtered = useMemo(() => {
    let result = [...applications];

    // Filter
    switch (filter) {
      case "in_progress":
        result = result.filter((a) => a.decisionStatus === "NONE");
        break;
      case "accepted":
        result = result.filter((a) => a.decisionStatus === "ACCEPTED");
        break;
      case "waitlisted":
        result = result.filter((a) => a.decisionStatus === "WAITLISTED");
        break;
      case "rejected":
        result = result.filter((a) => a.decisionStatus === "REJECTED");
        break;
    }

    // Sort
    switch (sort) {
      case "deadline":
        result.sort((a, b) => {
          if (!a.nextDeadline) return 1;
          if (!b.nextDeadline) return -1;
          return new Date(a.nextDeadline).getTime() - new Date(b.nextDeadline).getTime();
        });
        break;
      case "event":
        result.sort((a, b) => a.eventTitle.localeCompare(b.eventTitle));
        break;
      default: // latest - keep original order (most recent first)
        break;
    }

    return result;
  }, [applications, filter, sort]);

  const acceptedCount = applications.filter((a) => a.decisionStatus === "ACCEPTED").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="My Applications"
        description="Track your event applications and next steps"
      />

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div variants={itemVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-primary/10 p-3">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{applications.length}</p>
                <p className="text-xs text-muted-foreground">Applications</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-info/10 p-3">
                <Inbox className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unreadCount}</p>
                <p className="text-xs text-muted-foreground">Unread messages</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-success/10 p-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{acceptedCount}</p>
                <p className="text-xs text-muted-foreground">Accepted</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Upcoming deadlines */}
      {upcomingDeadlines.length > 0 && (
        <Card className="border-warning/30 bg-warning/[0.03]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-warning" />
              <CardTitle className="text-sm font-semibold">Upcoming Deadlines</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingDeadlines.map((app) => {
              const info = getDeadlineInfo(app.nextDeadline);
              return (
                <Link
                  key={app.id}
                  href={`/applications/${app.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-warning/5 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{app.eventTitle}</p>
                      <p className="text-xs text-muted-foreground">{app.nextAction}</p>
                    </div>
                  </div>
                  {info && (
                    <Badge variant={info.urgency} className="shrink-0 ml-2">
                      {info.label}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Filter and sort controls */}
      {applications.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="in_progress">In Progress</TabsTrigger>
              <TabsTrigger value="accepted">Accepted</TabsTrigger>
              <TabsTrigger value="waitlisted">Waitlisted</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest first</SelectItem>
              <SelectItem value="deadline">Deadline</SelectItem>
              <SelectItem value="event">Event name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Application cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No applications yet"
          description="Browse events and submit your first application to get started."
          actionLabel="Browse events"
          actionHref="/events"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No matching applications"
          description="Try changing the filter to see more applications."
        />
      ) : (
        <motion.div
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filtered.map((app) => {
            const progress =
              app.stepsTotal > 0 ? Math.round((app.stepsCompleted / app.stepsTotal) * 100) : 0;
            const deadlineInfo = getDeadlineInfo(app.nextDeadline);

            return (
              <motion.div key={app.id} variants={itemVariants}>
                <Card className="group hover:shadow-soft-md transition-shadow duration-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold line-clamp-1">
                        {app.eventTitle}
                      </CardTitle>
                      <StatusBadge status={app.decisionStatus} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {app.eventStartDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(app.eventStartDate).toLocaleDateString()}
                        </span>
                      )}
                      {app.eventLocation && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {app.eventLocation}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                          {progress}% ({app.stepsCompleted}/{app.stepsTotal})
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    {/* Deadline + next action */}
                    <div className="flex items-center justify-between gap-2">
                      {app.nextAction && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                          <Clock className="h-3 w-3 text-warning shrink-0" />
                          <span className="truncate">{app.nextAction}</span>
                        </div>
                      )}
                      {deadlineInfo && (
                        <Badge variant={deadlineInfo.urgency} className="shrink-0 text-[10px]">
                          {deadlineInfo.label}
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        asChild
                      >
                        <Link href={`/events/${app.eventSlug}`}>
                          View website
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        className="flex-1 group-hover:bg-primary/5"
                        asChild
                      >
                        <Link href={`/applications/${app.id}`}>
                          {app.nextAction ? "Continue" : "View"}
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
