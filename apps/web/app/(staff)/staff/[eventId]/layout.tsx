"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  MessageSquare,
  ScanLine,
  Workflow,
  FileEdit,
  Globe,
  Settings,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useRequireAuth, usePermissions } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";

interface EventInfo {
  id: string;
  name: string;
  slug: string;
}

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useRequireAuth();
  const params = useParams();
  const pathname = usePathname();
  const eventId = params.eventId as string;
  const [event, setEvent] = useState<EventInfo | null>(null);
  const { hasPermission } = usePermissions(eventId);

  // Redirect non-staff, non-admin users away from staff pages
  useEffect(() => {
    if (auth.isLoading || !auth.user) return;
    if (auth.user.isGlobalAdmin) return; // admins can access any event
    const hasEventRole = auth.user.eventRoles?.some(
      (r) => r.eventId === eventId,
    );
    if (!hasEventRole) {
      if ((auth.user.eventRoles?.length ?? 0) > 0) {
        window.location.assign("/staff");
      } else {
        window.location.assign("/dashboard");
      }
    }
  }, [auth.isLoading, auth.user, eventId]);

  useEffect(() => {
    if (!hasPermission("event.update")) return;

    (async () => {
      try {
        const res = await apiClient<
          Record<string, unknown> | { data: Record<string, unknown> }
        >(`/admin/events/${eventId}`);
        const raw: Record<string, unknown> =
          res && typeof res === "object" && "data" in res
            ? ((res as { data?: Record<string, unknown> }).data ?? {})
            : (res as Record<string, unknown>);
        setEvent({
          id: String(raw.id ?? eventId),
          name: String(raw.title ?? raw.name ?? "Event"),
          slug: String(raw.slug ?? ""),
        });
      } catch {
        /* handled */
      }
    })();
  }, [eventId, hasPermission]);

  const base = `/staff/${eventId}`;
  const canManageMicrosite =
    hasPermission("event.microsite.manage") ||
    hasPermission("event.microsite.manage_settings") ||
    hasPermission("event.microsite.pages.manage");

  const navGroups = [
    {
      label: "Event Management",
      items: [
        { label: "Overview", href: base, icon: LayoutDashboard, visible: true },
        {
          label: "Applications",
          href: `${base}/applications`,
          icon: Users,
          visible: hasPermission("event.application.list"),
        },
        {
          label: "Reviews",
          href: `${base}/reviews`,
          icon: ClipboardCheck,
          visible: hasPermission("event.step.review"),
        },
        {
          label: "Messages",
          href: `${base}/messages`,
          icon: MessageSquare,
          visible: hasPermission("event.messages.read"),
        },
        {
          label: "Check-in",
          href: `${base}/checkin`,
          icon: ScanLine,
          visible: hasPermission("event.checkin.scan"),
        },
      ].filter((i) => i.visible),
    },
    {
      label: "Configuration",
      items: [
        {
          label: "Workflow",
          href: `${base}/workflow`,
          icon: Workflow,
          visible: hasPermission("event.workflow.manage"),
        },
        {
          label: "Forms",
          href: `${base}/forms`,
          icon: FileEdit,
          visible: hasPermission("event.forms.manage_draft"),
        },
        {
          label: "Microsite",
          href: `${base}/microsite`,
          icon: Globe,
          visible: canManageMicrosite,
        },
        {
          label: "Settings",
          href: `${base}/settings`,
          icon: Settings,
          visible: hasPermission("event.update"),
        },
      ].filter((i) => i.visible),
    },
  ].filter((g) => g.items.length > 0);
  const isMicrositeBuilder = /^\/staff\/[^/]+\/microsite\/[^/]+/.test(pathname);

  return (
    <AppShell
      navGroups={navGroups}
      headerTitle="Math&Maroc"
      headerSubtitle={event?.name ?? "Event"}
    >
      <div className={isMicrositeBuilder ? "min-h-0" : "space-y-4 min-h-0"}>
        {!isMicrositeBuilder && (
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href="/staff">
              <ArrowLeft className="h-4 w-4" />
              Back to Staff Dashboard
            </Link>
          </Button>
        )}
        {children}
      </div>
    </AppShell>
  );
}
