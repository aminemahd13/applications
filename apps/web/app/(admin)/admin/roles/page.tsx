"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  Plus,
  Trash2,
  Users,
  Loader2,
  UserPlus,
  Crown,
  TriangleAlert,
  BriefcaseBusiness,
  Layers,
  Mail,
  UserCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  PageHeader,
  EmptyState,
  ConfirmDialog,
  TableSkeleton,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  organizer: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  reviewer:
    "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  checkin_staff:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  content_editor:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  global_admin: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

interface StaffMember {
  id: string;
  email: string;
  fullName?: string;
  role: string;
  eventName?: string;
  eventId?: string;
  assignedAt: string;
  isGlobalAdmin?: boolean;
  invitationSent?: boolean;
}

interface EventOption {
  id: string;
  title: string;
}

interface StaffGroup {
  key: string;
  email: string;
  fullName?: string;
  isGlobalAdmin?: boolean;
  assignments: StaffMember[];
  latestAssignedAtMs: number;
}

function groupAssignments(items: StaffMember[]): StaffGroup[] {
  const groups = new Map<string, StaffGroup>();

  for (const member of items) {
    const key = member.email.toLowerCase();
    const assignedAtMs = new Date(member.assignedAt).getTime();
    const existing = groups.get(key);

    if (existing) {
      existing.assignments.push(member);
      if (!existing.fullName && member.fullName) {
        existing.fullName = member.fullName;
      }
      existing.isGlobalAdmin = existing.isGlobalAdmin || member.isGlobalAdmin;
      if (assignedAtMs > existing.latestAssignedAtMs) {
        existing.latestAssignedAtMs = assignedAtMs;
      }
      continue;
    }

    groups.set(key, {
      key,
      email: member.email,
      fullName: member.fullName,
      isGlobalAdmin: member.isGlobalAdmin,
      assignments: [member],
      latestAssignedAtMs: assignedAtMs,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      assignments: [...group.assignments].sort(
        (a, b) =>
          new Date(b.assignedAt).getTime() -
          new Date(a.assignedAt).getTime(),
      ),
    }))
    .sort((a, b) =>
      (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email),
    );
}

