"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import {
  User,
  Phone,
  GraduationCap,
  Building2,
  MapPin,
  Globe,
  Link as LinkIcon,
  Lock,
  Save,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
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

interface Profile {
  email: string;
  fullName?: string;
  phone?: string;
  education?: string;
  institution?: string;
  city?: string;
  country?: string;
  links?: string[];
}

const EDUCATION_OPTIONS = [
  "Middle School",
  "High School",
  "Undergraduate",
  "Graduate",
  "PhD",
  "Other",
];

const COUNTRY_OPTIONS = [
  "Morocco",
  "France",
  "Switzerland",
    "United States",
  "Tunisia",
  "Egypt",
  "Canada",
  "United Kingdom",
  "Germany",
  "Other",
];

export default function ProfilePage() {
  const { user, csrfToken } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);

  const profileForm = useForm<Omit<Profile, "email">>({ defaultValues: {} });
  const pwForm = useForm<{ currentPassword: string; newPassword: string; confirmPassword: string }>();
  const [links, setLinks] = useState<string[]>([""]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient<Profile>("/auth/me/profile");
        profileForm.reset({
          fullName: data.fullName ?? "",
          phone: data.phone ?? "",
          education: data.education ?? "",
          institution: data.institution ?? "",
          city: data.city ?? "",
          country: data.country ?? "",
        });
        setLinks(data.links?.length ? data.links : [""]);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [profileForm]);

  // Completeness
  const profileValues = profileForm.watch();
  const fieldKeys: (keyof Omit<Profile, "email" | "links">)[] = [
    "fullName", "phone", "education", "institution", "city", "country",
  ];
  const filledCount = fieldKeys.filter(
    (k) => profileValues[k] && String(profileValues[k]).trim()
  ).length;
  const completeness = Math.round((filledCount / fieldKeys.length) * 100);

  // Get initials for avatar
  const fullName = profileValues.fullName ?? "";
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || user?.email?.[0]?.toUpperCase() || "?";

  async function onSaveProfile() {
    setIsSaving(true);
    try {
      const values = profileForm.getValues();
      const cleanLinks = links.filter((l) => l.trim());
      await apiClient("/auth/me/profile", {
        method: "PATCH",
        body: { ...values, links: cleanLinks },
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Profile updated!");
    } catch {
      /* handled */
    } finally {
      setIsSaving(false);
    }
  }

  async function onChangePassword() {
    const { currentPassword, newPassword, confirmPassword } = pwForm.getValues();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setIsChangingPw(true);
    try {
      await apiClient("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Password changed!");
      pwForm.reset();
    } catch {
      /* handled */
    } finally {
      setIsChangingPw(false);
    }
  }

  if (isLoading) return <FormSkeleton />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full space-y-6"
    >
      <PageHeader title="Profile" description="Manage your personal information and account settings" />

      {/* Avatar + completeness */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-white text-xl font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold truncate">{fullName || user?.email}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Profile completeness</span>
                  <span className="font-medium">
                    {completeness === 100 ? (
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Complete
                      </span>
                    ) : (
                      `${completeness}%`
                    )}
                  </span>
                </div>
                <Progress value={completeness} className="h-1.5" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Basic details shared with event organizers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Email</Label>
            <Input value={user?.email ?? ""} disabled className="bg-muted/50" />
            <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm">Full name</Label>
            <Input
              id="fullName"
              placeholder="Your full name"
              {...profileForm.register("fullName")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm">Phone</Label>
            <Input
              id="phone"
              placeholder="+212 612345678"
              {...profileForm.register("phone")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Education */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Education
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Education level</Label>
            <Select
              value={profileValues.education ?? ""}
              onValueChange={(v) => profileForm.setValue("education", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select education level" />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="institution" className="text-sm">Institution</Label>
            <Input
              id="institution"
              placeholder="School or university name"
              {...profileForm.register("institution")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="city" className="text-sm">City</Label>
            <Input
              id="city"
              placeholder="Your city"
              {...profileForm.register("city")}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Country</Label>
            <Select
              value={profileValues.country ?? ""}
              onValueChange={(v) => profileForm.setValue("country", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Links
          </CardTitle>
          <CardDescription>Portfolio, LinkedIn, GitHub, etc.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={link}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = e.target.value;
                  setLinks(next);
                }}
                placeholder="https://..."
              />
              {links.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLinks(links.filter((_, j) => j !== i))}
                >
                  x
                </Button>
              )}
            </div>
          ))}
          {links.length < 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinks([...links, ""])}
            >
              + Add link
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={onSaveProfile} disabled={isSaving} size="lg">
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Save all changes
        </Button>
      </div>

      <Separator />

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Change password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-sm">
              Current password
            </Label>
            <Input
              id="currentPassword"
              type="password"
              {...pwForm.register("currentPassword")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-sm">
              New password
            </Label>
            <Input
              id="newPassword"
              type="password"
              {...pwForm.register("newPassword")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm">
              Confirm new password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              {...pwForm.register("confirmPassword")}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onChangePassword} disabled={isChangingPw}>
              {isChangingPw ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-1.5 h-4 w-4" />
              )}
              Update password
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
