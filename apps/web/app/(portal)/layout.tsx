"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell, type NavGroup } from "@/components/layout/app-shell";
import { Home, Inbox, User, CalendarDays } from "lucide-react";
import { useRequireAuth } from "@/lib/auth-context";
import { PageSkeleton } from "@/components/shared";
import { ApiError, apiClient } from "@/lib/api";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, user, isAuthenticated } = useRequireAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();

  const isStaffUser = (user?.eventRoles?.length ?? 0) > 0;
  const isProfilePath = pathname === "/profile" || pathname.startsWith("/profile/");
  const portalRedirectTarget =
    !isAuthenticated || !user
      ? null
      : user.isGlobalAdmin
        ? isProfilePath
          ? "/admin/profile"
          : "/admin"
        : isStaffUser && !isProfilePath
          ? "/staff"
          : null;

  useEffect(() => {
    if (!portalRedirectTarget) return;
    window.location.assign(portalRedirectTarget);
  }, [portalRedirectTarget]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || portalRedirectTarget) return;
    const hasStaffRole = (user.eventRoles?.length ?? 0) > 0;
    if (user.isGlobalAdmin || hasStaffRole) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await apiClient<{ data: Array<{ id: string }> }>(
          "/me/inbox?limit=100&unreadOnly=true",
        );
        if (!cancelled) {
          setUnreadCount(res.data?.length ?? 0);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          const returnUrl = encodeURIComponent(
            `${window.location.pathname}${window.location.search}`,
          );
          window.location.assign(`/login?returnUrl=${returnUrl}`);
          return;
        }
        /* silent */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, user, portalRedirectTarget]);

  if (isLoading || !!portalRedirectTarget) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <PageSkeleton />
      </div>
    );
  }

  const portalNav: NavGroup[] = [
    {
      label: "Portal",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: Home },
        { label: "Events", href: "/events", icon: CalendarDays },
        { label: "Inbox", href: "/inbox", icon: Inbox, badge: unreadCount },
        { label: "Profile", href: "/profile", icon: User },
      ],
    },
  ];

  return <AppShell navGroups={portalNav}>{children}</AppShell>;
}
