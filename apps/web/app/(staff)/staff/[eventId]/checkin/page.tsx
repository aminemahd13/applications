"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
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

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PageHeader,
  CardSkeleton,
  ConfirmDialog,
  QrScanner,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { toast } from "sonner";

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

export default function CheckinPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canViewDashboard = hasPermission("event.checkin.dashboard.view");
  const canScan = hasPermission("event.checkin.scan");
  const canLookup = hasPermission("event.checkin.manual_lookup");
  const canUndo = hasPermission("event.checkin.undo");

  const [stats, setStats] = useState<CheckinStats>({ total: 0, checkedIn: 0, remaining: 0 });
  const [recentCheckins, setRecentCheckins] = useState<CheckinEntry[]>([]);
  const [checkinEnabled, setCheckinEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

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
    [eventId, csrfToken, isScanning, refreshDashboardData, checkinEnabled, canScan]
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
    [eventId, csrfToken, isScanning, refreshDashboardData, checkinEnabled, canScan]
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
                      ? `Checked in ${new Date(entry.checkedInAt).toLocaleString()}`
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
                        Checked in {new Date(entry.checkedInAt).toLocaleString()}
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
