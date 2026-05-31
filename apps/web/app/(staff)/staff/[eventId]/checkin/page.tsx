"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  ScanLine,
  Search,
  CheckCircle2,
  XCircle,
  Undo2,
  Users,
  UserCheck,
  Clock,
  Loader2,
  QrCode,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
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
import { Checkbox } from "@/components/ui/checkbox";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PageHeader,
  CardSkeleton,
  ConfirmDialog,
  QrScanner,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { resolvePublicApiBaseUrl } from "@/lib/public-api-url";
import {
  filenameFromContentDisposition,
  humanizeExportColumnKey,
  resolvePortalFromPathname,
} from "@/lib/export-payloads";
import {
  buildCheckinAttendeesQuery,
  buildCheckinExportRequest,
} from "@/lib/checkin-filters";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  CHECKIN_EXPORT_COLUMNS,
  type CheckinAttendeeStatus,
  type CheckinExportColumn,
} from "@event-platform/shared";

const PUBLIC_API_URL = resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

interface CheckinStats {
  total: number;
  checkedIn: number;
  remaining: number;
}

interface CheckinResult {
  id: string;
  applicantName: string;
  applicantEmail: string;
  status: "SUCCESS" | "ALREADY_CHECKED_IN" | "INVALID_STATUS";
  checkedInAt?: string;
  message: string;
}

interface CheckinEntry {
  id: string;
  applicantName: string;
  applicantEmail: string;
  checkedInAt: string;
  checkedInBy: string;
}

interface LookupResult {
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  status: string;
  checkedInAt?: string;
  checkedInBy?: string;
}

interface CheckinAttendeeRow {
  applicationId: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
  decisionStatus: string;
  attendanceStatus: string;
  isCheckedIn: boolean;
  checkedInAt?: string;
  checkedInByUserId?: string;
  checkedInByEmail?: string;
  tags: string;
  applicationPath: string;
  applicationUrl: string;
  staffApplicationPath: string;
  adminApplicationPath: string;
  staffApplicationUrl: string;
  adminApplicationUrl: string;
  applicationCreatedAt: string;
  applicationUpdatedAt: string;
}

interface CheckinAttendeesResponse {
  data: CheckinAttendeeRow[];
  meta: {
    page?: number;
    pageSize?: number;
    total: number;
    checkedIn: number;
    notCheckedIn: number;
    availableTags: string[];
  };
}

function normalizeCheckinResult(raw: any): CheckinResult {
  const status = (raw?.status ?? "INVALID_STATUS") as CheckinResult["status"];
  const applicantName =
    raw?.applicantName ?? raw?.applicant?.name ?? "Unknown attendee";
  const applicantEmail = raw?.applicantEmail ?? raw?.applicant?.email ?? "";

  const message =
    raw?.message ??
    (status === "SUCCESS"
      ? "Checked in successfully"
      : status === "ALREADY_CHECKED_IN"
        ? "Already checked in"
        : "Ticket is not eligible for check-in");

  return {
    id: String(raw?.id ?? raw?.applicant?.id ?? ""),
    applicantName,
    applicantEmail,
    status,
    checkedInAt: raw?.checkedInAt ?? raw?.timestamp,
    message,
  };
}

