"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEventBasePath } from "@/hooks/use-event-base-path";
import {
  Globe,
  Plus,
  Eye,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileEdit,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, CardSkeleton, ConfirmDialog } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { uploadMicrositeAsset } from "@/lib/microsite-media";
import {
  readMicrositeAutoPublishPreference,
  writeMicrositeAutoPublishPreference,
} from "@/lib/microsite-auto-publish";
import { MediaLibraryDialog } from "@/components/microsite/media-library-dialog";
import {
  MICROSITE_DESIGN_PRESETS,
  MICROSITE_THEME,
  type MicrositeDesignPresetMode,
  type MicrositeDesignSettings,
} from "@/components/microsite/theme/preset";
import { normalizeMicrositeSettings } from "@/components/microsite/theme/runtime";
import { toast } from "sonner";
import type { MicrositeSettings as SharedMicrositeSettings } from "@event-platform/shared";

interface MicrositePage {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  updatedAt: string;
  version: number;
  isHome?: boolean;
}

type MicrositeSettings = SharedMicrositeSettings;
type FooterSocial = NonNullable<MicrositeSettings["footer"]>["socials"][number];

export default function MicrositePage_() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const basePath = useEventBasePath();

  const [pages, setPages] = useState<MicrositePage[]>([]);
  const [settings, setSettings] = useState<MicrositeSettings>(normalizeMicrositeSettings({}));
  const [eventSlug, setEventSlug] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isMicrositePublished, setIsMicrositePublished] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageSlug, setNewPageSlug] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [mediaPicker, setMediaPicker] = useState<{
    kind: "image" | "video" | "all";
    onSelect: (assetKey: string) => void;
  } | null>(null);

  function normalizePage(raw: Record<string, unknown>): MicrositePage {
    return {
      id: String(raw.id ?? ""),
      title: String(raw.title ?? "Untitled"),
      slug: String(raw.slug ?? ""),
      isPublished: Boolean(raw.isPublished ?? raw.published ?? false),
      updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()),
      version: Number(raw.version ?? 0),
      isHome: Boolean(raw.isHome ?? false),
    };
  }

  function withHomeFlag(list: MicrositePage[]): MicrositePage[] {
    return list.map((page, index) => ({ ...page, isHome: index === 0 }));
  }

  function unwrapApiArray(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
      return value as Array<Record<string, unknown>>;
    }
    if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).data)) {
      return (value as { data: Array<Record<string, unknown>> }).data;
    }
    return [];
  }

  function unwrapApiObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object") {
      const maybeData = (value as Record<string, unknown>).data;
      if (maybeData && typeof maybeData === "object" && !Array.isArray(maybeData)) {
        return maybeData as Record<string, unknown>;
      }
      return value as Record<string, unknown>;
    }
    return {};
  }

  useEffect(() => {
    (async () => {
      try {
        const [pagesRes, settingsRes] = await Promise.all([
          apiClient<unknown>(`/admin/events/${eventId}/microsite/pages`),
          apiClient<unknown>(`/admin/events/${eventId}/microsite`),
        ]);
        const rawPages = unwrapApiArray(pagesRes);
        setPages(withHomeFlag(rawPages.map(normalizePage)));
        const site = unwrapApiObject(settingsRes) as {
          settings?: MicrositeSettings;
          events?: { slug?: string };
          published_version?: number;
          publishedVersion?: number;
        };
        setSettings(normalizeMicrositeSettings(site.settings ?? {}));
        setIsMicrositePublished(Number(site.publishedVersion ?? site.published_version ?? 0) > 0);
        setEventSlug(String(site.events?.slug ?? ""));
      } catch { /* handled */ }
      finally { setIsLoading(false); }
    })();
  }, [eventId]);

  useEffect(() => {
    setAutoPublishEnabled(readMicrositeAutoPublishPreference(eventId));
  }, [eventId]);

  function handleAutoPublishChange(nextEnabled: boolean) {
    setAutoPublishEnabled(nextEnabled);
    writeMicrositeAutoPublishPreference(eventId, nextEnabled);
  }

  async function refreshPages() {
    const pagesRes = await apiClient<unknown>(
      `/admin/events/${eventId}/microsite/pages`
    );
    const rawPages = unwrapApiArray(pagesRes);
    setPages(withHomeFlag(rawPages.map(normalizePage)));
  }

  async function publishLatestDraft() {
    await apiClient(`/admin/events/${eventId}/microsite/publish`, {
      method: "POST",
      csrfToken: csrfToken ?? undefined,
    });
    await refreshPages();
    setIsMicrositePublished(true);
  }

  async function uploadAsset(file: File) {
    return uploadMicrositeAsset(eventId, file, csrfToken ?? undefined);
  }

  function openMediaLibrary(kind: "image" | "video" | "all", onSelect: (assetKey: string) => void) {
    setMediaPicker({ kind, onSelect });
  }

  async function createPage() {
    if (!newPageTitle.trim()) return;
    try {
      const explicitSlug = newPageSlug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "");
      const generatedSlug = newPageTitle
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      const slug = explicitSlug || (pages.length === 0 ? "" : generatedSlug);

      const res = await apiClient<unknown>(
        `/admin/events/${eventId}/microsite/pages`,
        {
          method: "POST",
          body: {
            title: newPageTitle,
            slug,
          },
          csrfToken: csrfToken ?? undefined,
        }
      );
      const page: MicrositePage = normalizePage(unwrapApiObject(res));
      setPages((prev) => withHomeFlag([...prev, page]));
      setShowCreatePage(false);
      setNewPageTitle("");
      setNewPageSlug("");
      toast.success("Page created!");
    } catch { /* handled */ }
  }

  async function setPublishStatus(nextPublished: boolean) {
    setIsPublishing(true);
    try {
      await apiClient(`/admin/events/${eventId}/microsite/${nextPublished ? "publish" : "unpublish"}`, {
        method: "POST",
        csrfToken: csrfToken ?? undefined,
      });
      await refreshPages();
      setIsMicrositePublished(nextPublished);
      toast.success(nextPublished ? "Microsite published!" : "Microsite unpublished!");
    } catch { /* handled */ }
    finally { setIsPublishing(false); }
  }

  async function deletePage(id: string) {
    try {
      await apiClient(`/admin/events/${eventId}/microsite/pages/${id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setPages((prev) => withHomeFlag(prev.filter((p) => p.id !== id)));
      toast.success("Page deleted");
    } catch { /* handled */ }
    finally { setDeleteTarget(null); }
  }

  async function saveSettings() {
    setIsSavingSettings(true);
    try {
      const safeSettings: MicrositeSettings & {
        customCode?: MicrositeSettings["customCode"] & { js?: string };
      } = {
        ...settings,
        customCode: { ...settings.customCode },
      };
      if (safeSettings.customCode?.js !== undefined) {
        delete safeSettings.customCode.js;
      }
      await apiClient(`/admin/events/${eventId}/microsite`, {
        method: "PATCH",
        body: safeSettings,
        csrfToken: csrfToken ?? undefined,
      });

      let didAutoPublish = false;
      let autoPublishFailed = false;
      if (autoPublishEnabled && isMicrositePublished) {
        setIsPublishing(true);
        try {
          await publishLatestDraft();
          didAutoPublish = true;
        } catch {
          autoPublishFailed = true;
        } finally {
          setIsPublishing(false);
        }
      }

      if (autoPublishFailed) {
        toast.success("Microsite settings saved, but auto-publish failed");
      } else {
        toast.success(didAutoPublish ? "Microsite settings saved and published" : "Microsite settings saved");
      }
    } catch {
      /* handled */
    } finally {
      setIsSavingSettings(false);
    }
  }

  function updateNavigation(patch: Partial<NonNullable<MicrositeSettings["navigation"]>>) {
    setSettings((prev) => ({
      ...prev,
      navigation: { ...(prev.navigation ?? {}), ...patch },
    }));
  }

  function updateFooter(patch: Partial<NonNullable<MicrositeSettings["footer"]>>) {
    setSettings((prev) => ({
      ...prev,
      footer: { ...(prev.footer ?? {}), ...patch },
    }));
  }

  function updateDesign(patch: Partial<MicrositeDesignSettings>) {
    setSettings((prev) => ({
      ...prev,
      design: { ...(prev.design ?? {}), ...patch },
    }));
  }

  const navLinks = settings.navigation?.links ?? [];
  const navCta = settings.navigation?.cta ?? { label: "", href: "", variant: "primary" as const };
  const design = settings.design ?? MICROSITE_THEME.designDefaults;
  const footerColumns = settings.footer?.columns ?? [];
  const footerSocials = settings.footer?.socials ?? [];

  const designPreviewStyle = useMemo(
    () => ({
      background: `linear-gradient(145deg, ${settings.primaryColor ?? MICROSITE_THEME.accent} 0%, ${design.accentSecondary ?? MICROSITE_THEME.designDefaults.accentSecondary} 100%)`,
    }),
    [design.accentSecondary, settings.primaryColor],
  );

  const applyDesignPreset = (presetId: string, mode: MicrositeDesignPresetMode) => {
    const preset = MICROSITE_DESIGN_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const variant = preset.variants[mode];
    setSettings((prev) => ({
      ...prev,
      theme: mode,
      primaryColor: variant.primaryColor,
      design: { ...MICROSITE_THEME.designDefaults, ...variant.design },
    }));
  };

  const resetDesignToDefault = () => {
    setSettings((prev) => ({
      ...prev,
      primaryColor: MICROSITE_THEME.accent,
      design: { ...MICROSITE_THEME.designDefaults },
    }));
  };

  const addNavLink = () => {
    updateNavigation({
      links: [...navLinks, { label: "New link", href: "#" }],
    });
  };

  const updateNavLink = (index: number, patch: { label?: string; href?: string; children?: Array<{ label: string; href: string }> }) => {
    const next = [...navLinks];
    next[index] = { ...(next[index] ?? { label: "", href: "#" }), ...patch };
    updateNavigation({ links: next });
  };

  const removeNavLink = (index: number) => {
    const next = navLinks.filter((_, i) => i !== index);
    updateNavigation({ links: next });
  };

  const addNavChild = (index: number) => {
    const next = [...navLinks];
    const children = [...(next[index]?.children ?? []), { label: "Dropdown item", href: "#" }];
    next[index] = { ...(next[index] ?? { label: "", href: "#" }), children };
    updateNavigation({ links: next });
  };

  const updateNavChild = (index: number, childIndex: number, patch: { label?: string; href?: string }) => {
    const next = [...navLinks];
    const children = [...(next[index]?.children ?? [])];
    children[childIndex] = { ...(children[childIndex] ?? { label: "", href: "#" }), ...patch };
    next[index] = { ...(next[index] ?? { label: "", href: "#" }), children };
    updateNavigation({ links: next });
  };

  const removeNavChild = (index: number, childIndex: number) => {
    const next = [...navLinks];
    const children = (next[index]?.children ?? []).filter((_, i) => i !== childIndex);
    next[index] = { ...(next[index] ?? { label: "", href: "#" }), children };
    updateNavigation({ links: next });
  };

  const addFooterColumn = () => {
    updateFooter({
      columns: [...footerColumns, { title: "New column", links: [] }],
    });
  };

  const updateFooterColumn = (index: number, patch: { title?: string; links?: Array<{ label: string; href: string }> }) => {
    const next = [...footerColumns];
    next[index] = { ...(next[index] ?? { title: "", links: [] }), ...patch };
    updateFooter({ columns: next });
  };

  const removeFooterColumn = (index: number) => {
    updateFooter({ columns: footerColumns.filter((_, i) => i !== index) });
  };

  const addFooterLink = (index: number) => {
    const next = [...footerColumns];
    const links = [...(next[index]?.links ?? []), { label: "Link", href: "#" }];
    next[index] = { ...(next[index] ?? { title: "", links: [] }), links };
    updateFooter({ columns: next });
  };

  const updateFooterLink = (index: number, linkIndex: number, patch: { label?: string; href?: string }) => {
    const next = [...footerColumns];
    const links = [...(next[index]?.links ?? [])];
    links[linkIndex] = { ...(links[linkIndex] ?? { label: "", href: "#" }), ...patch };
    next[index] = { ...(next[index] ?? { title: "", links: [] }), links };
    updateFooter({ columns: next });
  };

  const removeFooterLink = (index: number, linkIndex: number) => {
    const next = [...footerColumns];
    const links = (next[index]?.links ?? []).filter((_, i) => i !== linkIndex);
    next[index] = { ...(next[index] ?? { title: "", links: [] }), links };
    updateFooter({ columns: next });
  };

  const addFooterSocial = () => {
    updateFooter({
      socials: [...footerSocials, { platform: "twitter", url: "" } as FooterSocial],
    });
  };

  const updateFooterSocial = (index: number, patch: Partial<FooterSocial>) => {
    const next = [...footerSocials] as FooterSocial[];
    next[index] = {
      ...(next[index] ?? ({ platform: "twitter", url: "" } as FooterSocial)),
      ...patch,
    };
    updateFooter({ socials: next });
  };

  const removeFooterSocial = (index: number) => {
    updateFooter({ socials: footerSocials.filter((_, i) => i !== index) });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Microsite" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Microsite" description="Manage your event&apos;s public-facing website">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowCreatePage(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New page
          </Button>
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Label htmlFor="microsite-auto-publish-toggle" className="text-xs text-muted-foreground">
              Auto publish
            </Label>
            <Switch
              id="microsite-auto-publish-toggle"
              checked={autoPublishEnabled}
              onCheckedChange={handleAutoPublishChange}
            />
          </div>
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Label htmlFor="microsite-publish-toggle" className="text-xs text-muted-foreground">
              {isMicrositePublished ? "Published" : "Unpublished"}
            </Label>
            <Switch
              id="microsite-publish-toggle"
              checked={isMicrositePublished}
              disabled={isPublishing}
              onCheckedChange={setPublishStatus}
            />
            {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="appearance" className="w-full">
            <div className="sticky top-0 z-20 border-b bg-background/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px] flex-1">
                  <p className="text-sm font-semibold">Microsite Design System</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Configure your microsite&apos;s visual identity, navigation, footer, and global custom code.
                  </p>
                </div>
                <Button onClick={saveSettings} disabled={isSavingSettings}>
                  {isSavingSettings ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Save settings
                </Button>
              </div>
              <TabsList className="mt-3 grid h-auto w-full grid-cols-2 gap-1 bg-muted/60 p-1 md:grid-cols-4">
                <TabsTrigger value="appearance" className="text-xs">Appearance</TabsTrigger>
                <TabsTrigger value="navigation" className="text-xs">Navigation</TabsTrigger>
                <TabsTrigger value="footer" className="text-xs">Footer</TabsTrigger>
                <TabsTrigger value="custom-code" className="text-xs">Custom Code</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-5">
          <TabsContent value="appearance" className="mt-0 space-y-5 rounded-xl border bg-muted/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Appearance</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Theme, design tokens, typography, and brand identity.
                </p>
              </div>
              <Badge variant="outline" className="capitalize">
                {settings.theme ?? "system"} theme
              </Badge>
            </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Theme</Label>
              <Select
                value={(settings.theme as string) ?? "system"}
                onValueChange={(value) => setSettings((prev) => ({ ...prev, theme: value as "system" | "light" | "dark" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">system</SelectItem>
                  <SelectItem value="light">light</SelectItem>
                  <SelectItem value="dark">dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Design Presets</p>
              <Button type="button" size="sm" variant="ghost" onClick={resetDesignToDefault}>
                Reset
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {MICROSITE_DESIGN_PRESETS.map((preset) => (
                <div key={preset.id} className="rounded-lg border p-3">
                  <p className="text-sm font-semibold">{preset.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(["light", "dark"] as const).map((mode) => {
                      const variant = preset.variants[mode];
                      return (
                        <div key={`${preset.id}-${mode}`} className="rounded-md border bg-muted/20 p-2.5">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {mode}
                          </p>
                          <div
                            className="mt-1.5 h-2 w-full rounded-full"
                            style={{
                              background: `linear-gradient(90deg, ${variant.primaryColor}, ${variant.design.accentSecondary ?? variant.primaryColor})`,
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 w-full text-xs"
                            onClick={() => applyDesignPreset(preset.id, mode)}
                          >
                            Apply {mode}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-background p-4 space-y-4">
            <p className="text-sm font-semibold">Design Tokens</p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Primary Accent</Label>
                <Input value={settings.primaryColor ?? ""} onChange={(e) => setSettings((prev) => ({ ...prev, primaryColor: e.target.value }))} placeholder="#1c55ff" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Accent Secondary</Label>
                <Input value={design.accentSecondary ?? ""} onChange={(e) => updateDesign({ accentSecondary: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Page Background</Label>
                <Input value={design.pageBackground ?? ""} onChange={(e) => updateDesign({ pageBackground: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Surface Background</Label>
                <Input value={design.surfaceBackground ?? ""} onChange={(e) => updateDesign({ surfaceBackground: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Surface Muted</Label>
                <Input value={design.surfaceMuted ?? ""} onChange={(e) => updateDesign({ surfaceMuted: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Text Color</Label>
                <Input value={design.textColor ?? ""} onChange={(e) => updateDesign({ textColor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Muted Text Color</Label>
                <Input value={design.mutedTextColor ?? ""} onChange={(e) => updateDesign({ mutedTextColor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Border Color</Label>
                <Input value={design.borderColor ?? ""} onChange={(e) => updateDesign({ borderColor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dark Surface</Label>
                <Input value={design.darkSurface ?? ""} onChange={(e) => updateDesign({ darkSurface: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ring Start</Label>
                <Input value={design.ringStart ?? ""} onChange={(e) => updateDesign({ ringStart: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ring Middle</Label>
                <Input value={design.ringMiddle ?? ""} onChange={(e) => updateDesign({ ringMiddle: e.target.value })} />
              </div>
            </div>
            <div className="h-2 rounded-full" style={designPreviewStyle} />
          </div>

          <div className="rounded-lg border bg-background p-4 space-y-4">
            <p className="text-sm font-semibold">Typography, Layout, and Motion</p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs">Heading Font</Label>
                <Select value={(design.headingFont as string) ?? "sf"} onValueChange={(value) => updateDesign({ headingFont: value as "sf" | "pally" | "neco" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sf">sf</SelectItem>
                    <SelectItem value="pally">pally</SelectItem>
                    <SelectItem value="neco">neco</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Body Font</Label>
                <Select value={(design.bodyFont as string) ?? "inter"} onValueChange={(value) => updateDesign({ bodyFont: value as "inter" | "poppins" | "neco" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inter">inter</SelectItem>
                    <SelectItem value="poppins">poppins</SelectItem>
                    <SelectItem value="neco">neco</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Container Width</Label>
                <Select value={(design.containerWidth as string) ?? "normal"} onValueChange={(value) => updateDesign({ containerWidth: value as "normal" | "wide" | "ultra" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">normal</SelectItem>
                    <SelectItem value="wide">wide</SelectItem>
                    <SelectItem value="ultra">ultra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs">Pattern Style</Label>
                <Select value={(design.patternStyle as string) ?? "circuits"} onValueChange={(value) => updateDesign({ patternStyle: value as "circuits" | "dots" | "grid" | "none" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circuits">circuits</SelectItem>
                    <SelectItem value="dots">dots</SelectItem>
                    <SelectItem value="grid">grid</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Pattern Opacity</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={design.patternOpacity ?? 20}
                  onChange={(e) => updateDesign({ patternOpacity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Motion</Label>
                <Select value={(design.animation as string) ?? "full"} onValueChange={(value) => updateDesign({ animation: value as "full" | "reduced" | "none" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">full</SelectItem>
                    <SelectItem value="reduced">reduced</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs">Radius Scale</Label>
                <Select value={(design.radiusScale as string) ?? "comfortable"} onValueChange={(value) => updateDesign({ radiusScale: value as "compact" | "comfortable" | "rounded" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">compact</SelectItem>
                    <SelectItem value="comfortable">comfortable</SelectItem>
                    <SelectItem value="rounded">rounded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Shadow Strength</Label>
                <Select value={(design.shadowStrength as string) ?? "medium"} onValueChange={(value) => updateDesign({ shadowStrength: value as "soft" | "medium" | "bold" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">soft</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="bold">bold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Card Style</Label>
                <Select value={(design.cardStyle as string) ?? "elevated"} onValueChange={(value) => updateDesign({ cardStyle: value as "elevated" | "outlined" | "flat" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elevated">elevated</SelectItem>
                    <SelectItem value="outlined">outlined</SelectItem>
                    <SelectItem value="flat">flat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm">Site Name</Label>
              <Input
                value={settings.branding?.siteName ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    branding: { ...(prev.branding ?? {}), siteName: e.target.value },
                  }))
                }
                placeholder="Math&Maroc"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Tagline</Label>
              <Input
                value={settings.branding?.tagline ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    branding: { ...(prev.branding ?? {}), tagline: e.target.value },
                  }))
                }
                placeholder="Empowering future innovators"
              />
            </div>
          </div>
          </TabsContent>

          <TabsContent value="navigation" className="mt-0 space-y-4 rounded-xl border bg-muted/10 p-4 sm:p-5">
            <div>
              <p className="text-sm font-semibold">Navigation</p>
              <p className="text-xs text-muted-foreground mt-1">
                Configure header links, dropdowns, CTA button, and logo.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-lg border bg-background p-3">
                <Label className="text-sm">Logo</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      try {
                        const assetKey = await uploadAsset(file);
                        updateNavigation({ logoAssetKey: assetKey });
                        toast.success("Logo uploaded");
                      } catch {
                        toast.error("Logo upload failed");
                      } finally {
                        input.value = "";
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      openMediaLibrary("image", (assetKey) => updateNavigation({ logoAssetKey: assetKey }))
                    }
                  >
                    Library
                  </Button>
                </div>
                <Input
                  value={settings.navigation?.logoAssetKey ?? ""}
                  onChange={(e) => updateNavigation({ logoAssetKey: e.target.value })}
                  placeholder="https://... or asset key"
                />
              </div>

              <div className="space-y-3 rounded-lg border bg-background p-3">
                <div className="space-y-2">
                  <Label className="text-sm">Navigation Style</Label>
                  <Select
                    value={(settings.navigation?.style as string) ?? "glass"}
                    onValueChange={(value) => updateNavigation({ style: value as "glass" | "solid" | "minimal" })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="glass">glass</SelectItem>
                      <SelectItem value="solid">solid</SelectItem>
                      <SelectItem value="minimal">minimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Behavior</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Position</Label>
                      <Select
                        value={(settings.navigation?.sticky ?? true) ? "sticky" : "static"}
                        onValueChange={(value) => updateNavigation({ sticky: value === "sticky" })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sticky">Sticky</SelectItem>
                          <SelectItem value="static">Static</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tagline</Label>
                      <Select
                        value={(settings.navigation?.showTagline ?? true) ? "show" : "hide"}
                        onValueChange={(value) => updateNavigation({ showTagline: value === "show" })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="show">Show</SelectItem>
                          <SelectItem value="hide">Hide</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Login Button</Label>
                  <Select
                    value={(settings.navigation?.showLogin ?? true) ? "show" : "hide"}
                    onValueChange={(value) => updateNavigation({ showLogin: value === "show" })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="show">Show</SelectItem>
                      <SelectItem value="hide">Hide</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={settings.navigation?.loginLabel ?? ""}
                      onChange={(e) => updateNavigation({ loginLabel: e.target.value })}
                      placeholder="Se connecter"
                    />
                    <Input
                      value={settings.navigation?.loginHref ?? ""}
                      onChange={(e) => updateNavigation({ loginHref: e.target.value })}
                      placeholder="/login"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-background p-3">
              <Label className="text-sm">CTA Button</Label>
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  value={navCta.label ?? ""}
                  onChange={(e) => updateNavigation({ cta: { ...navCta, label: e.target.value } })}
                  placeholder="Apply Now"
                />
                <Input
                  value={navCta.href ?? ""}
                  onChange={(e) => updateNavigation({ cta: { ...navCta, href: e.target.value } })}
                  placeholder="/applications/event/..."
                />
                <Select
                  value={(navCta.variant as string) ?? "primary"}
                  onValueChange={(value) => updateNavigation({ cta: { ...navCta, variant: value as "primary" | "secondary" | "outline" } })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">primary</SelectItem>
                    <SelectItem value="secondary">secondary</SelectItem>
                    <SelectItem value="outline">outline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Navigation Links</Label>
                <Button type="button" size="sm" variant="outline" onClick={addNavLink}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add link
                </Button>
              </div>
              {navLinks.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                  No navigation links yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {navLinks.map((link, index) => (
                    <div key={`${link.label}-${index}`} className="rounded-lg border p-3 space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          value={link.label ?? ""}
                          onChange={(e) => updateNavLink(index, { label: e.target.value })}
                          placeholder="Label"
                        />
                        <Input
                          value={link.href ?? ""}
                          onChange={(e) => updateNavLink(index, { href: e.target.value })}
                          placeholder="/about"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Dropdown Items</p>
                          <Button type="button" size="sm" variant="outline" onClick={() => addNavChild(index)}>
                            <Plus className="mr-1 h-3 w-3" />
                            Add dropdown
                          </Button>
                        </div>
                        {(link.children ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No dropdown items</p>
                        ) : (
                          <div className="space-y-2">
                            {(link.children ?? []).map((child, childIndex) => (
                              <div key={`${child.label}-${childIndex}`} className="grid gap-2 md:grid-cols-2">
                                <Input
                                  value={child.label ?? ""}
                                  onChange={(e) => updateNavChild(index, childIndex, { label: e.target.value })}
                                  placeholder="Dropdown label"
                                />
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={child.href ?? ""}
                                    onChange={(e) => updateNavChild(index, childIndex, { href: e.target.value })}
                                    placeholder="/path"
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive"
                                    onClick={() => removeNavChild(index, childIndex)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => removeNavLink(index)}
                        >
                          Remove link
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="footer" className="mt-0 space-y-4 rounded-xl border bg-muted/10 p-4 sm:p-5">
            <div>
              <p className="text-sm font-semibold">Footer</p>
              <p className="text-xs text-muted-foreground mt-1">
                Manage footer columns, social links, and legal text.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-lg border bg-background p-3">
                <Label className="text-sm">Footer Style</Label>
                <Select
                  value={(settings.footer?.style as string) ?? "angled"}
                  onValueChange={(value) => updateFooter({ style: value as "angled" | "simple" | "minimal" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="angled">angled</SelectItem>
                    <SelectItem value="simple">simple</SelectItem>
                    <SelectItem value="minimal">minimal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-lg border bg-background p-3">
                <Label className="text-sm">Visibility Toggles</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Logo</Label>
                    <Select
                      value={(settings.footer?.showLogo ?? true) ? "show" : "hide"}
                      onValueChange={(value) => updateFooter({ showLogo: value === "show" })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="show">Show</SelectItem>
                        <SelectItem value="hide">Hide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tagline</Label>
                    <Select
                      value={(settings.footer?.showTagline ?? true) ? "show" : "hide"}
                      onValueChange={(value) => updateFooter({ showTagline: value === "show" })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="show">Show</SelectItem>
                        <SelectItem value="hide">Hide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Socials</Label>
                    <Select
                      value={(settings.footer?.showSocials ?? true) ? "show" : "hide"}
                      onValueChange={(value) => updateFooter({ showSocials: value === "show" })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="show">Show</SelectItem>
                        <SelectItem value="hide">Hide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Dividers</Label>
                    <Select
                      value={(settings.footer?.showDividers ?? true) ? "show" : "hide"}
                      onValueChange={(value) => updateFooter({ showDividers: value === "show" })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="show">Show</SelectItem>
                        <SelectItem value="hide">Hide</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Footer Columns</Label>
                <Button type="button" size="sm" variant="outline" onClick={addFooterColumn}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add column
                </Button>
              </div>
              {footerColumns.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                  No footer columns yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {footerColumns.map((column, columnIndex) => (
                    <div key={`${column.title}-${columnIndex}`} className="rounded-lg border p-3 space-y-3">
                      <Input
                        value={column.title ?? ""}
                        onChange={(e) => updateFooterColumn(columnIndex, { title: e.target.value })}
                        placeholder="Column title"
                      />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Links</p>
                          <Button type="button" size="sm" variant="outline" onClick={() => addFooterLink(columnIndex)}>
                            <Plus className="mr-1 h-3 w-3" />
                            Add link
                          </Button>
                        </div>
                        {(column.links ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No links yet</p>
                        ) : (
                          <div className="space-y-2">
                            {(column.links ?? []).map((link, linkIndex) => (
                              <div key={`${link.label}-${linkIndex}`} className="grid gap-2 md:grid-cols-2">
                                <Input
                                  value={link.label ?? ""}
                                  onChange={(e) => updateFooterLink(columnIndex, linkIndex, { label: e.target.value })}
                                  placeholder="Link label"
                                />
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={link.href ?? ""}
                                    onChange={(e) => updateFooterLink(columnIndex, linkIndex, { href: e.target.value })}
                                    placeholder="/path"
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive"
                                    onClick={() => removeFooterLink(columnIndex, linkIndex)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => removeFooterColumn(columnIndex)}
                        >
                          Remove column
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Social Links</Label>
                <Button type="button" size="sm" variant="outline" onClick={addFooterSocial}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add social
                </Button>
              </div>
              {footerSocials.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                  No social links yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {footerSocials.map((social, socialIndex) => (
                    <div key={`${social.platform}-${socialIndex}`} className="grid gap-2 md:grid-cols-2">
                      <Input
                        value={social.platform ?? ""}
                        onChange={(e) =>
                          updateFooterSocial(socialIndex, {
                            platform: e.target.value as FooterSocial["platform"],
                          })
                        }
                        placeholder="platform (twitter, linkedin...)"
                      />
                      <div className="flex items-center gap-2">
                        <Input
                          value={social.url ?? ""}
                          onChange={(e) => updateFooterSocial(socialIndex, { url: e.target.value })}
                          placeholder="https://..."
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => removeFooterSocial(socialIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border bg-background p-3">
              <Label className="text-sm">Legal Text</Label>
              <Input
                value={settings.footer?.legalText ?? ""}
                onChange={(e) => updateFooter({ legalText: e.target.value })}
                placeholder="© 2026 Your Organization"
              />
            </div>
          </TabsContent>

          <TabsContent value="custom-code" className="mt-0 space-y-4 rounded-xl border bg-muted/10 p-4 sm:p-5">
            <div>
              <p className="text-sm font-semibold">Custom Code</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add global CSS and tracking snippets applied across your microsite.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Global CSS</Label>
                <Textarea
                  value={settings.customCode?.css ?? ""}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customCode: { ...(prev.customCode ?? {}), css: e.target.value },
                    }))
                  }
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Head / Tracking HTML</Label>
              <Textarea
                value={settings.customCode?.headHtml ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    customCode: { ...(prev.customCode ?? {}), headHtml: e.target.value },
                  }))
                }
                rows={4}
                className="font-mono text-xs"
                placeholder="<meta> or tracking tags"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm">Body Start HTML</Label>
                <Textarea
                  value={settings.customCode?.bodyStartHtml ?? ""}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customCode: { ...(prev.customCode ?? {}), bodyStartHtml: e.target.value },
                    }))
                  }
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Body End HTML</Label>
                <Textarea
                  value={settings.customCode?.bodyEndHtml ?? ""}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customCode: { ...(prev.customCode ?? {}), bodyEndHtml: e.target.value },
                    }))
                  }
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </TabsContent>
          </div>
          </Tabs>
        </CardContent>
      </Card>

      {pages.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No pages yet"
          description="Create a page to build your event's microsite."
          actionLabel="Create page"
          onAction={() => setShowCreatePage(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pages.map((page) => (
            <Card key={page.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{page.title}</p>
                    <p className="text-xs text-muted-foreground">/{page.slug}</p>
                  </div>
                  <Badge variant={page.isPublished ? "default" : "secondary"}>
                    {page.isPublished ? (
                      <><CheckCircle2 className="mr-1 h-3 w-3" /> Published</>
                    ) : (
                      <><AlertCircle className="mr-1 h-3 w-3" /> Draft</>
                    )}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">
                    v{page.version} - {new Date(page.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link href={`${basePath}/microsite/${page.id}`}>
                        <FileEdit className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a
                        href={`/events/${eventSlug || eventId}${page.isHome ? "" : `/${page.slug}`}`}
                        target="_blank"
                        rel="noopener"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteTarget(page.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create page dialog */}
      <Dialog open={showCreatePage} onOpenChange={setShowCreatePage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create page</DialogTitle>
            <DialogDescription>Add a new page to your microsite.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Title</Label>
              <Input value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)} placeholder="e.g., About the Event" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Slug</Label>
              <Input value={newPageSlug} onChange={(e) => setNewPageSlug(e.target.value)} placeholder="about-the-event" />
              <p className="text-xs text-muted-foreground">
                Leave blank on the first page to create the homepage route.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreatePage(false)}>Cancel</Button>
            <Button onClick={createPage}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaLibraryDialog
        eventId={eventId}
        open={!!mediaPicker}
        kind={mediaPicker?.kind ?? "all"}
        csrfToken={csrfToken ?? undefined}
        onOpenChange={(open) => {
          if (!open) setMediaPicker(null);
        }}
        onSelect={(assetKey) => {
          mediaPicker?.onSelect(assetKey);
          setMediaPicker(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete page?"
        description="This will permanently delete the page and its content."
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deletePage(deleteTarget)}
        variant="destructive"
      />
    </div>
  );
}

