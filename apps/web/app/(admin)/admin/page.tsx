"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Calendar,
  Users,
  TrendingUp,
  Activity,
  Shield,
  Plus,
  ArrowRight,
  ScrollText,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, CardSkeleton } from "@/components/shared";
import { apiClient } from "@/lib/api";

interface AdminOverview {
  totalEvents: number;
  activeEvents: number;
  totalUsers: number;
  totalApplications: number;
  totalStaff: number;
  totalStaffAssignments?: number;
  recentEvents: Array<{
    id: string;
    name: string;
    applicationCount: number;
    isPublished: boolean;
    createdAt: string;
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

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<AdminOverview>("/admin/overview");
        setData(res);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Overview" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const kpis = [
    {
      label: "Total Events",
      value: data.totalEvents,
      icon: Calendar,
      color: "text-primary",
    },
    {
      label: "Active Events",
      value: data.activeEvents,
      icon: Activity,
      color: "text-success",
    },
    {
      label: "Total Users",
      value: data.totalUsers,
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: "Total Applications",
      value: data.totalApplications,
      icon: TrendingUp,
      color: "text-violet-500",
    },
    {
      label: "Staff Users",
      value: data.totalStaff,
      icon: Shield,
      color: "text-amber-500",
    },
    {
      label: "Role Assignments",
      value: data.totalStaffAssignments ?? data.totalStaff,
      icon: Shield,
      color: "text-orange-500",
    },
  ];

  const quickActions = [
    { label: "Create Event", href: "/admin/events", icon: Plus },
    { label: "People & Stats", href: "/admin/people", icon: Users },
    { label: "Manage Roles", href: "/admin/roles", icon: Shield },
    { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
    { label: "Settings", href: "/admin/settings", icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Overview"
        description="Platform-wide metrics and recent activity"
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            className="h-auto py-3 justify-start gap-3"
            asChild
          >
            <Link href={action.href}>
              <action.icon className="h-4 w-4" />
              {action.label}
            </Link>
          </Button>
        ))}
      </div>

      {/* KPI Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-3 gap-4"
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

      {/* Recent events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Events</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/events">
              View all
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {data.recentEvents.map((event) => (
              <Link
                key={event.id}
                href={`/admin/events/${event.id}`}
                className="flex items-center justify-between text-sm p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.applicationCount} applications - Created{" "}
                    {new Date(event.createdAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={event.isPublished ? "default" : "secondary"}>
                    {event.isPublished ? "Published" : "Draft"}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
