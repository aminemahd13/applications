"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Save, Loader2, Calendar, MapPin, Users, Globe, ClipboardCheck, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, FormSkeleton } from "@/components/shared";
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
  certificate?: {
    publishMode?: "checkin" | "manual";
    template?: {
      text?: {
        title?: string;
        subtitle?: string;
        completionText?: string;
        footerText?: string;
      };
      style?: {
        primaryColor?: string;
        secondaryColor?: string;
        backgroundColor?: string;
        textColor?: string;
        borderColor?: string;
      };
    };
  };
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

const DEFAULT_CERTIFICATE_TEMPLATE = {
  text: {
    title: "Certificate of Completion",
    subtitle: "This certifies that",
    completionText: "has successfully completed",
    footerText:
      "Verification available via the secure credential link below.",
  },
  style: {
    primaryColor: "#2563eb",
    secondaryColor: "#1d4ed8",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
    borderColor: "#cbd5e1",
  },
} as const;

function normalizeCheckinConfig(raw: unknown): CheckinConfig {
  const base = raw && typeof raw === "object" ? (raw as CheckinConfig) : {};
  const certificate = base.certificate ?? {};
  const template = certificate.template ?? {};
  const text = template.text ?? {};
  const style = template.style ?? {};

  return {
    enabled: Boolean(base.enabled ?? false),
    allowSelfCheckin: Boolean(base.allowSelfCheckin ?? false),
    qrCodeRequired: base.qrCodeRequired ?? true,
    certificate: {
      publishMode:
        certificate.publishMode === "manual" ? "manual" : "checkin",
      template: {
        text: {
          title: text.title ?? DEFAULT_CERTIFICATE_TEMPLATE.text.title,
          subtitle: text.subtitle ?? DEFAULT_CERTIFICATE_TEMPLATE.text.subtitle,
          completionText:
            text.completionText ??
            DEFAULT_CERTIFICATE_TEMPLATE.text.completionText,
          footerText:
            text.footerText ?? DEFAULT_CERTIFICATE_TEMPLATE.text.footerText,
        },
        style: {
          primaryColor:
            style.primaryColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.primaryColor,
          secondaryColor:
            style.secondaryColor ??
            DEFAULT_CERTIFICATE_TEMPLATE.style.secondaryColor,
          backgroundColor:
            style.backgroundColor ??
            DEFAULT_CERTIFICATE_TEMPLATE.style.backgroundColor,
          textColor:
            style.textColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.textColor,
          borderColor:
            style.borderColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.borderColor,
        },
      },
    },
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

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<any>(`/admin/events/${eventId}`);
        const raw: any = res?.data ?? res;
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
      finally { setIsLoading(false); }
    })();
  }, [eventId]);

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

  function updateCertificatePublishMode(mode: "checkin" | "manual") {
    if (!settings) return;
    setSettings({
      ...settings,
      checkinConfig: {
        ...settings.checkinConfig,
        certificate: {
          ...(settings.checkinConfig.certificate ?? {}),
          publishMode: mode,
          template: settings.checkinConfig.certificate?.template ?? {
            text: { ...DEFAULT_CERTIFICATE_TEMPLATE.text },
            style: { ...DEFAULT_CERTIFICATE_TEMPLATE.style },
          },
        },
      },
    });
  }

  function updateCertificateText<
    K extends keyof NonNullable<
      NonNullable<NonNullable<CheckinConfig["certificate"]>["template"]>["text"]
    >,
  >(key: K, value: string) {
    if (!settings) return;
    const checkinConfig = normalizeCheckinConfig(settings.checkinConfig);
    setSettings({
      ...settings,
      checkinConfig: {
        ...checkinConfig,
        certificate: {
          ...(checkinConfig.certificate ?? {}),
          template: {
            ...(checkinConfig.certificate?.template ?? {}),
            text: {
              ...(checkinConfig.certificate?.template?.text ??
                DEFAULT_CERTIFICATE_TEMPLATE.text),
              [key]: value,
            },
            style:
              checkinConfig.certificate?.template?.style ??
              DEFAULT_CERTIFICATE_TEMPLATE.style,
          },
        },
      },
    });
  }

  function updateCertificateStyle<
    K extends keyof NonNullable<
      NonNullable<NonNullable<CheckinConfig["certificate"]>["template"]>["style"]
    >,
  >(key: K, value: string) {
    if (!settings) return;
    const checkinConfig = normalizeCheckinConfig(settings.checkinConfig);
    setSettings({
      ...settings,
      checkinConfig: {
        ...checkinConfig,
        certificate: {
          ...(checkinConfig.certificate ?? {}),
          template: {
            ...(checkinConfig.certificate?.template ?? {}),
            text:
              checkinConfig.certificate?.template?.text ??
              DEFAULT_CERTIFICATE_TEMPLATE.text,
            style: {
              ...(checkinConfig.certificate?.template?.style ??
                DEFAULT_CERTIFICATE_TEMPLATE.style),
              [key]: value,
            },
          },
        },
      },
    });
  }

  if (isLoading) return <FormSkeleton />;
  if (!settings) return null;

  const checkinConfig = normalizeCheckinConfig(settings.checkinConfig);
  const certificateTemplate =
    checkinConfig.certificate?.template ?? {
      text: { ...DEFAULT_CERTIFICATE_TEMPLATE.text },
      style: { ...DEFAULT_CERTIFICATE_TEMPLATE.style },
    };
  const certificateText = certificateTemplate.text ?? {
    ...DEFAULT_CERTIFICATE_TEMPLATE.text,
  };
  const certificateStyle = certificateTemplate.style ?? {
    ...DEFAULT_CERTIFICATE_TEMPLATE.style,
  };

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

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm">Certificate publish mode</Label>
                <p className="text-xs text-muted-foreground">
                  Choose whether certificates are issued automatically at check-in or only when staff publishes manually.
                </p>
                <Select
                  value={checkinConfig.certificate?.publishMode ?? "checkin"}
                  onValueChange={(value) =>
                    updateCertificatePublishMode(value as "checkin" | "manual")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checkin">Automatic on check-in</SelectItem>
                    <SelectItem value="manual">Manual publish only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm">Certificate title</Label>
                  <Input
                    value={certificateText.title ?? ""}
                    onChange={(e) => updateCertificateText("title", e.target.value)}
                    placeholder="Certificate of Completion"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Subtitle</Label>
                  <Input
                    value={certificateText.subtitle ?? ""}
                    onChange={(e) => updateCertificateText("subtitle", e.target.value)}
                    placeholder="This certifies that"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm">Completion text</Label>
                  <Input
                    value={certificateText.completionText ?? ""}
                    onChange={(e) => updateCertificateText("completionText", e.target.value)}
                    placeholder="has successfully completed"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm">Footer text</Label>
                  <Textarea
                    value={certificateText.footerText ?? ""}
                    onChange={(e) => updateCertificateText("footerText", e.target.value)}
                    rows={2}
                    placeholder="Verification available via the secure credential link below."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Certificate style</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Primary color</Label>
                    <Input
                      type="color"
                      value={certificateStyle.primaryColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.primaryColor}
                      onChange={(e) => updateCertificateStyle("primaryColor", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Secondary color</Label>
                    <Input
                      type="color"
                      value={certificateStyle.secondaryColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.secondaryColor}
                      onChange={(e) => updateCertificateStyle("secondaryColor", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Background color</Label>
                    <Input
                      type="color"
                      value={certificateStyle.backgroundColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.backgroundColor}
                      onChange={(e) => updateCertificateStyle("backgroundColor", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Text color</Label>
                    <Input
                      type="color"
                      value={certificateStyle.textColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.textColor}
                      onChange={(e) => updateCertificateStyle("textColor", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Border color</Label>
                    <Input
                      type="color"
                      value={certificateStyle.borderColor ?? DEFAULT_CERTIFICATE_TEMPLATE.style.borderColor}
                      onChange={(e) => updateCertificateStyle("borderColor", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
