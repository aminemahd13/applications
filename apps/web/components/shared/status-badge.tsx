import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "locked"
  | "warning"
  | "none"
  | "accepted"
  | "waitlisted"
  | "needs_revision"
  | "unlocked"
  | "confirmed"
  | "checked_in"
  | "published"
  | "archived"
  | "open"
  | "closed";

const variantMap: Record<StatusVariant, string> = {
  draft: "bg-muted text-muted-foreground border-muted",
  submitted: "bg-info/10 text-info border-info/20",
  approved: "bg-success/10 text-success border-success/20",
  accepted: "bg-success/10 text-success border-success/20",
  confirmed: "bg-success/10 text-success border-success/20",
  checked_in: "bg-success/10 text-success border-success/20",
  published: "bg-success/10 text-success border-success/20",
  open: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  closed: "bg-destructive/10 text-destructive border-destructive/20",
  locked: "bg-muted text-muted-foreground border-muted",
  archived: "bg-muted text-muted-foreground border-muted",
  warning: "bg-warning/10 text-warning border-warning/20",
  waitlisted: "bg-warning/10 text-warning border-warning/20",
  needs_revision: "bg-warning/10 text-warning border-warning/20",
  unlocked: "bg-info/10 text-info border-info/20",
  none: "bg-muted text-muted-foreground border-muted",
};

const labelMap: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  accepted: "Accepted",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  published: "Published",
  open: "Open",
  rejected: "Rejected",
  closed: "Closed",
  locked: "Locked",
  archived: "Archived",
  warning: "Warning",
  waitlisted: "Waitlisted",
  needs_revision: "Needs Revision",
  unlocked: "In Progress",
  none: "None",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

function resolveStatus(status: string): {
  normalized: StatusVariant;
  derivedLabel?: string;
} {
  const normalized = String(status ?? "").toLowerCase().replace(/[\s-]+/g, "_");

  if (normalized.startsWith("waiting_for_review_step_")) {
    return { normalized: "submitted", derivedLabel: "In Review" };
  }
  if (normalized.startsWith("waiting_for_applicant_step_")) {
    return { normalized: "unlocked", derivedLabel: "In Progress" };
  }
  if (normalized.startsWith("revision_required_step_")) {
    return { normalized: "needs_revision", derivedLabel: "Revision Required" };
  }
  if (normalized.startsWith("decision_")) {
    const isDraft = normalized.endsWith("_draft");
    const isPublished = normalized.endsWith("_published");
    const suffix = isDraft ? " (Draft)" : isPublished ? " (Published)" : "";

    if (normalized.includes("accepted")) {
      return { normalized: "accepted", derivedLabel: `Accepted${suffix}` };
    }
    if (normalized.includes("waitlisted")) {
      return { normalized: "waitlisted", derivedLabel: `Waitlisted${suffix}` };
    }
    if (normalized.includes("rejected")) {
      return { normalized: "rejected", derivedLabel: `Rejected${suffix}` };
    }
  }
  if (normalized === "all_required_steps_approved") {
    return { normalized: "approved", derivedLabel: "All Steps Approved" };
  }
  if (normalized === "blocked_rejected" || normalized === "rejected_final") {
    return { normalized: "rejected", derivedLabel: "Rejected (Step)" };
  }
  if (normalized === "rejected_resubmittable") {
    return { normalized: "needs_revision", derivedLabel: "Revision Required" };
  }
  if (normalized === "unlocked_draft" || normalized === "ready_to_submit") {
    return { normalized: "unlocked", derivedLabel: "In Progress" };
  }

  if (normalized in variantMap) {
    return { normalized: normalized as StatusVariant };
  }

  return { normalized: "none" };
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const resolved = resolveStatus(status);
  const variant = variantMap[resolved.normalized] ?? variantMap.none;
  const displayLabel =
    label ?? resolved.derivedLabel ?? labelMap[resolved.normalized] ?? status;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium capitalize border",
        variant,
        className
      )}
    >
      {displayLabel}
    </Badge>
  );
}
