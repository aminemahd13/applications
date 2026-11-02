import type {
  BulkStepActionResult,
  BulkStepActionType,
} from "@event-platform/shared";

/**
 * Which permissions each bulk step action needs (mirrors the API rule):
 * approving is a review decision, opening/locking an override, and undoing or
 * overriding decisions needs both (organizers and admins by default).
 */
export type BulkStepActionPermission = "review" | "override" | "review+override";

export interface BulkStepActionOption {
  value: BulkStepActionType;
  label: string;
  description: string;
  permission: BulkStepActionPermission;
}

export const BULK_STEP_ACTION_OPTIONS: BulkStepActionOption[] = [
  {
    value: "APPROVE",
    label: "Approve",
    description: "Approve the step, whatever its current status.",
    permission: "review",
  },
  {
    value: "UNAPPROVE",
    label: "Unapprove",
    description:
      "Undo an approval: back to “Submitted” (awaiting review again). Steps without review, or with nothing submitted, go back to open for editing.",
    permission: "review+override",
  },
  {
    value: "REJECT",
    label: "Reject",
    description:
      "Reject the step (final). Later steps not submitted yet get locked; submitted or approved ones keep their status.",
    permission: "review+override",
  },
  {
    value: "UNREJECT",
    label: "Un-reject",
    description:
      "Undo a rejection: back to “Submitted” (awaiting review again). Steps without review, or with nothing submitted, go back to open for editing.",
    permission: "review+override",
  },
  {
    value: "REQUEST_REVISION",
    label: "Request revision",
    description:
      "Send the step back to the applicant to update and resubmit (only applicants who submitted it).",
    permission: "review+override",
  },
  {
    value: "UNLOCK",
    label: "Open for editing",
    description: "Open the step so the applicant can fill it in or edit it.",
    permission: "override",
  },
  {
    value: "LOCK",
    label: "Lock",
    description: "Lock the step so the applicant can no longer see or edit it.",
    permission: "override",
  },
  {
    value: "SUBMITTED",
    label: "Mark as submitted",
    description:
      "Set the step back to “Submitted” (awaiting review) for applicants who submitted it. Only for steps that are reviewed.",
    permission: "review+override",
  },
];

export function allowedBulkStepActions(permissions: {
  canReview: boolean;
  canOverride: boolean;
}): BulkStepActionOption[] {
  return BULK_STEP_ACTION_OPTIONS.filter((option) => {
    if (option.permission === "review") return permissions.canReview;
    if (option.permission === "override") return permissions.canOverride;
    return permissions.canReview && permissions.canOverride;
  });
}

export function getBulkStepActionOption(
  action: BulkStepActionType,
): BulkStepActionOption | undefined {
  return BULK_STEP_ACTION_OPTIONS.find((option) => option.value === action);
}

export type BulkStepActionSummary = BulkStepActionResult;

export interface BulkStepTarget {
  id: string;
  stepIndex: number;
  category?: string;
  reviewRequired?: boolean;
}

/**
 * What staff should know before applying: check-in tickets that will be
 * issued or cancelled, and steps without review. Null when nothing applies.
 */
export function bulkStepActionWarning(
  action: BulkStepActionType,
  step: BulkStepTarget | undefined,
  steps: BulkStepTarget[],
): string | null {
  if (!step) return null;
  const keptCheckedIn = "People already checked in are not affected.";
  if (step.category === "CONFIRMATION") {
    if (action === "APPROVE") {
      return "Attendance confirmation step: approving also confirms attendance and issues check-in tickets.";
    }
    if (action === "REJECT") {
      return `Attendance confirmation step: rejecting cancels check-in tickets. ${keptCheckedIn}`;
    }
    if (action !== "UNREJECT") {
      return `Attendance confirmation step: for applicants whose confirmation is approved, this cancels their check-in ticket. ${keptCheckedIn}`;
    }
  }
  const beforeConfirmation = steps.some(
    (other) => other.category === "CONFIRMATION" && other.stepIndex > step.stepIndex,
  );
  if (beforeConfirmation && action === "REJECT") {
    return `This step comes before the attendance confirmation: rejecting it also cancels check-in tickets. ${keptCheckedIn}`;
  }
  if (beforeConfirmation && action === "UNREJECT") {
    return "Applicants whose attendance confirmation is approved get a new check-in ticket.";
  }
  if (step.reviewRequired === false) {
    if (action === "SUBMITTED") {
      return "This step has no review, so every applicant will be skipped: use Approve or Open for editing.";
    }
    if (action === "UNAPPROVE" || action === "UNREJECT") {
      return "This step has no review: it goes back to open for editing, and is approved again when the applicant resubmits.";
    }
  }
  return null;
}

export function emptyBulkStepActionSummary(): BulkStepActionSummary {
  return { updated: 0, skipped: 0, skippedDetails: [], notes: [] };
}

/** Adds one chunk's API result (older APIs may omit the detail arrays). */
export function addBulkStepActionChunk(
  summary: BulkStepActionSummary,
  chunk: unknown,
): void {
  const data =
    chunk && typeof chunk === "object" && "data" in chunk
      ? (chunk as { data?: unknown }).data
      : undefined;
  if (!data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  summary.updated += Number(record.updated ?? 0) || 0;
  summary.skipped += Number(record.skipped ?? 0) || 0;
  if (Array.isArray(record.skippedDetails)) {
    for (const item of record.skippedDetails) {
      if (item && typeof item === "object" && typeof item.applicationId === "string") {
        summary.skippedDetails.push({
          applicationId: item.applicationId,
          reason: typeof item.reason === "string" ? item.reason : "Skipped",
        });
      }
    }
  }
  if (Array.isArray(record.notes)) {
    for (const item of record.notes) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.applicationId === "string" &&
        typeof item.note === "string"
      ) {
        summary.notes.push({ applicationId: item.applicationId, note: item.note });
      }
    }
  }
}

export interface GroupedOutcome {
  message: string;
  applicationIds: string[];
}

/** Groups skip reasons (or notes) by message, largest group first. */
export function groupBulkOutcomes(
  items: Array<{ applicationId: string; message: string }>,
): GroupedOutcome[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const list = groups.get(item.message) ?? [];
    list.push(item.applicationId);
    groups.set(item.message, list);
  }
  return Array.from(groups.entries())
    .map(([message, applicationIds]) => ({ message, applicationIds }))
    .sort((a, b) => b.applicationIds.length - a.applicationIds.length);
}

/**
 * A `datetime-local` input value (the staff member's local time) as an ISO
 * instant for the API; undefined when empty or not a valid date.
 */
export function revisionDeadlineToIso(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
