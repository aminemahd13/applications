"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  MessageSquare,
  ScanLine,
  Workflow,
  FileEdit,
  Globe,
  Settings,
  ArrowLeft,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useRequireAdmin } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";

interface EventInfo {
  id: string;
  name: string;
  slug: string;
}

export default function AdminEventLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useRequireAdmin();
  const params = useParams();
  const eventId = params.eventId as string;
  const [event, setEvent] = useState<EventInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<Record<string, unknown>>(`/admin/events/${eventId}`);
        const raw =
          res && typeof res === "object" && "data" in res && res.data
            ? (res.data as Record<string, unknown>)
            : res;
        setEvent({
          id: (raw.id as string) ?? eventId,
          name: (raw.title as string) ?? (raw.name as string) ?? "Event",
          slug: (raw.slug as string) ?? "",
        });
      } catch {
        /* handled */
      }
    })();
  }, [eventId]);

  if (isLoading || !user?.isGlobalAdmin) return null;

  const base = `/admin/events/${eventId}`;

  const navGroups = [
    {
      label: "Admin",
      items: [
        { label: "All Events", href: "/admin/events", icon: ArrowLeft },
      ],
    },
    {
      label: "Event Management",
      items: [
        { label: "Overview", href: base, icon: LayoutDashboard },
        { label: "Applications", href: `${base}/applications`, icon: Users },
        { label: "Reviews", href: `${base}/reviews`, icon: ClipboardCheck },
        { label: "Messages", href: `${base}/messages`, icon: MessageSquare },
        { label: "Check-in", href: `${base}/checkin`, icon: ScanLine },
      ],
    },
    {
      label: "Configuration",
      items: [
        { label: "Workflow", href: `${base}/workflow`, icon: Workflow },
        { label: "Forms", href: `${base}/forms`, icon: FileEdit },
        { label: "Microsite", href: `${base}/microsite`, icon: Globe },
        { label: "Settings", href: `${base}/settings`, icon: Settings },
      ],
    },
  ];

  return (
    <AppShell
      navGroups={navGroups}
      headerTitle="Math&Maroc"
      headerSubtitle={event?.name ?? "Admin"}
    >
      {children}
    </AppShell>
  );
}
