"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Save, Loader2, Calendar, MapPin, Users, Globe, ClipboardCheck, QrCode, ArchiveX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { PageHeader, FormSkeleton } from "@/components/shared";
import { CloseEventWizard } from "@/components/admin/close-event-wizard";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface DecisionConfig {
  autoPublish?: boolean;
  allowAppeal?: boolean;
  appealDeadlineDays?: number;
}

interface CheckinConfig {
  enabled?: boolean;
  allowSelfCheckin?: boolean;
  qrCodeRequired?: boolean;
}

interface EventSettings {
  name: string;
  slug: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  applicationDeadline?: string;
  applicationsOpenAt?: string;
  capacity?: number;
  isPublished: boolean;
  requiresEmailVerification: boolean;
  decisionConfig: DecisionConfig;
  checkinConfig: CheckinConfig;
}

function normalizeCheckinConfig(raw: unknown): CheckinConfig {
  const base = raw && typeof raw === "object" ? (raw as CheckinConfig) : {};
  return {
    enabled: Boolean(base.enabled ?? false),
    allowSelfCheckin: Boolean(base.allowSelfCheckin ?? false),
    qrCodeRequired: base.qrCodeRequired ?? true,
  };
}

function toLocalDateTimeInput(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export default function SettingsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rawStatus, setRawStatus] = useState<string>("draft");
  const [micrositeInfo, setMicrositeInfo] = useState<{
    exists: boolean;
    publishedVersion: number;
  }>({ exists: false, publishedVersion: 0 });
  const [latestJob, setLatestJob] = useState<{
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
    purgePolicy: "NONE" | "PURGE_FILES_AND_ANSWERS";
    requestedAt: string;
    completedAt: string | null;
    filesDeleted: number;
    filesTotal: number;
  } | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const loadEvent = useCallback(async () => {
    try {
      const res = await apiClient<any>(`/admin/events/${eventId}`);
      const raw: any = res?.data ?? res;
      setRawStatus(String(raw.status ?? "draft").toLowerCase());
      setSettings({
        name: raw.title ?? raw.name ?? "",
        slug: raw.slug ?? "",
        description: raw.description ?? "",
        location: raw.venueName ?? raw.location ?? "",
        startDate: toLocalDateTimeInput(raw.startAt ?? raw.startDate),
        endDate: toLocalDateTimeInput(raw.endAt ?? raw.endDate),
        applicationDeadline: toLocalDateTimeInput(
          raw.applicationsCloseAt ??
            raw.applicationCloseAt ??
            raw.applicationDeadline
        ),
        applicationsOpenAt: toLocalDateTimeInput(
          raw.applicationsOpenAt ?? raw.applicationOpenAt
        ),
        capacity: raw.capacity,
        isPublished: raw.status === "PUBLISHED" || raw.status === "published" || raw.isPublished === true,
        requiresEmailVerification: raw.requiresEmailVerification ?? false,
        decisionConfig: raw.decisionConfig ?? {},
        checkinConfig: normalizeCheckinConfig(raw.checkinConfig ?? {}),
      });
    } catch (err) {
      console.error("Failed to load event settings:", err);
    }
  }, [eventId]);

  const loadLatestJob = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/admin/events/${eventId}/archival-job/latest`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setLatestJob(null);
        return;
      }
      const payload = await res.json();
      const job = payload?.data;
      if (!job) {
        setLatestJob(null);
        return;
      }
      setLatestJob({
        status: job.status,
        purgePolicy: job.purgePolicy,
        requestedAt: job.requestedAt,
        completedAt: job.completedAt,
        filesDeleted: job.filesDeleted ?? 0,
        filesTotal: job.filesTotal ?? 0,
      });
    } catch {
      setLatestJob(null);
    }
  }, [eventId]);

  // Probe microsite via raw fetch — apiClient auto-toasts on non-OK and
  // users without EVENT_MICROSITE_MANAGE_SETTINGS legitimately see 403 here.
  const loadMicrosite = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/admin/events/${eventId}/microsite`, {
        credentials: "include",
      });
      if (!res.ok) {
        setMicrositeInfo({ exists: false, publishedVersion: 0 });
        return;
      }
      const payload = await res.json();
      const ms = payload?.data ?? payload;
      setMicrositeInfo({
        exists: !!ms,
        publishedVersion: ms?.publishedVersion ?? ms?.published_version ?? 0,
      });
    } catch {
      setMicrositeInfo({ exists: false, publishedVersion: 0 });
    }
  }, [eventId]);

  useEffect(() => {
    (async () => {
      await loadEvent();
      setIsLoading(false);
    })();
  }, [loadEvent]);

  useEffect(() => {
    void loadMicrosite();
  }, [loadMicrosite]);

  useEffect(() => {
    void loadLatestJob();
  }, [loadLatestJob]);

  async function handleSave() {
    if (!settings) return;
    setIsSaving(true);
    try {
      await apiClient(`/admin/events/${eventId}`, {
        method: "PATCH",
        body: {
          title: settings.name,
          slug: settings.slug,
          description: settings.description,
          venueName: settings.location,
          startAt: toIsoDateTime(settings.startDate),
          endAt: toIsoDateTime(settings.endDate),
          applicationsOpenAt: toIsoDateTime(settings.applicationsOpenAt),
          applicationsCloseAt: toIsoDateTime(settings.applicationDeadline),
          capacity: settings.capacity,
          publishStatus: settings.isPublished ? "PUBLISHED" : "DRAFT",
          requiresEmailVerification: settings.requiresEmailVerification,
          decisionConfig: settings.decisionConfig,
          checkinConfig: normalizeCheckinConfig(settings.checkinConfig),
        },
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Settings saved!");
    } catch (err) {
      console.error("Failed to save event settings:", err);
    }
    finally { setIsSaving(false); }
  }

  function updateDecisionConfig<K extends keyof DecisionConfig>(key: K, value: DecisionConfig[K]) {
    if (!settings) return;
    setSettings({ ...settings, decisionConfig: { ...settings.decisionConfig, [key]: value } });
  }

  function updateCheckinConfig<K extends keyof CheckinConfig>(key: K, value: CheckinConfig[K]) {
    if (!settings) return;
    setSettings({ ...settings, checkinConfig: { ...settings.checkinConfig, [key]: value } });
  }

  if (isLoading) return <FormSkeleton />;
  if (!settings) return null;

  const checkinConfig = normalizeCheckinConfig(settings.checkinConfig);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Event Settings" description="Configure event details and behavior">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save settings
        </Button>
      </PageHeader>

      <Card>
        <CardHeader><CardTitle className="text-base">General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Event name</Label>
            <Input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Slug</Label>
            <Input value={settings.slug} onChange={(e) => setSettings({ ...settings, slug: e.target.value })} />
            <p className="text-xs text-muted-foreground">Used in the public URL.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Description</Label>
            <Textarea value={settings.description ?? ""} onChange={(e) => setSettings({ ...settings, description: e.target.value })} rows={3} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> Location</Label>
            <Input value={settings.location ?? ""} onChange={(e) => setSettings({ ...settings, location: e.target.value })} placeholder="City, Country" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Dates</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Start date</Label>
              <Input type="datetime-local" value={settings.startDate ?? ""} onChange={(e) => setSettings({ ...settings, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">End date</Label>
              <Input type="datetime-local" value={settings.endDate ?? ""} onChange={(e) => setSettings({ ...settings, endDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Applications open at</Label>
            <Input
              type="datetime-local"
              value={settings.applicationsOpenAt ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, applicationsOpenAt: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Application deadline</Label>
            <Input type="datetime-local" value={settings.applicationDeadline ?? ""} onChange={(e) => setSettings({ ...settings, applicationDeadline: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Capacity & Access</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Capacity</Label>
            <Input type="number" value={settings.capacity ?? ""} onChange={(e) => setSettings({ ...settings, capacity: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="Unlimited" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Published</Label>
              <p className="text-xs text-muted-foreground">Applicants can see and apply to this event.</p>
            </div>
            <Switch checked={settings.isPublished} onCheckedChange={(v) => setSettings({ ...settings, isPublished: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Require email verification</Label>
              <p className="text-xs text-muted-foreground">Applicants must verify their email before applying.</p>
            </div>
            <Switch checked={settings.requiresEmailVerification} onCheckedChange={(v) => setSettings({ ...settings, requiresEmailVerification: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Decision Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-publish decisions</Label>
              <p className="text-xs text-muted-foreground">Automatically publish decisions when all reviews are completed.</p>
            </div>
            <Switch checked={settings.decisionConfig.autoPublish ?? false} onCheckedChange={(v) => updateDecisionConfig("autoPublish", v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Allow appeals</Label>
              <p className="text-xs text-muted-foreground">Rejected applicants can submit an appeal.</p>
            </div>
            <Switch checked={settings.decisionConfig.allowAppeal ?? false} onCheckedChange={(v) => updateDecisionConfig("allowAppeal", v)} />
          </div>
          {settings.decisionConfig.allowAppeal && (
            <div className="space-y-2 pl-1">
              <Label className="text-sm">Appeal deadline (days)</Label>
              <Input
                type="number"
                min={1}
                value={settings.decisionConfig.appealDeadlineDays ?? 7}
                onChange={(e) => updateDecisionConfig("appealDeadlineDays", parseInt(e.target.value) || 7)}
                className="max-w-[120px]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><QrCode className="h-4 w-4" /> Check-in Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Enable check-in</Label>
              <p className="text-xs text-muted-foreground">Enable the check-in system for this event.</p>
            </div>
            <Switch checked={checkinConfig.enabled ?? false} onCheckedChange={(v) => updateCheckinConfig("enabled", v)} />
          </div>
          {checkinConfig.enabled && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Allow self check-in</Label>
                  <p className="text-xs text-muted-foreground">Attendees can check themselves in without staff scanning.</p>
                </div>
                <Switch checked={checkinConfig.allowSelfCheckin ?? false} onCheckedChange={(v) => updateCheckinConfig("allowSelfCheckin", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Require QR code</Label>
                  <p className="text-xs text-muted-foreground">QR code scan is required for check-in.</p>
                </div>
                <Switch checked={checkinConfig.qrCodeRequired ?? true} onCheckedChange={(v) => updateCheckinConfig("qrCodeRequired", v)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <ArchiveX className="h-4 w-4 text-destructive" />
                Close event
              </CardTitle>
              <p className="text-xs text-muted-foreground max-w-prose">
                Run when the event is over. Archive it, decide what to do with
                the microsite, and optionally purge applicant data. Certificates
                stay QR-verifiable.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {rawStatus === "archived" && (
                <Badge variant="secondary">Archived</Badge>
              )}
              {micrositeInfo.exists ? (
                <Badge variant={micrositeInfo.publishedVersion > 0 ? "secondary" : "outline"}>
                  {micrositeInfo.publishedVersion > 0
                    ? `Microsite v${micrositeInfo.publishedVersion}`
                    : "Microsite unpublished"}
                </Badge>
              ) : (
                <Badge variant="outline">No microsite</Badge>
              )}
              {latestJob && latestJob.purgePolicy === "PURGE_FILES_AND_ANSWERS" && (
                <Badge
                  variant={
                    latestJob.status === "COMPLETED"
                      ? "secondary"
                      : latestJob.status === "FAILED"
                        ? "destructive"
                        : "default"
                  }
                >
                  {latestJob.status === "COMPLETED"
                    ? "Data purged"
                    : latestJob.status === "FAILED"
                      ? "Purge failed"
                      : `Purging ${latestJob.filesDeleted}/${latestJob.filesTotal || "?"}`}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {latestJob && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Last close action requested{" "}
              {new Date(latestJob.requestedAt).toLocaleString("en-GB")}
              {latestJob.completedAt
                ? ` · completed ${new Date(latestJob.completedAt).toLocaleString("en-GB")}`
                : ""}
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => setCloseOpen(true)}
          >
            {latestJob && (latestJob.status === "PENDING" || latestJob.status === "RUNNING")
              ? "View close progress"
              : rawStatus === "archived"
                ? "Manage closed event"
                : "Open close-event wizard"}
          </Button>
        </CardContent>
      </Card>

      <CloseEventWizard
        open={closeOpen}
        onOpenChange={setCloseOpen}
        event={{
          id: eventId,
          slug: settings.slug,
          title: settings.name,
          status: rawStatus,
          micrositeExists: micrositeInfo.exists,
          micrositePublishedVersion: micrositeInfo.publishedVersion,
        }}
        onCompleted={() => {
          void loadEvent();
          void loadMicrosite();
          void loadLatestJob();
        }}
      />
    </div>
  );
}
