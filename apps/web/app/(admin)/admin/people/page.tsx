"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Activity,
  MapPin,
  Link2,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { resolvePublicApiBaseUrl } from "@/lib/public-api-url";
import {
  buildAdminUsersExportQuery,
  filenameFromContentDisposition,
  humanizeExportColumnKey,
} from "@/lib/export-payloads";
import { toast } from "sonner";
import {
  ADMIN_USERS_EXPORT_COLUMNS,
  type AdminUsersExportColumn,
} from "@event-platform/shared";

const PUBLIC_API_URL = resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

interface AdminStats {
  totals: {
    users: number;
    applicants: number;
    nonApplicants: number;
    disabledUsers: number;
    verifiedUsers: number;
    profilesWithFullName: number;
    profilesWithPhone: number;
    profilesWithEducation: number;
    profilesWithInstitution: number;
    profilesWithLocation: number;
    profilesWithLinks: number;
    events: number;
    activeEvents: number;
    publishedEvents: number;
    draftEvents: number;
    archivedEvents: number;
    applications: number;
    checkedIn: number;
  };
  applicationsByDecision: {
    none: number;
    accepted: number;
    waitlisted: number;
    rejected: number;
  };
  topCountries: Array<{
    country: string;
    count: number;
  }>;
  topCities: Array<{
    city: string;
    country?: string;
    count: number;
  }>;
}

interface AdminUserSummary {
  id: string;
  email: string;
  fullName?: string;
  country?: string;
  city?: string;
  educationLevel?: string;
  institution?: string;
  hasPhone: boolean;
  hasLinks: boolean;
  profileCompleteness: number;
  isDisabled: boolean;
  isGlobalAdmin: boolean;
  hasStaffRole: boolean;
  staffRoleCount: number;
  accountType: "global_admin" | "staff" | "applicant" | "user";
  emailVerifiedAt?: string;
  createdAt: string;
  applicationCount: number;
  eventCount: number;
  lastApplicationAt?: string;
}

interface AdminUserListResponse {
  data: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface AdminEventStats {
  id: string;
  title: string;
  slug: string;
  status: string;
  createdAt: string;
  capacity?: number;
  totalApplications: number;
  decisionCounts: {
    none: number;
    accepted: number;
    waitlisted: number;
    rejected: number;
  };
  checkedIn: number;
}

interface AdminEventStatsResponse {
  data: AdminEventStats[];
  total: number;
  page: number;
  pageSize: number;
}

function getInitials(name?: string, email?: string) {
  if (name)
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return (email ?? "?")[0].toUpperCase();
}

function formatDate(value?: string) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-GB");
}

function asPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function getAccountTypeBadge(user: AdminUserSummary): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  if (user.accountType === "global_admin") {
    return { label: "Global Admin", variant: "default" };
  }
  if (user.accountType === "staff") {
    return { label: "Staff", variant: "secondary" };
  }
  if (user.accountType === "applicant") {
    return { label: "Applicant", variant: "outline" };
  }
  return { label: "User", variant: "outline" };
}

