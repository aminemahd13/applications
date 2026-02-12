"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Shield,
  ScrollText,
  Settings,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider, useOptionalAuth, useRequireAdmin } from "@/lib/auth-context";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useRequireAdmin();
  const pathname = usePathname();

  if (isLoading || !user?.isGlobalAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Event detail pages have their own AppShell with event-specific sidebar,
  // so skip the admin AppShell wrapper to avoid double/overlapping sidebars.
  const isEventDetail = /^\/admin\/events\/[^/]+/.test(pathname);
  if (isEventDetail) {
    return <>{children}</>;
  }

  const navGroups = [
    {
      label: "Administration",
      items: [
        { label: "Overview", href: "/admin", icon: LayoutDashboard },
        { label: "Events", href: "/admin/events", icon: Calendar },
        { label: "People & Stats", href: "/admin/people", icon: Users },
        { label: "Roles & Users", href: "/admin/roles", icon: Shield },
        { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
        { label: "Settings", href: "/admin/settings", icon: Settings },
      ],
    },
  ];

  return (
    <AppShell
      navGroups={navGroups}
      headerTitle="Math&Maroc"
      headerSubtitle="Admin Panel"
    >
      {children}
    </AppShell>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = useOptionalAuth();
  if (!auth) {
    return (
      <AuthProvider>
        <AdminLayoutInner>{children}</AdminLayoutInner>
      </AuthProvider>
    );
  }

  return <AdminLayoutInner>{children}</AdminLayoutInner>;
}
