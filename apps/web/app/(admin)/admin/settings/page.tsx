"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  Shield,
  Palette,
  Save,
  Loader2,
  RotateCcw,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, ConfirmDialog } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface PlatformSettings {
  platformName: string;
  platformUrl: string;
  supportEmail: string;
  defaultTimezone: string;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  emailVerificationRequired: boolean;
  maxEventsPerOrganizer: number;
  maxApplicationsPerUser: number;
  defaultApplicationDeadlineDays: number;
  primaryColor: string;
  footerText: string;
  smtpHost: string;
  smtpPort: number;
  smtpSender: string;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  platformName: "Math&Maroc",
  platformUrl: "",
  supportEmail: "",
  defaultTimezone: "Africa/Casablanca",
  maintenanceMode: false,
  registrationEnabled: true,
  emailVerificationRequired: true,
  maxEventsPerOrganizer: 10,
  maxApplicationsPerUser: 5,
  defaultApplicationDeadlineDays: 30,
  primaryColor: "#2563eb",
  footerText: "",
  smtpHost: "",
  smtpPort: 587,
  smtpSender: "",
};

export default function AdminSettingsPage() {
  const { csrfToken } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [original, setOriginal] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(original);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient<PlatformSettings>("/admin/settings");
        setSettings(data);
        setOriginal(data);
      } catch {
        /* use defaults */
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  function update<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSettings() {
    setIsSaving(true);
    try {
      const data = await apiClient<PlatformSettings>("/admin/settings", {
        method: "PATCH",
        body: settings,
        csrfToken: csrfToken ?? undefined,
      });
      setSettings(data);
      setOriginal(data);
      toast.success("Settings saved successfully");
    } catch {
      /* handled */
    } finally {
      setIsSaving(false);
    }
  }

  function resetToOriginal() {
    setSettings(original);
    setShowReset(false);
    toast.info("Changes reverted");
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Loading…" />
        <div className="grid gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="Settings"
          description="Configure global platform settings"
        />
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={() => setShowReset(true)}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Revert
            </Button>
          )}
          <Button onClick={saveSettings} disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* General */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                General
              </CardTitle>
              <CardDescription>Core platform identity and configuration</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Platform name</Label>
                <Input
                  value={settings.platformName}
                  onChange={(e) => update("platformName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Platform URL</Label>
                <Input
                  value={settings.platformUrl}
                  onChange={(e) => update("platformUrl", e.target.value)}
                  placeholder="https://mathmaroc.org"
                />
              </div>
              <div className="space-y-2">
                <Label>Support email</Label>
                <Input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => update("supportEmail", e.target.value)}
                  placeholder="support@mathmaroc.org"
                />
              </div>
              <div className="space-y-2">
                <Label>Default timezone</Label>
                <Select value={settings.defaultTimezone} onValueChange={(v) => update("defaultTimezone", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Casablanca">Africa/Casablanca (GMT+1)</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (ET)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Access & Security */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Access & Security
              </CardTitle>
              <CardDescription>Control who can access the platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Maintenance mode</p>
                  <p className="text-xs text-muted-foreground">
                    Temporarily disable public access to the platform
                  </p>
                </div>
                <Switch
                  checked={settings.maintenanceMode}
                  onCheckedChange={(v) => update("maintenanceMode", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">User registration</p>
                  <p className="text-xs text-muted-foreground">
                    Allow new users to create accounts
                  </p>
                </div>
                <Switch
                  checked={settings.registrationEnabled}
                  onCheckedChange={(v) => update("registrationEnabled", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Email verification required</p>
                  <p className="text-xs text-muted-foreground">
                    Users must verify their email before accessing features
                  </p>
                </div>
                <Switch
                  checked={settings.emailVerificationRequired}
                  onCheckedChange={(v) => update("emailVerificationRequired", v)}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Branding */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" />
                Branding
              </CardTitle>
              <CardDescription>Customize the platform appearance</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Primary color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => update("primaryColor", e.target.value)}
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={settings.primaryColor}
                    onChange={(e) => update("primaryColor", e.target.value)}
                    className="flex-1"
                    placeholder="#2563eb"
                  />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Footer text</Label>
                <Textarea
                  value={settings.footerText}
                  onChange={(e) => update("footerText", e.target.value)}
                  placeholder="© 2025 Math&Maroc. All rights reserved."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

      </div>

      {/* Sticky save bar when changes exist */}
      {hasChanges && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky bottom-4 z-10"
        >
          <Card className="border-primary/20 bg-primary/5 backdrop-blur">
            <CardContent className="flex items-center justify-between p-3">
              <p className="text-sm font-medium">You have unsaved changes</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowReset(true)}>
                  Discard
                </Button>
                <Button size="sm" onClick={saveSettings} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <ConfirmDialog
        open={showReset}
        onOpenChange={setShowReset}
        title="Discard changes?"
        description="All unsaved changes will be lost."
        confirmLabel="Discard"
        onConfirm={resetToOriginal}
        variant="destructive"
      />
    </div>
  );
}
