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
import { useI18n } from "@/lib/i18n";
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
  translateLabel?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  translateLabel?: boolean;
}

interface AppShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  headerTitle?: string;
  headerSubtitle?: string;
  translateHeaderTitle?: boolean;
  translateHeaderSubtitle?: boolean;
  breadcrumbs?: Array<{ label: string; href?: string; translateLabel?: boolean }>;
}

/* ---------- Component ---------- */

export function AppShell({
  children,
  navGroups,
  headerTitle = "Math&Maroc",
  headerSubtitle,
  translateHeaderTitle = true,
  translateHeaderSubtitle = true,
  breadcrumbs,
}: AppShellProps) {
  const pathname = usePathname();
  const { user, logout, csrfToken } = useAuth();
  const { locale, setLocale, t } = useI18n();
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
      toast.error(t("Please wait and try again."));
      return;
    }

    setIsSendingVerification(true);
    try {
      await apiClient("/auth/email/verify/request", {
        method: "POST",
        csrfToken,
      });
      toast.success(t("Verification email sent."));
    } catch {
      // apiClient already shows error toast.
    } finally {
      setIsSendingVerification(false);
    }
  }, [csrfToken, isSendingVerification, t]);

  const localizedNavGroups = useMemo(
    () =>
      navGroups.map((group) => ({
        ...group,
        label: group.translateLabel === false ? group.label : t(group.label),
        items: group.items.map((item) => ({
          ...item,
          label: item.translateLabel === false ? item.label : t(item.label),
        })),
      })),
    [navGroups, t],
  );

  const localizedBreadcrumbs = useMemo(
    () =>
      breadcrumbs?.map((crumb) => ({
        ...crumb,
        label: crumb.translateLabel === false ? crumb.label : t(crumb.label),
      })),
    [breadcrumbs, t],
  );

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
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <div className="font-display flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-base font-semibold tracking-tight">
                  M
                </div>
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-display font-semibold text-sm tracking-tight">
                    {translateHeaderTitle ? t(headerTitle) : headerTitle}
                  </span>
                  {headerSubtitle && (
                    <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {translateHeaderSubtitle ? t(headerSubtitle) : headerSubtitle}
                    </span>
                  )}
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Navigation groups */}
        <SidebarContent>
          {localizedNavGroups.map((group) => (
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
                        {user?.fullName ?? user?.email ?? t("User")}
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
                      {t("Profile")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {t("Log out")}
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
          {localizedBreadcrumbs && localizedBreadcrumbs.length > 0 && (
            <div className="min-w-0 flex-1 overflow-x-auto">
            <Breadcrumb>
              <BreadcrumbList>
                {localizedBreadcrumbs.map((crumb, i) => (
                  <span key={crumb.label} className="contents">
                    {i > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {i === localizedBreadcrumbs.length - 1 || !crumb.href ? (
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
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-2.5 text-xs font-medium"
              onClick={() => setLocale(locale === "en" ? "fr" : "en")}
              aria-label={t("Switch language")}
              title={t("Switch language")}
            >
              {locale === "en" ? "FR" : "EN"}
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {user?.mustVerifyEmail && !reminderDismissed && (
          <div className="border-b px-4 py-3 lg:px-6 print:hidden">
            <Alert className="border-warning/40 bg-warning/5">
              <MailWarning className="h-4 w-4 text-warning" />
              <AlertTitle>{t("Email verification required")}</AlertTitle>
              <AlertDescription>
                <p>
                  {t(
                    "You can continue using your account, but you still need to verify your email address.",
                  )}
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
                    {t("Send verification email")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={dismissVerificationReminder}
                  >
                    {t("Remind me later")}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Page content */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip p-4 lg:p-6 print:p-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
