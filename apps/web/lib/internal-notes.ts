import type { ReviewContextNote } from "@event-platform/shared";

export type NoteDeletionMode = "single" | "clear";

export interface NoteDeletionOutcome {
  /** Toast kind: success when something was deleted, info when nothing was. */
  kind: "success" | "info";
  message: string;
}

function pluralizeNotes(count: number): string {
  return `${count} ${count === 1 ? "note" : "notes"}`;
}

/**
 * Toast for a DELETE internal-notes response. Deletes are idempotent: a note
 * someone else already removed is reported, not treated as an error. For
 * "Clear all", notes added after the page loaded are kept and called out.
 */
export function describeNoteDeletion(input: {
  mode: NoteDeletionMode;
  removed: number;
  missing: number;
  /** Notes left after the delete. */
  remaining: number;
}): NoteDeletionOutcome {
  const removed = Math.max(0, input.removed);
  const missing = Math.max(0, input.missing);
  const remaining = Math.max(0, input.remaining);

  if (input.mode === "single") {
    return removed > 0
      ? { kind: "success", message: "Note deleted" }
      : { kind: "info", message: "That note was already removed" };
  }

  const parts: string[] = [];
  if (removed > 0) {
    parts.push(`Cleared ${pluralizeNotes(removed)}`);
  } else if (missing > 0) {
    parts.push("These notes were already removed");
  } else {
    parts.push("No notes to clear");
  }
  if (remaining > 0) {
    parts.push(
      `${pluralizeNotes(remaining)} added since you loaded the page ${
        remaining === 1 ? "was" : "were"
      } kept`,
    );
  }

  return {
    kind: removed > 0 ? "success" : "info",
    message: parts.join(". "),
  };
}

/**
 * Notes array from a POST/DELETE internal-notes response (`{ data: { notes } }`),
 * or null when the response does not carry one.
 */
export function notesFromResponse(response: unknown): ReviewContextNote[] | null {
  if (!response || typeof response !== "object") return null;
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const notes = (data as { notes?: unknown }).notes;
  return Array.isArray(notes) ? (notes as ReviewContextNote[]) : null;
}
