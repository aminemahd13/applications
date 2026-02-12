"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import {
  ChevronUp,
  Loader2,
  LogOut,
  MailWarning,
  User,
  type LucideIcon,
} from "lucide-react";

/* ---------- Types ---------- */

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface AppShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  headerTitle?: string;
  headerSubtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

/* ---------- Component ---------- */

export function AppShell({
  children,
  navGroups,
  headerTitle = "Math&Maroc",
  headerSubtitle,
  breadcrumbs,
}: AppShellProps) {
  const pathname = usePathname();
  const { user, logout, csrfToken } = useAuth();
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const profileHref = pathname?.startsWith("/admin") ? "/admin/profile" : "/profile";

  const initials =
    user?.fullName
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ??
    user?.email?.slice(0, 2).toUpperCase() ??
    "U";

  const reminderStorageKey = useMemo(() => {
    if (!user?.id || !user?.mustVerifyEmail) return null;

    const sessionPart =
      typeof user.sessionCreatedAt === "number"
        ? String(user.sessionCreatedAt)
        : "current";

    return `verify-email-reminder-dismissed:${user.id}:${sessionPart}`;
  }, [user?.id, user?.mustVerifyEmail, user?.sessionCreatedAt]);

  useEffect(() => {
    if (!user?.mustVerifyEmail) {
      setReminderDismissed(false);
      return;
    }

    if (!reminderStorageKey) {
      setReminderDismissed(false);
      return;
    }

    try {
      setReminderDismissed(
        window.sessionStorage.getItem(reminderStorageKey) === "1",
      );
    } catch {
      setReminderDismissed(false);
    }
  }, [user?.mustVerifyEmail, reminderStorageKey]);

  const dismissVerificationReminder = useCallback(() => {
    setReminderDismissed(true);

    if (!reminderStorageKey) return;
    try {
      window.sessionStorage.setItem(reminderStorageKey, "1");
    } catch {
      // Ignore storage failures (private mode, blocked storage).
    }
  }, [reminderStorageKey]);

  const sendVerificationEmail = useCallback(async () => {
    if (isSendingVerification) return;

    if (!csrfToken) {
      toast.error("Please wait and try again.");
      return;
    }

    setIsSendingVerification(true);
    try {
      await apiClient("/auth/email/verify/request", {
        method: "POST",
        csrfToken,
      });
      toast.success("Verification email sent.");
    } catch {
      // apiClient already shows error toast.
    } finally {
      setIsSendingVerification(false);
    }
  }, [csrfToken, isSendingVerification]);

  return (
    <SidebarProvider>
      <Sidebar
        variant="inset"
        collapsible="icon"
        wrapperClassName="print:hidden"
      >
        {/* Sidebar header */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                  M
                </div>
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-semibold text-sm">{headerTitle}</span>
                  {headerSubtitle && (
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                      {headerSubtitle}
                    </span>
                  )}
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Navigation groups */}
        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                          {item.badge != null && item.badge > 0 && (
                            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium px-1.5">
                              {item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        {/* Sidebar footer — user menu */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold text-xs">
                        {user?.fullName ?? user?.email ?? "User"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.email}
                      </span>
                    </div>
                    <ChevronUp className="ml-auto h-4 w-4 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                  align="end"
                >
                  <DropdownMenuItem asChild>
                    <Link href={profileHref}>
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Main Content Area */}
      <SidebarInset>
        {/* Top bar */}
        <header className="flex h-14 items-center gap-2 border-b px-4 lg:px-6 print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-2 h-4" />

          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.label} className="contents">
                    {i > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {i === breadcrumbs.length - 1 || !crumb.href ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </span>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {user?.mustVerifyEmail && !reminderDismissed && (
          <div className="border-b px-4 py-3 lg:px-6 print:hidden">
            <Alert className="border-warning/40 bg-warning/5">
              <MailWarning className="h-4 w-4 text-warning" />
              <AlertTitle>Email verification required</AlertTitle>
              <AlertDescription>
                <p>
                  You can continue using your account, but you still need to
                  verify your email address.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={sendVerificationEmail}
                    disabled={isSendingVerification}
                  >
                    {isSendingVerification && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Send verification email
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={dismissVerificationReminder}
                  >
                    Remind me later
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Page content */}
        <main className="flex min-h-0 flex-1 flex-col p-4 lg:p-6 print:p-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