export default function RolesPage() {
  const { csrfToken } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Assign role dialog
  const [showAssign, setShowAssign] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState("reviewer");
  const [assignEventId, setAssignEventId] = useState("__unset__");
  const [isAssigning, setIsAssigning] = useState(false);

  const [roleFilter, setRoleFilter] = useState("all");
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient<StaffMember[]>("/admin/roles");
        setStaff(data);

        // Fetch events for dropdown
        const eventsResponse = await apiClient<{ data: EventOption[] }>(
          "/admin/events?limit=100",
        );
        setEvents(eventsResponse.data);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = staff.filter((s) => {
    const matchRole = roleFilter === "all" || s.role === roleFilter;
    const matchSearch =
      !normalizedSearch ||
      s.email.toLowerCase().includes(normalizedSearch) ||
      (s.fullName ?? "").toLowerCase().includes(normalizedSearch) ||
      (s.eventName ?? "").toLowerCase().includes(normalizedSearch) ||
      s.role.toLowerCase().includes(normalizedSearch);
    return matchRole && matchSearch;
  });

  const groupedAll = groupAssignments(staff);
  const grouped = groupAssignments(filtered);
  const multiRoleUsers = groupedAll.filter((g) => g.assignments.length > 1)
    .length;
  const normalizedAssignEmail = assignEmail.trim().toLowerCase();
  const existingGroup = normalizedAssignEmail
    ? groupedAll.find((g) => g.email.toLowerCase() === normalizedAssignEmail)
    : null;
  const existingAssignments = existingGroup?.assignments ?? [];
  const selectedEvent =
    assignEventId !== "_global_" && assignEventId !== "__unset__"
      ? events.find((event) => event.id === assignEventId)
      : null;
  const scopeLabel =
    assignEventId === "_global_"
      ? "Global"
      : assignEventId === "__unset__"
        ? "Select scope"
        : selectedEvent?.title ?? "Event";
  const scopeError =
    assignEventId === "__unset__"
      ? "Select a scope to continue."
      : assignEventId === "_global_" && assignRole !== "global_admin"
        ? "Global scope requires the Global Admin role."
        : assignEventId !== "_global_" && assignRole === "global_admin"
          ? "Global Admin must use Global scope."
          : null;
  const canAssign =
    !!normalizedAssignEmail && !scopeError && assignEventId !== "__unset__";

  const roleCounts = staff.reduce(
    (acc, s) => {
      acc[s.role] = (acc[s.role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const uniqueStaffUsers = groupedAll.length;
  const roleAssignmentCount = staff.length;

  async function assignRoleFn() {
    if (!assignEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    if (assignEventId === "__unset__") {
      toast.error("Choose an event scope or explicit Global scope");
      return;
    }
    if (assignEventId === "_global_" && assignRole !== "global_admin") {
      toast.error("Global scope requires the Global Admin role");
      return;
    }
    if (assignEventId !== "_global_" && assignRole === "global_admin") {
      toast.error("Global Admin must use Global scope");
      return;
    }
    setIsAssigning(true);
    try {
      const member = await apiClient<StaffMember>("/admin/roles", {
        method: "POST",
        body: {
          email: assignEmail,
          role: assignRole,
          eventId: assignEventId === "_global_" ? undefined : assignEventId,
        },
        csrfToken: csrfToken ?? undefined,
      });
      setStaff((prev) => [member, ...prev]);
      setShowAssign(false);
      setAssignEmail("");
      setAssignEventId("__unset__");
      if (member.invitationSent === true) {
        toast.success("Invitation sent and role assigned");
      } else if (member.invitationSent === false) {
        toast.info("Role assigned, but the invitation email could not be sent");
      } else {
        toast.success("Role assigned successfully");
      }
    } catch {
      /* handled */
    } finally {
      setIsAssigning(false);
    }
  }

  async function removeRole(member: StaffMember) {
    try {
      await apiClient(`/admin/roles/${member.id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setStaff((prev) => prev.filter((s) => s.id !== member.id));
      toast.success(
        `Removed ${member.role.replace("_", " ")} role from ${member.email}`,
      );
    } catch {
      /* handled */
    } finally {
      setRemoveTarget(null);
    }
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Users"
        description="Manage staff role assignments across events"
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Staff Users", value: uniqueStaffUsers, icon: Users },
          {
            label: "Role Assignments",
            value: roleAssignmentCount,
            icon: BriefcaseBusiness,
          },
          {
            label: "Multi-role Users",
            value: multiRoleUsers,
            icon: Layers,
          },
          {
            label: "Organizers",
            value: roleCounts["organizer"] || 0,
            icon: Crown,
          },
          {
            label: "Reviewers",
            value: roleCounts["reviewer"] || 0,
            icon: Shield,
          },
          {
            label: "Check-in Staff",
            value: roleCounts["checkin_staff"] || 0,
            icon: UserPlus,
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search by name, email, role, or event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="organizer">Organizer</SelectItem>
            <SelectItem value="reviewer">Reviewer</SelectItem>
            <SelectItem value="checkin_staff">Check-in Staff</SelectItem>
            <SelectItem value="content_editor">Content Editor</SelectItem>
            <SelectItem value="global_admin">Global Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button className="sm:ml-auto" onClick={() => setShowAssign(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Assign role
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Roles are grouped by user. Showing {grouped.length} users and{" "}
        {filtered.length} assignments.
      </p>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No staff found"
          description={
            search || roleFilter !== "all"
              ? "Try different filters."
              : "Assign roles to get started."
          }
          actionLabel="Assign role"
          onAction={() => setShowAssign(true)}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Assignments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((group) => {
                  const uniqueScopes = new Set(
                    group.assignments.map((assignment) =>
                      assignment.eventId ? assignment.eventId : "global",
                    ),
                  ).size;
                  const assignmentCount = group.assignments.length;

                  return (
                    <TableRow key={group.key}>
                      <TableCell className="align-top">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(group.fullName, group.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {group.fullName ?? group.email}
                              {group.isGlobalAdmin && (
                                <Badge
                                  variant="secondary"
                                  className="ml-2 text-[10px] px-1.5 py-0"
                                >
                                  Admin
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {group.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {assignmentCount} assignment
                              {assignmentCount === 1 ? "" : "s"} /{" "}
                              {uniqueScopes} scope
                              {uniqueScopes === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {group.assignments.map((assignment) => {
                            const workspaceHref = assignment.eventId
                              ? `/staff/${assignment.eventId}`
                              : assignment.isGlobalAdmin
                                ? "/admin"
                                : null;
                            const scopeLabel =
                              assignment.eventName ?? "Global";

                            return (
                              <div
                                key={assignment.id}
                                className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
                              >
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[assignment.role] ?? "bg-muted text-muted-foreground"}`}
                                >
                                  {assignment.role.replace(/_/g, " ")}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Scope: {scopeLabel}
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                  {workspaceHref ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      asChild
                                    >
                                      <Link href={workspaceHref}>Open</Link>
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      No workspace
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(
                                      assignment.assignedAt,
                                    ).toLocaleDateString()}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() =>
                                      setRemoveTarget(assignment)
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Assign role dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a role</DialogTitle>
            <DialogDescription>
              Grant a user a role. If they are new, they will receive an
              invitation email to set their password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User email</Label>
              <Input
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                placeholder="user@example.com"
                type="email"
              />
            </div>
            {normalizedAssignEmail ? (
              existingGroup ? (
                <Alert>
                  <UserCheck className="h-4 w-4" />
                  <AlertTitle>Existing user</AlertTitle>
                  <AlertDescription>
                    <p>
                      This email already has {existingAssignments.length} role
                      assignment{existingAssignments.length === 1 ? "" : "s"}.
                      No invitation email will be sent.
                    </p>
                    {existingAssignments.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {existingAssignments.map((assignment) => (
                          <span
                            key={assignment.id}
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[assignment.role] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {assignment.role.replace(/_/g, " ")} ·{" "}
                            {assignment.eventName ?? "Global"}
                          </span>
                        ))}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertTitle>New user invitation</AlertTitle>
                  <AlertDescription>
                    <p>
                      An invitation email will be sent so they can set a
                      password and activate their account.
                    </p>
                    <p>The link expires in 1 hour.</p>
                  </AlertDescription>
                </Alert>
              )
            ) : null}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organizer">Organizer</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="checkin_staff">Check-in Staff</SelectItem>
                  <SelectItem value="content_editor">Content Editor</SelectItem>
                  <SelectItem value="global_admin">Global Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Users can hold multiple roles across different events.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Event Scope</Label>
              <Select value={assignEventId} onValueChange={setAssignEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select event (or Global)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">Select scope...</SelectItem>
                  <SelectItem value="_global_">
                    Global (No specific event)
                  </SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scopeError && (
                <p className="text-xs text-destructive">{scopeError}</p>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Assignment preview
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[assignRole] ?? "bg-muted text-muted-foreground"}`}
                >
                  {assignRole.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted-foreground">
                  Scope: {scopeLabel}
                </span>
              </div>
            </div>

            {assignEventId === "_global_" && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  Assigning a user without an event will make them a{" "}
                  <strong>Global Admin</strong> with full access to the system.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>
              Cancel
            </Button>
            <Button onClick={assignRoleFn} disabled={isAssigning || !canAssign}>
              {isAssigning && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Assign role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title="Remove role assignment?"
        description={
          removeTarget
            ? `Remove the ${removeTarget.role.replace(/_/g, " ")} role from ${removeTarget.email}? They will lose all associated permissions.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => removeTarget && removeRole(removeTarget)}
        variant="destructive"
      />
    </div>
  );
}