function parseTagList(tags: string): string[] {
  if (!tags) return [];
  return Array.from(
    new Set(
      tags
        .split("|")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  );
}

export default function CheckinPage() {
  const params = useParams();
  const pathname = usePathname();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canViewDashboard = hasPermission("event.checkin.dashboard.view");
  const canScan = hasPermission("event.checkin.scan");
  const canLookup = hasPermission("event.checkin.manual_lookup");
  const canUndo = hasPermission("event.checkin.undo");
  const exportPortal = resolvePortalFromPathname(pathname ?? "");

  const [stats, setStats] = useState<CheckinStats>({ total: 0, checkedIn: 0, remaining: 0 });
  const [recentCheckins, setRecentCheckins] = useState<CheckinEntry[]>([]);
  const [checkinEnabled, setCheckinEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [attendees, setAttendees] = useState<CheckinAttendeeRow[]>([]);
  const [attendeesTotal, setAttendeesTotal] = useState(0);
  const [attendeesCheckedIn, setAttendeesCheckedIn] = useState(0);
  const [attendeesNotCheckedIn, setAttendeesNotCheckedIn] = useState(0);
  const [attendeeAvailableTags, setAttendeeAvailableTags] = useState<string[]>([]);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [attendeeStatusFilter, setAttendeeStatusFilter] =
    useState<CheckinAttendeeStatus>("all");
  const [attendeeSearchInput, setAttendeeSearchInput] = useState("");
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [attendeeTagsFilter, setAttendeeTagsFilter] = useState<string[]>([]);
  const [attendeesPage, setAttendeesPage] = useState(1);
  const [attendeesPageSize] = useState(50);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExportingAttendeesCsv, setIsExportingAttendeesCsv] = useState(false);
  const [exportColumns, setExportColumns] = useState<CheckinExportColumn[]>(
    [...CHECKIN_EXPORT_COLUMNS],
  );

  // Scan / lookup state
  const [scanInput, setScanInput] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [lastResult, setLastResult] = useState<CheckinResult | null>(null);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [undoTarget, setUndoTarget] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);

  const refreshDashboardData = useCallback(async () => {
    let statsData: CheckinStats = { total: 0, checkedIn: 0, remaining: 0 };
    let recentData: CheckinEntry[] = [];
    let enabled = true;

    if (!canViewDashboard) {
      setStats(statsData);
      setRecentCheckins(recentData);
      return;
    }

    try {
      const sRes = await apiClient<any>(`/events/${eventId}/check-in/stats`);
      if (sRes && typeof sRes === "object" && "enabled" in sRes && sRes.enabled === false) {
        enabled = false;
      }
      const rawStats =
        sRes && typeof sRes === "object" && "data" in sRes ? sRes.data : sRes;
      if (rawStats && typeof rawStats === "object") {
        statsData = {
          total: Number(rawStats.total ?? 0),
          checkedIn: Number(rawStats.checkedIn ?? 0),
          remaining: Number(rawStats.remaining ?? 0),
        };
      }
    } catch {
      /* stats endpoint may not exist */
    }

    if (enabled) {
      try {
        const rRes = await apiClient<any>(`/events/${eventId}/check-in/recent`);
        if (rRes && typeof rRes === "object" && "enabled" in rRes && rRes.enabled === false) {
          enabled = false;
        }
        const rList = Array.isArray(rRes)
          ? rRes
          : Array.isArray(rRes?.data)
          ? rRes.data
          : [];
        recentData = rList;
      } catch {
        /* recent endpoint may not exist */
      }
    }

    setStats(statsData);
    setRecentCheckins(recentData);
    setCheckinEnabled(enabled);
  }, [eventId, canViewDashboard]);

  const refreshAttendees = useCallback(async () => {
    if (!canViewDashboard || !checkinEnabled) {
      setAttendees([]);
      setAttendeesTotal(0);
      setAttendeesCheckedIn(0);
      setAttendeesNotCheckedIn(0);
      setAttendeeAvailableTags([]);
      return;
    }

    setIsLoadingAttendees(true);
    try {
      const params = buildCheckinAttendeesQuery({
        status: attendeeStatusFilter,
        tags: attendeeTagsFilter,
        search: attendeeSearch,
        page: attendeesPage,
        pageSize: attendeesPageSize,
      });
      const query = params.toString();
      const payload = await apiClient<CheckinAttendeesResponse>(
        `/events/${eventId}/check-in/attendees${query ? `?${query}` : ""}`,
      );
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const meta = payload?.meta;
      setAttendees(rows);
      setAttendeesTotal(Number(meta?.total ?? rows.length));
      setAttendeesCheckedIn(Number(meta?.checkedIn ?? 0));
      setAttendeesNotCheckedIn(Number(meta?.notCheckedIn ?? 0));
      setAttendeeAvailableTags(
        Array.isArray(meta?.availableTags) ? meta.availableTags : [],
      );
    } catch {
      setAttendees([]);
      setAttendeesTotal(0);
      setAttendeesCheckedIn(0);
      setAttendeesNotCheckedIn(0);
      setAttendeeAvailableTags([]);
    } finally {
      setIsLoadingAttendees(false);
    }
  }, [
    attendeeSearch,
    attendeeStatusFilter,
    attendeeTagsFilter,
    attendeesPage,
    attendeesPageSize,
    canViewDashboard,
    checkinEnabled,
    eventId,
  ]);

  function toggleAttendeeTag(tag: string) {
    setAttendeesPage(1);
    setAttendeeTagsFilter((previous) =>
      previous.includes(tag)
        ? previous.filter((value) => value !== tag)
        : [...previous, tag],
    );
  }

  function toggleExportColumn(column: CheckinExportColumn) {
    setExportColumns((previous) =>
      previous.includes(column)
        ? previous.filter((value) => value !== column)
        : [...previous, column],
    );
  }

  async function exportAttendeesCsv() {
    const selectedColumns = Array.from(
      new Set(exportColumns.filter((column) => column.trim().length > 0)),
    );
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column to export.");
      return;
    }

    setShowExportDialog(false);
    setIsExportingAttendeesCsv(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
      const body = buildCheckinExportRequest({
        status: attendeeStatusFilter,
        tags: attendeeTagsFilter,
        search: attendeeSearch,
        columns: selectedColumns,
        portal: exportPortal,
      });
      const res = await fetch(`${PUBLIC_API_URL}/events/${eventId}/check-in/export`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromContentDisposition(
        res.headers.get("content-disposition"),
        `checkin-attendees-${eventId}.csv`,
      );
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Check-in attendees CSV downloaded.");
    } catch {
      toast.error("Could not export check-in attendees.");
    } finally {
      setIsExportingAttendeesCsv(false);
    }
  }

  useEffect(() => {
    setIsLoading(true);
    (async () => {
      try {
        await refreshDashboardData();
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshDashboardData]);

  useEffect(() => {
    void refreshAttendees();
  }, [refreshAttendees]);

  useEffect(() => {
    setAttendeeTagsFilter((previous) => {
      const next = previous.filter((tag) => attendeeAvailableTags.includes(tag));
      if (
        next.length === previous.length &&
        next.every((tag, index) => tag === previous[index])
      ) {
        return previous;
      }
      return next;
    });
  }, [attendeeAvailableTags]);

  useEffect(() => {
    if (!lookupQuery.trim()) {
      setLookupResults([]);
      setLookupAttempted(false);
    }
  }, [lookupQuery]);

  const isLikelyToken = useCallback((value: string) => {
    const parts = value.split(".");
    if (parts.length !== 3 || value.length <= 40) return false;
    return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
  }, []);

  const handleScan = useCallback(
    async (code: string) => {
      if (!checkinEnabled || !canScan || isScanning || !code.trim()) return;
      setIsScanning(true);
      setLastResult(null);
      try {
        const res = await apiClient<any>(
          `/events/${eventId}/check-in/scan`,
          {
            method: "POST",
            body: { token: code.trim() },
            csrfToken: csrfToken ?? undefined,
          }
        );
        const result = normalizeCheckinResult(res?.data ?? res);
        setLastResult(result);
        if (result.status === "SUCCESS") {
          toast.success(`${result.applicantName} checked in!`);
          await refreshDashboardData();
          await refreshAttendees();
        } else if (result.status === "ALREADY_CHECKED_IN") {
          toast.info(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        /* handled */
      } finally {
        setIsScanning(false);
        setScanInput("");
        scanRef.current?.focus();
      }
    },
    [
      eventId,
      csrfToken,
      isScanning,
      refreshDashboardData,
      refreshAttendees,
      checkinEnabled,
      canScan,
    ]
  );

  const handleLookup = useCallback(
    async () => {
      if (!checkinEnabled || !canLookup || isScanning || isLookingUp || !lookupQuery.trim()) return;
      const query = lookupQuery.trim();
      if (isLikelyToken(query)) {
        await handleScan(query);
        setLookupQuery("");
        setLookupResults([]);
        setLookupAttempted(false);
        return;
      }
      setIsLookingUp(true);
      setLookupAttempted(true);
      setLookupResults([]);
      try {
        const res = await apiClient<any>(
          `/events/${eventId}/check-in/lookup`,
          {
            method: "POST",
            body: { query },
            csrfToken: csrfToken ?? undefined,
          }
        );
        const data = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
          ? res
          : [];
        setLookupResults(data);
      } catch {
        setLookupResults([]);
      } finally {
        setIsLookingUp(false);
      }
    },
    [
      eventId,
      lookupQuery,
      csrfToken,
      isScanning,
      isLookingUp,
      handleScan,
      isLikelyToken,
      checkinEnabled,
      canLookup,
    ]
  );

  const handleManualCheckin = useCallback(
    async (applicationId: string) => {
      if (!checkinEnabled || !canScan || isScanning) return;
      setIsScanning(true);
      setLastResult(null);
      try {
        const res = await apiClient<any>(
          `/events/${eventId}/check-in/manual`,
          {
            method: "POST",
            body: { applicationId },
            csrfToken: csrfToken ?? undefined,
          }
        );
        const result = normalizeCheckinResult(res?.data ?? res);
        setLastResult(result);
        if (result.status === "SUCCESS") {
          toast.success(`${result.applicantName} checked in!`);
          await refreshDashboardData();
          await refreshAttendees();
        } else if (result.status === "ALREADY_CHECKED_IN") {
          toast.info(result.message);
        } else {
          toast.error(result.message);
        }
        const checkedInAt = result.checkedInAt ?? new Date().toISOString();
        setLookupResults((prev) =>
          prev.map((entry) =>
            entry.applicationId === applicationId
              ? {
                  ...entry,
                  status:
                    result.status === "SUCCESS" || result.status === "ALREADY_CHECKED_IN"
                      ? "CHECKED_IN"
                      : entry.status,
                  checkedInAt,
                }
              : entry
          )
        );
      } catch {
        /* handled */
      } finally {
        setIsScanning(false);
      }
    },
    [
      eventId,
      csrfToken,
      isScanning,
      refreshDashboardData,
      refreshAttendees,
      checkinEnabled,
      canScan,
    ]
  );

  async function handleUndo() {
    if (!checkinEnabled || !canUndo || !undoTarget || isUndoing) return;
    setIsUndoing(true);
    try {
      await apiClient(`/events/${eventId}/check-in/${undoTarget}/undo`, {
        method: "POST",
        csrfToken: csrfToken ?? undefined,
      });
      await refreshDashboardData();
      await refreshAttendees();
      toast.success("Check-in undone");
    } catch {
      /* handled */
    } finally {
      setIsUndoing(false);
      setShowUndoConfirm(false);
      setUndoTarget(null);
    }
  }

  const checkInPercent = stats.total > 0 ? (stats.checkedIn / stats.total) * 100 : 0;
  const canUseScanner = checkinEnabled && canScan;
  const canUseLookup = checkinEnabled && canLookup;
  const canUseUndo = checkinEnabled && canUndo;
  const attendeeCanPrev = attendeesPage > 1;
  const attendeeCanNext = attendeesPage * attendeesPageSize < attendeesTotal;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Check-in" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Check-in Dashboard" description="Scan QR codes or look up attendees manually" />

      {!canViewDashboard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Limited access</CardTitle>
            <CardDescription>
              You don&apos;t have permission to view the check-in dashboard for this event.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {canViewDashboard && !checkinEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Check-in disabled</CardTitle>
            <CardDescription>
              Check-in is currently disabled for this event. Ask an organizer to enable it in Event Settings.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Accepted", value: stats.total, icon: Users, color: "text-primary" },
          { label: "Checked In", value: stats.checkedIn, icon: UserCheck, color: "text-success" },
          { label: "Remaining", value: stats.remaining, icon: Clock, color: "text-warning" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span>Check-in progress</span>
            <span className="font-medium">{Math.round(checkInPercent)}%</span>
          </div>
          <Progress value={checkInPercent} className="h-3" />
        </CardContent>
      </Card>

      {/* Scan / Lookup */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  QR Code Scan
                </CardTitle>
                <CardDescription>
                  {cameraMode ? "Point your camera at a QR code" : "Type a code or use your camera"}
                </CardDescription>
              </div>
              <Button
                variant={cameraMode ? "default" : "outline"}
                size="sm"
                disabled={!canUseScanner}
                onClick={() => setCameraMode(!cameraMode)}
              >
                {cameraMode ? <ScanLine className="h-4 w-4 mr-2" /> : <QrCode className="h-4 w-4 mr-2" />}
                {cameraMode ? "Manual" : "Camera"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {cameraMode ? (
              <QrScanner
                onScan={handleScan}
                autoStart
                disabled={!canUseScanner || isScanning}
                width={320}
                height={320}
                className="w-full"
              />
            ) : (
              <div className="flex gap-2">
                <Input
                  ref={scanRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan(scanInput)}
                  placeholder="Scan QR code here..."
                  autoFocus
                  className="font-mono"
                  disabled={!canUseScanner}
                />
                <Button
                  onClick={() => handleScan(scanInput)}
                  disabled={!canUseScanner || isScanning}
                >
                  {isScanning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ScanLine className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4" />
              Manual Lookup
            </CardTitle>
            <CardDescription>
              Search by name, email, or ticket token
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="Name, email, or ticket token..."
                disabled={!canUseLookup}
              />
              <Button
                onClick={handleLookup}
                disabled={!canUseLookup || isScanning || isLookingUp}
                variant="outline"
              >
                {isLookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {lookupAttempted && !isLookingUp && lookupResults.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                No matches found.
              </p>
            )}

            {lookupResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {lookupResults.map((entry) => {
                  const isCheckedIn = entry.status === "CHECKED_IN";
                  const isEligible = entry.status === "CONFIRMED";
                  const statusLabel = isCheckedIn
                    ? entry.checkedInAt
                      ? `Checked in ${new Date(entry.checkedInAt).toLocaleString("en-GB")}`
                      : "Checked in"
                    : isEligible
                    ? "Eligible for check-in"
                    : `Status: ${entry.status}`;
                  return (
                    <div
                      key={entry.applicationId}
                      className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{entry.applicantName}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.applicantEmail}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {statusLabel}
                          {isCheckedIn && entry.checkedInBy
                            ? ` - ${entry.checkedInBy}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleManualCheckin(entry.applicationId)}
                        disabled={!isEligible || isScanning || !canUseScanner}
                        variant={isEligible ? "default" : "outline"}
                      >
                        {isEligible ? "Check in" : isCheckedIn ? "Checked in" : "Not eligible"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Attendees</CardTitle>
              <CardDescription>
                People expected for check-in (confirmed + already checked-in).
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportDialog(true)}
              disabled={isExportingAttendeesCsv || !checkinEnabled || !canViewDashboard}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {isExportingAttendeesCsv ? "Exporting..." : "Export attendees CSV"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[70vh] min-h-0 flex-col gap-4 overflow-hidden">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]">
            <Select
              value={attendeeStatusFilter}
              onValueChange={(value) => {
                setAttendeesPage(1);
                setAttendeeStatusFilter(value as CheckinAttendeeStatus);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All attendees</SelectItem>
                <SelectItem value="not_checked_in">Not checked in</SelectItem>
                <SelectItem value="checked_in">Checked in</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input
                value={attendeeSearchInput}
                onChange={(event) => setAttendeeSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setAttendeesPage(1);
                    setAttendeeSearch(attendeeSearchInput.trim());
                  }
                }}
                placeholder="Search name, email, phone, application ID..."
                aria-label="Search attendees"
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Search attendees"
                onClick={() => {
                  setAttendeesPage(1);
                  setAttendeeSearch(attendeeSearchInput.trim());
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAttendeeStatusFilter("all");
                setAttendeeSearchInput("");
                setAttendeeSearch("");
                setAttendeeTagsFilter([]);
                setAttendeesPage(1);
              }}
            >
              Reset filters
            </Button>
          </div>

          {attendeeAvailableTags.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">Campus / Tags (match all)</Label>
              <div className="flex flex-wrap gap-2">
                {attendeeAvailableTags.map((tag) => {
                  const selected = attendeeTagsFilter.includes(tag);
                  return (
                    <Button
                      key={tag}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() => toggleAttendeeTag(tag)}
                    >
                      {tag}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{attendeesTotal}</strong> matching attendees
            </span>
            <span>
              <strong className="text-foreground">{attendeesCheckedIn}</strong> checked in
            </span>
            <span>
              <strong className="text-foreground">{attendeesNotCheckedIn}</strong> not checked in
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {isLoadingAttendees ? (
              <p className="flex h-full items-center text-sm text-muted-foreground">
                Loading attendees...
              </p>
            ) : attendees.length === 0 ? (
              <p className="flex h-full items-center text-sm text-muted-foreground">
                No attendees match the current filters.
              </p>
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-3">
                  {attendees.map((attendee) => {
                    const tags = parseTagList(attendee.tags);
                    const isCheckedIn =
                      attendee.isCheckedIn || attendee.attendanceStatus === "CHECKED_IN";
                    const canManualCheckin =
                      attendee.attendanceStatus === "CONFIRMED" &&
                      canUseScanner &&
                      !isScanning;
                    return (
                      <div
                        key={attendee.applicationId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="break-words font-medium">{attendee.applicantName}</p>
                          <p className="break-all text-xs text-muted-foreground">
                            {attendee.applicantEmail || attendee.applicantUserId}
                          </p>
                          <p className="break-words text-xs text-muted-foreground">
                            {isCheckedIn
                              ? attendee.checkedInAt
                                ? `Checked in ${new Date(attendee.checkedInAt).toLocaleString("en-GB")}`
                                : "Checked in"
                              : "Not checked in"}
                            {isCheckedIn && attendee.checkedInByEmail
                              ? ` - ${attendee.checkedInByEmail}`
                              : ""}
                          </p>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {tags.map((tag) => (
                                <Badge key={`${attendee.applicationId}-${tag}`} variant="secondary">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleManualCheckin(attendee.applicationId)}
                          disabled={!canManualCheckin}
                          variant={canManualCheckin ? "default" : "outline"}
                        >
                          {canManualCheckin
                            ? "Check in"
                            : isCheckedIn
                              ? "Checked in"
                              : "Not eligible"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {attendeesPage}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAttendeesPage((previous) => Math.max(previous - 1, 1))}
                disabled={!attendeeCanPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAttendeesPage((previous) => previous + 1)}
                disabled={!attendeeCanNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last result */}
      {lastResult && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <Card
            className={
              lastResult.status === "SUCCESS"
                ? "border-success bg-success/5"
                : lastResult.status === "ALREADY_CHECKED_IN"
                ? "border-warning bg-warning/5"
                : "border-destructive bg-destructive/5"
            }
          >
            <CardContent className="p-6 text-center">
              {lastResult.status === "SUCCESS" ? (
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
              ) : (
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
              )}
              <p className="text-lg font-bold">{lastResult.applicantName}</p>
              <p className="text-sm text-muted-foreground mb-2">
                {lastResult.applicantEmail}
              </p>
              <Badge
                variant={
                  lastResult.status === "SUCCESS" ? "default" : "destructive"
                }
              >
                {lastResult.message}
              </Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent check-ins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Check-ins</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCheckins.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No check-ins yet.
            </p>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="space-y-2">
                {recentCheckins.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{entry.applicantName}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.applicantEmail}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Checked in {new Date(entry.checkedInAt).toLocaleString("en-GB")}
                        {entry.checkedInBy ? ` - ${entry.checkedInBy}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={isUndoing || !canUseUndo}
                        onClick={() => {
                          setUndoTarget(entry.id);
                          setShowUndoConfirm(true);
                        }}
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Export check-in attendees</DialogTitle>
            <DialogDescription>
              Export the attendee list using the current filters and selected columns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Current filters: status <strong>{attendeeStatusFilter}</strong>
              {attendeeSearch ? (
                <>
                  {" "}
                  - search <strong>{attendeeSearch}</strong>
                </>
              ) : null}
              {attendeeTagsFilter.length > 0 ? (
                <>
                  {" "}
                  - tags <strong>{attendeeTagsFilter.join(", ")}</strong>
                </>
              ) : null}
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
                  onClick={() => setExportColumns([...CHECKIN_EXPORT_COLUMNS])}
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
              {CHECKIN_EXPORT_COLUMNS.map((column) => (
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
            <Button onClick={exportAttendeesCsv} disabled={isExportingAttendeesCsv}>
              {isExportingAttendeesCsv ? "Exporting..." : "Export CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showUndoConfirm}
        onOpenChange={setShowUndoConfirm}
        title="Undo check-in?"
        description="This will mark the attendee as not checked in."
        confirmLabel="Undo"
        onConfirm={handleUndo}
        variant="destructive"
      />
    </div>
  );
}
