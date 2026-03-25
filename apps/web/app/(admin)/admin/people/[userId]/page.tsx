"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  Save,
  ShieldAlert,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, PageHeader } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface AdminUserRoleAssignmentSummary {
  id: string;
  role: string;
  eventId: string;
  eventName: string;
  accessStartAt: string | null;
  accessEndAt: string | null;
  isActive: boolean;
}

interface AdminUserDetail {
  id: string;
  email: string;
  isDisabled: boolean;
  isGlobalAdmin: boolean;
  hasStaffRole: boolean;
  staffRoleCount: number;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  applicationCount: number;
  eventCount: number;
  lastApplicationAt: string | null;
  profile: {
    fullName: string;
    firstName: string;
    lastName: string;
    phone: string;
    education: string;
    institution: string;
    city: string;
    country: string;
    dateOfBirth: string;
    links: string[];
  };
  eventRoles: AdminUserRoleAssignmentSummary[];
}

interface AdminUserUpdateResult {
  user: AdminUserDetail;
  sessionsRevoked: number;
}

interface AdminPasswordUpdateResult {
  message: string;
  sessionsRevoked: number;
}

interface UserFormState {
  email: string;
  isDisabled: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  education: string;
  institution: string;
  city: string;
  country: string;
  dateOfBirth: string;
  linksText: string;
}

const EMPTY_FORM: UserFormState = {
  email: "",
  isDisabled: false,
  firstName: "",
  lastName: "",
  phone: "",
  education: "",
  institution: "",
  city: "",
  country: "",
  dateOfBirth: "",
  linksText: "",
};

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  return new Date(value).toLocaleString("en-GB");
}

function normalizeText(value: string): string {
  return value.trim();
}

function parseLinksInput(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 10);
}

