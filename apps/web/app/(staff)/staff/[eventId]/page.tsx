"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, CardSkeleton } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { usePermissions } from "@/lib/auth-context";

interface EventOverview {
  totalApplications: number;
  submitted: number;
  inReview: number;
  accepted: number;
  rejected: number;
  waitlisted: number;
  pendingReviews: number;
  checkedIn: number;
  totalCapacity?: number;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
  }>;
  stepFunnel: Array<{
    stepTitle: string;
    total: number;
    submitted: number;
    approved: number;
    rejected: number;
  }>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export default function StaffOverviewPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { hasPermission } = usePermissions(eventId);
  const canViewOverview = hasPermission("event.application.list");
  const [data, setData] = useState<EventOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!canViewOverview) {
        if (isMounted) {
          setData(null);
          setIsLoading(false);
        }
        return;
      }
      try {
        // Event-scoped overview endpoint may not exist; try admin event details
        let overview: EventOverview | null = null;
        try {
          const res = await apiClient<any>(`/events/${eventId}/overview`);
          overview = res?.data ?? res;
        } catch {
          // Fallback: build minimal overview from applications list
          try {
            const appRes = await apiClient<any>(`/events/${eventId}/applications?limit=1`);
            const meta = appRes?.meta ?? {};
            overview = {
              totalApplications: meta.total ?? 0,
              submitted: 0,
              inReview: 0,
              accepted: 0,
              rejected: 0,
              waitlisted: 0,
              pendingReviews: 0,
              checkedIn: 0,
              recentActivity: [],
              stepFunnel: [],
            };
          } catch {
            // Show empty state
          }
        }
        if (overview) setData(overview);
      } catch {
        /* handled */
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [eventId, canViewOverview]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Event Overview"
          description={
            canViewOverview
              ? "Overview data is not available yet"
              : "You don't have access to the overview for this event."
          }
        />
      </div>
    );
  }

  const kpis = [
    { label: "Total Applications", value: data.totalApplications, icon: Users, color: "text-primary" },
    { label: "Submitted", value: data.submitted, icon: Send, color: "text-blue-500" },
    { label: "In Review", value: data.inReview, icon: Clock, color: "text-amber-500" },
    { label: "Accepted", value: data.accepted, icon: CheckCircle2, color: "text-success" },
    { label: "Rejected", value: data.rejected, icon: XCircle, color: "text-destructive" },
    { label: "Waitlisted", value: data.waitlisted, icon: AlertTriangle, color: "text-warning" },
    { label: "Pending Reviews", value: data.pendingReviews, icon: BarChart3, color: "text-violet-500" },
    { label: "Checked In", value: data.checkedIn, icon: TrendingUp, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Event Overview" description="Key metrics and pipeline at a glance" />

      {/* KPI grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {kpis.map((kpi) => (
          <motion.div key={kpi.label} variants={cardVariants}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    {kpi.label}
                  </span>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Funnel */}
      {data.stepFunnel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application Funnel</CardTitle>
            <CardDescription>Progress through workflow steps</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.stepFunnel.map((step, i) => {
              const total = step.total || 1;
              const submittedPct = (step.submitted / total) * 100;
              const approvedPct = (step.approved / total) * 100;
              const rejectedPct = (step.rejected / total) * 100;
              return (
                <div key={step.stepTitle} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {i + 1}. {step.stepTitle}
                    </span>
                    <span className="text-muted-foreground">
                      {step.submitted} / {step.total} submitted
                    </span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div
                      className="bg-success rounded-l-full transition-all"
                      style={{ width: `${approvedPct}%` }}
                    />
                    <div
                      className="bg-primary transition-all"
                      style={{ width: `${submittedPct - approvedPct - rejectedPct}%` }}
                    />
                    <div
                      className="bg-destructive rounded-r-full transition-all"
                      style={{ width: `${rejectedPct}%` }}
                    />
                    <div
                      className="bg-muted flex-1 rounded-r-full"
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-success" />
                      {step.approved} approved
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      {step.rejected} rejected
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      {data.recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recentActivity.slice(0, 10).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{activity.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {activity.type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
