"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReviewQueueStats } from "@event-platform/shared";

interface QueueStatsBarProps {
  stats: ReviewQueueStats | null;
  loading: boolean;
  scope: "any" | "me";
}

export function QueueStatsBar({ stats, loading, scope }: QueueStatsBarProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  if (loading && !stats) {
    return (
      <div className="flex flex-wrap gap-2" aria-busy="true">
        <div className="h-7 w-28 animate-pulse rounded-full bg-muted" />
        <div className="h-7 w-28 animate-pulse rounded-full bg-muted" />
        <div className="h-7 w-28 animate-pulse rounded-full bg-muted" />
        <div className="h-7 w-28 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  const totals = stats?.totals;
  const pending = totals?.pendingReview ?? 0;
  const resubmitted = totals?.resubmittedWaiting ?? 0;
  const needsInfo = totals?.needsInfoWaiting ?? 0;
  const actionable = pending + resubmitted;

  const tiles = (
    <>
      <Badge size="md" variant="info" aria-label={`${pending} pending review`}>
        <span className="font-semibold tabular-nums">{pending}</span>
        <span>pending</span>
      </Badge>
      <Badge size="md" variant="warning" aria-label={`${resubmitted} resubmitted, awaiting review`}>
        <span className="font-semibold tabular-nums">{resubmitted}</span>
        <span>resubmitted</span>
      </Badge>
      <Badge
        size="md"
        variant="warning"
        className="opacity-70"
        aria-label={`${needsInfo} awaiting applicant`}
      >
        <span className="font-semibold tabular-nums">{needsInfo}</span>
        <span>needs info</span>
      </Badge>
      <Badge
        size="md"
        variant={scope === "me" ? "success" : "secondary"}
        aria-label={`${actionable} total to review`}
      >
        <span className="font-semibold tabular-nums">{actionable}</span>
        <span>{scope === "me" ? "in your queue" : "to review"}</span>
      </Badge>
    </>
  );

  return (
    <div>
      {/* Mobile: collapsed summary by default, expand to see all tiles */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {pending}
          </span>{" "}
          pending ·{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {resubmitted}
          </span>{" "}
          resubmitted
        </p>
        <button
          type="button"
          onClick={() => setMobileExpanded((prev) => !prev)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={mobileExpanded ? "Collapse queue stats" : "Expand queue stats"}
          aria-expanded={mobileExpanded}
        >
          {mobileExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>
      <div
        className={cn(
          "mt-2 flex flex-wrap gap-2 sm:hidden",
          !mobileExpanded && "hidden",
        )}
      >
        {tiles}
      </div>
      {/* Desktop: always show all tiles in a row */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">{tiles}</div>
    </div>
  );
}
