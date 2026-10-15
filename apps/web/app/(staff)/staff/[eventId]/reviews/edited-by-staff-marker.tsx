"use client";

import { PencilLine, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { EditedFieldMarker, RemovedFieldRow } from "@/lib/review-context";
import { cn } from "@/lib/utils";

/**
 * "Edited by staff" marker shared by the review card and the applicant-info
 * panel. Shape and copy come from `getEditedFieldMarker` (lib/review-context);
 * these components only render it. Tooltips need a `TooltipProvider` above.
 */

/** Tooltips need a hover-capable pointer; touch screens get inline text. */
export function useCanHover(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}

/** Badge for the label row; the tooltip shows the original value. */
export function EditedByStaffBadge({ marker }: { marker: EditedFieldMarker }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="info"
          tabIndex={0}
          className="cursor-default tracking-normal normal-case"
        >
          <PencilLine aria-hidden="true" />
          Edited by staff
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-words [overflow-wrap:anywhere]">
        Originally submitted: {marker.tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

/** Original value under the answer, when it can't (or shouldn't) be a tooltip. */
export function EditedByStaffOriginal({
  marker,
  className,
}: {
  marker: EditedFieldMarker;
  className?: string;
}) {
  if (!marker.showOriginalInline) return null;
  return (
    <p
      className={cn(
        "text-muted-foreground mt-1 text-xs break-words [overflow-wrap:anywhere]",
        className,
      )}
    >
      Originally submitted: {marker.originalText}
    </p>
  );
}

/**
 * Answers a staff patch removed. They are no longer part of the submission
 * (nothing to open or verify), so only the label and original value show.
 */
export function RemovedByStaffFields({
  rows,
  className,
}: {
  rows: RemovedFieldRow[];
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={cn("space-y-3", className)}>
      {rows.map((row) => (
        <div key={row.key} className="opacity-80">
          <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium uppercase tracking-wider">
            <span
              className="break-words line-through [overflow-wrap:anywhere]"
              title={row.key}
            >
              {row.label}
            </span>
            <Badge
              variant="outline"
              className="cursor-default tracking-normal normal-case"
            >
              <Trash2 aria-hidden="true" />
              Removed by staff
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs break-words [overflow-wrap:anywhere]">
            Originally submitted: {row.originalText}
          </p>
        </div>
      ))}
    </div>
  );
}