export default function AdminUserDetailPage() {
  const { csrfToken } = useAuth();
  const params = useParams<{ userId: string }>();
  const userId = Array.isArray(params?.userId) ? params.userId[0] : params?.userId;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const data = await apiClient<AdminUserDetail>(`/admin/users/${userId}`);
        if (cancelled) return;
        setUser(data);
        setForm({
          email: data.email,
          isDisabled: data.isDisabled,
          firstName: data.profile.firstName ?? "",
          lastName: data.profile.lastName ?? "",
          phone: data.profile.phone ?? "",
          education: data.profile.education ?? "",
          institution: data.profile.institution ?? "",
          city: data.profile.city ?? "",
          country: data.profile.country ?? "",
          dateOfBirth: data.profile.dateOfBirth ?? "",
          linksText: (data.profile.links ?? []).join("\n"),
        });
      } catch {
        if (cancelled) return;
        setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updatePayload = useMemo(() => {
    if (!user) return { hasChanges: false, payload: {} as Record<string, unknown> };

    const payload: Record<string, unknown> = {};

    const normalizedEmail = normalizeText(form.email).toLowerCase();
    if (normalizedEmail !== user.email.toLowerCase()) {
      payload.email = normalizedEmail;
    }

    if (form.isDisabled !== user.isDisabled) {
      payload.isDisabled = form.isDisabled;
    }

    const profileFields: Array<
      [
        keyof Pick<
          UserFormState,
          "firstName" | "lastName" | "phone" | "education" | "institution" | "city" | "country" | "dateOfBirth"
        >,
        string
      ]
    > = [
      ["firstName", user.profile.firstName ?? ""],
      ["lastName", user.profile.lastName ?? ""],
      ["phone", user.profile.phone ?? ""],
      ["education", user.profile.education ?? ""],
      ["institution", user.profile.institution ?? ""],
      ["city", user.profile.city ?? ""],
      ["country", user.profile.country ?? ""],
      ["dateOfBirth", user.profile.dateOfBirth ?? ""],
    ];

    for (const [key, currentValue] of profileFields) {
      const nextValue = normalizeText(form[key]);
      if (nextValue !== normalizeText(currentValue)) {
        payload[key] = nextValue;
      }
    }

    const nextLinks = parseLinksInput(form.linksText);
    const currentLinks = user.profile.links ?? [];
    if (JSON.stringify(nextLinks) !== JSON.stringify(currentLinks)) {
      payload.links = nextLinks;
    }

    return {
      hasChanges: Object.keys(payload).length > 0,
      payload,
    };
  }, [form, user]);

  async function saveChanges() {
    if (!user || !userId) return;
    if (!updatePayload.hasChanges) {
      toast.info("No changes to save.");
      setShowSaveConfirm(false);
      return;
    }

    setIsSaving(true);
    try {
      const result = await apiClient<AdminUserUpdateResult>(`/admin/users/${userId}`, {
        method: "PATCH",
        body: updatePayload.payload,
        csrfToken: csrfToken ?? undefined,
      });

      setUser(result.user);
      setForm({
        email: result.user.email,
        isDisabled: result.user.isDisabled,
        firstName: result.user.profile.firstName ?? "",
        lastName: result.user.profile.lastName ?? "",
        phone: result.user.profile.phone ?? "",
        education: result.user.profile.education ?? "",
        institution: result.user.profile.institution ?? "",
        city: result.user.profile.city ?? "",
        country: result.user.profile.country ?? "",
        dateOfBirth: result.user.profile.dateOfBirth ?? "",
        linksText: (result.user.profile.links ?? []).join("\n"),
      });

      if (result.sessionsRevoked > 0) {
        toast.success(`User updated. ${result.sessionsRevoked} active session(s) revoked.`);
      } else {
        toast.success("User updated.");
      }
    } catch {
      // apiClient already surfaces error feedback
    } finally {
      setIsSaving(false);
      setShowSaveConfirm(false);
    }
  }

  async function updatePassword() {
    if (!userId) return;

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      setShowPasswordConfirm(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      setShowPasswordConfirm(false);
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const result = await apiClient<AdminPasswordUpdateResult>(
        `/admin/users/${userId}/password`,
        {
          method: "POST",
          body: { newPassword },
          csrfToken: csrfToken ?? undefined,
        },
      );
      setNewPassword("");
      setConfirmPassword("");
      toast.success(`${result.message}. ${result.sessionsRevoked} active session(s) revoked.`);
    } catch {
      // apiClient already surfaces error feedback
    } finally {
      setIsUpdatingPassword(false);
      setShowPasswordConfirm(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Detail" description="Loading user information..." />
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading account...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Detail" description="User not found." />
        <Button variant="outline" asChild>
          <Link href="/admin/people">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to People
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.profile.fullName || user.email}
        description="Manage account, profile, and password with full admin control"
      >
        <Button variant="outline" asChild>
          <Link href="/admin/people">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to People
          </Link>
        </Button>
      </PageHeader>

      <Alert className="border-warning/40 bg-warning/5">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>
          Editing account details or password is sensitive and audited. Email, password, and disable changes revoke active user sessions.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Account Summary</CardTitle>
            <CardDescription>Current account state and access scope</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {user.isGlobalAdmin && <Badge>Global Admin</Badge>}
              {user.hasStaffRole && !user.isGlobalAdmin && <Badge variant="secondary">Staff</Badge>}
              {!user.hasStaffRole && <Badge variant="outline">User</Badge>}
              {user.isDisabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="secondary">Enabled</Badge>}
              {user.emailVerifiedAt ? <Badge variant="secondary">Verified</Badge> : <Badge variant="outline">Unverified</Badge>}
            </div>
            <Separator />
            <p>
              <span className="text-muted-foreground">User ID:</span> {user.id}
            </p>
            <p>
              <span className="text-muted-foreground">Created:</span> {formatDate(user.createdAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Updated:</span> {formatDate(user.updatedAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Applications:</span> {user.applicationCount}
            </p>
            <p>
              <span className="text-muted-foreground">Events:</span> {user.eventCount}
            </p>
            <p>
              <span className="text-muted-foreground">Last Application:</span> {formatDate(user.lastApplicationAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Staff Roles:</span> {user.staffRoleCount}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Account & Profile
              </CardTitle>
              <CardDescription>Update email, status, and profile fields</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, firstName: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, lastName: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="education">Education</Label>
                  <Input
                    id="education"
                    value={form.education}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, education: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="institution">Institution</Label>
                  <Input
                    id="institution"
                    value={form.institution}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, institution: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, city: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={form.country}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, country: event.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="links">Links (one URL per line)</Label>
                  <Textarea
                    id="links"
                    value={form.linksText}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, linksText: event.target.value }))
                    }
                    rows={4}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Disable account</p>
                  <p className="text-xs text-muted-foreground">
                    Disabled users cannot log in.
                  </p>
                </div>
                <Switch
                  checked={form.isDisabled}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isDisabled: checked }))
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    if (!updatePayload.hasChanges) {
                      toast.info("No changes to save.");
                      return;
                    }
                    setShowSaveConfirm(true);
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                Set Password
              </CardTitle>
              <CardDescription>
                Set a new password directly for this user. This revokes active sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordConfirm(true)}
                  disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                >
                  {isUpdatingPassword ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-1.5 h-4 w-4" />
                  )}
                  Update password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Staff Role Assignments</CardTitle>
              <CardDescription>Read-only role visibility for this account</CardDescription>
            </CardHeader>
            <CardContent>
              {user.eventRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No event-scoped staff roles.</p>
              ) : (
                <div className="space-y-2">
                  {user.eventRoles.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {assignment.role.replace(/_/g, " ")} - {assignment.eventName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Start: {formatDate(assignment.accessStartAt)} | End: {formatDate(assignment.accessEndAt)}
                        </p>
                      </div>
                      <Badge variant={assignment.isActive ? "secondary" : "outline"}>
                        {assignment.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        title="Apply account/profile changes?"
        description="This action is sensitive and audited. Email and disable changes revoke active sessions for this user."
        confirmLabel="Apply changes"
        onConfirm={saveChanges}
      />

      <ConfirmDialog
        open={showPasswordConfirm}
        onOpenChange={setShowPasswordConfirm}
        title="Set new password for this user?"
        description="This will immediately replace the current password and revoke active sessions."
        confirmLabel="Set password"
        onConfirm={updatePassword}
      />
    </div>
  );
}