export default function AdminPeoplePage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isExportingUsersCsv, setIsExportingUsersCsv] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportColumns, setExportColumns] = useState<AdminUsersExportColumn[]>(
    [...ADMIN_USERS_EXPORT_COLUMNS],
  );
  const [includeResponseColumnsInExport, setIncludeResponseColumnsInExport] =
    useState(true);

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize] = useState(25);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");

  const [events, setEvents] = useState<AdminEventStats[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize] = useState(20);
  const [eventSearch, setEventSearch] = useState("");
  const [eventStatus, setEventStatus] = useState("all");

  useEffect(() => {
    let cancelled = false;
    apiClient<AdminStats>("/admin/stats")
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("page", String(userPage));
    params.set("pageSize", String(userPageSize));
    if (userSearch.trim()) params.set("search", userSearch.trim());
    if (userFilter !== "all") params.set("filter", userFilter);
    apiClient<AdminUserListResponse>(`/admin/users?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setUsers(res.data ?? []);
        setUsersTotal(res.total ?? 0);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userPage, userPageSize, userSearch, userFilter]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("page", String(eventPage));
    params.set("pageSize", String(eventPageSize));
    if (eventSearch.trim()) params.set("search", eventSearch.trim());
    if (eventStatus !== "all") params.set("status", eventStatus);
    apiClient<AdminEventStatsResponse>(
      `/admin/event-stats?${params.toString()}`,
    )
      .then((res) => {
        if (cancelled) return;
        setEvents(res.data ?? []);
        setEventsTotal(res.total ?? 0);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventPage, eventPageSize, eventSearch, eventStatus]);

  const userCanPrev = userPage > 1;
  const userCanNext = userPage * userPageSize < usersTotal;

  const eventCanPrev = eventPage > 1;
  const eventCanNext = eventPage * eventPageSize < eventsTotal;

  function toggleExportColumn(column: AdminUsersExportColumn) {
    setExportColumns((previous) =>
      previous.includes(column)
        ? previous.filter((value) => value !== column)
        : [...previous, column],
    );
  }

  async function handleExportUsersCsv() {
    const selectedColumns = Array.from(
      new Set(exportColumns.filter((column) => column.trim().length > 0)),
    );
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column to export.");
      return;
    }

    setShowExportDialog(false);
    setIsExportingUsersCsv(true);
    try {
      const params = buildAdminUsersExportQuery({
        search: userSearch,
        filter: userFilter === "all" ? undefined : userFilter,
        columns: selectedColumns,
        includeResponseColumns: includeResponseColumnsInExport,
        portal: "admin",
      });
      const queryString = params.toString();
      const endpoint =
        `${PUBLIC_API_URL}/admin/users/export` +
        (queryString ? `?${queryString}` : "");

      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromContentDisposition(
        res.headers.get("content-disposition"),
        "users-applications-export.csv"
      );
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Users and applications CSV downloaded.");
    } catch {
      toast.error("Could not export users and applications.");
    } finally {
      setIsExportingUsersCsv(false);
    }
  }

  const summaryCards = stats
    ? [
        { label: "Total Users", value: stats.totals.users, icon: Users },
        { label: "Applicants", value: stats.totals.applicants, icon: UserCheck },
        {
          label: "Non-applicants",
          value: stats.totals.nonApplicants,
          icon: Users,
        },
        {
          label: "Verified Users",
          value: stats.totals.verifiedUsers,
          icon: CheckCircle2,
        },
        {
          label: "Profiles w/ Location",
          value: stats.totals.profilesWithLocation,
          icon: MapPin,
        },
        {
          label: "Profiles w/ Links",
          value: stats.totals.profilesWithLinks,
          icon: Link2,
        },
        {
          label: "Total Applications",
          value: stats.totals.applications,
          icon: FileText,
        },
        {
          label: "Accepted",
          value: stats.applicationsByDecision.accepted,
          icon: CheckCircle2,
        },
        {
          label: "Waitlisted",
          value: stats.applicationsByDecision.waitlisted,
          icon: Clock,
        },
        {
          label: "Rejected",
          value: stats.applicationsByDecision.rejected,
          icon: XCircle,
        },
        { label: "Total Events", value: stats.totals.events, icon: Calendar },
        {
          label: "Active Events",
          value: stats.totals.activeEvents,
          icon: Activity,
        },
      ]
    : [];

  const profileCoverageRows = stats
    ? [
        { label: "Full name", value: stats.totals.profilesWithFullName },
        { label: "Phone", value: stats.totals.profilesWithPhone },
        { label: "Education", value: stats.totals.profilesWithEducation },
        { label: "Institution", value: stats.totals.profilesWithInstitution },
        { label: "Location", value: stats.totals.profilesWithLocation },
        { label: "Links", value: stats.totals.profilesWithLinks },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="People & Stats"
        description="Insights across all users, with regional and profile health breakdowns"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowExportDialog(true)}
          disabled={isExportingUsersCsv}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {isExportingUsersCsv ? "Exporting..." : "Export Users CSV"}
        </Button>
      </PageHeader>

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Export users CSV</DialogTitle>
            <DialogDescription>
              Choose the columns to include in the users and applications export.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
              <div>
                <Label className="text-sm">Include dynamic response columns</Label>
                <p className="text-xs text-muted-foreground">
                  Add one column per form response field from each application.
                </p>
              </div>
              <Switch
                checked={includeResponseColumnsInExport}
                onCheckedChange={setIncludeResponseColumnsInExport}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {exportColumns.length} column
                {exportColumns.length === 1 ? "" : "s"} selected
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setExportColumns([...ADMIN_USERS_EXPORT_COLUMNS])}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setExportColumns([])}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid max-h-80 gap-2 overflow-y-auto rounded-md border border-border/60 p-3 sm:grid-cols-2">
              {ADMIN_USERS_EXPORT_COLUMNS.map((column) => (
                <label key={column} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={exportColumns.includes(column)}
                    onCheckedChange={() => toggleExportColumn(column)}
                  />
                  <span>{humanizeExportColumnKey(column)}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportUsersCsv} disabled={isExportingUsersCsv}>
              {isExportingUsersCsv ? "Exporting..." : "Export CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {statsLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="mt-3 h-8 w-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {summaryCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    {card.label}
                  </span>
                  <card.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {stats && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground">
                  {stats.totals.verifiedUsers}
                </strong>{" "}
                verified users (
                {asPercent(stats.totals.verifiedUsers, stats.totals.users)}%)
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totals.disabledUsers}
                </strong>{" "}
                disabled users (
                {asPercent(stats.totals.disabledUsers, stats.totals.users)}%)
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totals.profilesWithFullName}
                </strong>{" "}
                profiles with full name
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totals.profilesWithPhone}
                </strong>{" "}
                profiles with phone
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totals.checkedIn}
                </strong>{" "}
                checked in
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totals.publishedEvents}
                </strong>{" "}
                published events
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totals.draftEvents}
                </strong>{" "}
                draft events
              </span>
              <span>
                <strong className="text-foreground">
                  {stats.totals.archivedEvents}
                </strong>{" "}
                archived events
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Regional Distribution</h3>
                <p className="text-xs text-muted-foreground">
                  Top locations from applicant profile data.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Countries
                  </p>
                  {stats.topCountries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No country data yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {stats.topCountries.map((country) => (
                        <div key={country.country}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate pr-2">{country.country}</span>
                            <span className="font-medium">{country.count}</span>
                          </div>
                          <Progress
                            value={asPercent(country.count, stats.totals.users)}
                            className="mt-1"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Cities
                  </p>
                  {stats.topCities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No city data yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {stats.topCities.map((city) => (
                        <div key={`${city.city}-${city.country ?? "na"}`}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate pr-2">
                              {city.city}
                              {city.country ? `, ${city.country}` : ""}
                            </span>
                            <span className="font-medium">{city.count}</span>
                          </div>
                          <Progress
                            value={asPercent(city.count, stats.totals.users)}
                            className="mt-1"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Profile Completeness</h3>
                <p className="text-xs text-muted-foreground">
                  Coverage across key profile fields.
                </p>
              </div>
              <div className="space-y-3">
                {profileCoverageRows.map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>{row.label}</span>
                      <span>
                        {row.value} / {stats.totals.users} (
                        {asPercent(row.value, stats.totals.users)}%)
                      </span>
                    </div>
                    <Progress value={asPercent(row.value, stats.totals.users)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="people" className="space-y-4">
        <TabsList>
          <TabsTrigger value="people">Users & Applicants</TabsTrigger>
          <TabsTrigger value="events">Event Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Input
                placeholder="Search by name, email, role, city, country..."
                value={userSearch}
                onChange={(e) => {
                  setUsersLoading(true);
                  setUserSearch(e.target.value);
                  setUserPage(1);
                }}
                className="pl-9"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <Select
              value={userFilter}
              onValueChange={(value) => {
                setUsersLoading(true);
                setUserFilter(value);
                setUserPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="admins">Global admins</SelectItem>
                <SelectItem value="staff">Staff & admins</SelectItem>
                <SelectItem value="non_staff">Non-staff</SelectItem>
                <SelectItem value="applicants">Applicants</SelectItem>
                <SelectItem value="non_applicants">Non-applicants</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {users.length} of {usersTotal} users.
          </p>

          {usersLoading ? (
            <TableSkeleton columns={7} />
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description={
                userSearch || userFilter !== "all"
                  ? "Try a different search or filter."
                  : "User accounts will appear here."
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Applications</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Profile</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {getInitials(user.fullName, user.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {user.fullName ?? user.email}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge
                                  variant={getAccountTypeBadge(user).variant}
                                >
                                  {getAccountTypeBadge(user).label}
                                </Badge>
                                {user.staffRoleCount > 0 && (
                                  <Badge variant="secondary">
                                    {user.staffRoleCount} role
                                    {user.staffRoleCount === 1 ? "" : "s"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">
                              {user.applicationCount}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {user.eventCount} event
                              {user.eventCount === 1 ? "" : "s"}
                            </p>
                            {user.lastApplicationAt && (
                              <p className="text-xs text-muted-foreground">
                                Last: {formatDate(user.lastApplicationAt)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.city || user.country ? (
                            <div>
                              <p className="text-sm font-medium">
                                {user.city ?? "Unknown city"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {user.country ?? "Unknown country"}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              N/A
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2 min-w-[170px]">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Completeness</span>
                              <span className="text-foreground font-medium">
                                {user.profileCompleteness}%
                              </span>
                            </div>
                            <Progress value={user.profileCompleteness} />
                            <div className="flex flex-wrap gap-1">
                              {user.hasPhone && (
                                <Badge variant="secondary">Phone</Badge>
                              )}
                              {user.educationLevel && (
                                <Badge variant="secondary">Education</Badge>
                              )}
                              {user.institution && (
                                <Badge variant="secondary">Institution</Badge>
                              )}
                              {user.hasLinks && (
                                <Badge variant="secondary">Links</Badge>
                              )}
                              {!user.hasPhone &&
                                !user.educationLevel &&
                                !user.institution &&
                                !user.hasLinks && (
                                  <span className="text-xs text-muted-foreground">
                                    Basic profile
                                  </span>
                                )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.isDisabled && (
                              <Badge variant="destructive">Disabled</Badge>
                            )}
                            {user.emailVerifiedAt && (
                              <Badge variant="secondary">Verified</Badge>
                            )}
                            {!user.emailVerifiedAt && (
                              <Badge variant="outline">Unverified</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(user.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/people/${user.id}`}>
                              Open
                              <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {userPage}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setUsersLoading(true);
                  setUserPage((prev) => Math.max(prev - 1, 1));
                }}
                disabled={!userCanPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setUsersLoading(true);
                  setUserPage((prev) => prev + 1);
                }}
                disabled={!userCanNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Input
                placeholder="Search events..."
                value={eventSearch}
                onChange={(e) => {
                  setEventsLoading(true);
                  setEventSearch(e.target.value);
                  setEventPage(1);
                }}
                className="pl-9"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <Select
              value={eventStatus}
              onValueChange={(value) => {
                setEventsLoading(true);
                setEventStatus(value);
                setEventPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {events.length} of {eventsTotal} events.
          </p>

          {eventsLoading ? (
            <TableSkeleton columns={4} />
          ) : events.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No events found"
              description={
                eventSearch || eventStatus !== "all"
                  ? "Try a different search or filter."
                  : "Events will appear here."
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Applications</TableHead>
                      <TableHead>Checked In</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => {
                      const statusLabel =
                        event.status === "archived"
                          ? "Archived"
                          : event.status === "published"
                            ? "Published"
                            : "Draft";
                      return (
                        <TableRow key={event.id}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">
                                {event.title}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  /{event.slug}
                                </span>
                                <Badge
                                  variant={
                                    event.status === "published"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {statusLabel}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">
                                {event.totalApplications}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Pending {event.decisionCounts.none} | Accepted{" "}
                                {event.decisionCounts.accepted} | Waitlisted{" "}
                                {event.decisionCounts.waitlisted} | Rejected{" "}
                                {event.decisionCounts.rejected}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">
                              {event.checkedIn}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(event.createdAt)}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {eventPage}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEventsLoading(true);
                  setEventPage((prev) => Math.max(prev - 1, 1));
                }}
                disabled={!eventCanPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEventsLoading(true);
                  setEventPage((prev) => prev + 1);
                }}
                disabled={!eventCanNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
