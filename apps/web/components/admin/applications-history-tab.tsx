"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState, StatusBadge } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

interface HistoryItem {
  applicationId: string;
  event: {
    id: string;
    title: string;
    slug: string;
    endAt: string | null;
    status: string;
  };
  submittedAt: string | null;
  decisionStatus: string;
  decisionPublishedAt: string | null;
  certificate: {
    credentialId: string;
    status: string;
    releasedAt: string | null;
  } | null;
  dataPurged: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function ApplicationsHistoryTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient<{ data: HistoryItem[] }>(
          `/admin/users/${userId}/applications`,
        );
        if (!cancelled) setItems(res.data ?? []);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Applications history
        </CardTitle>
        <CardDescription>
          Every event this person applied to, with decision and certificate
          status. Data may be purged for archived events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items === null && !error ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <EmptyState
            tone="error"
            title="Couldn't load history"
            description={error}
          />
        ) : items && items.length === 0 ? (
          <EmptyState
            tone="empty"
            icon={FileText}
            title="No applications yet"
            description="This person hasn't applied to any event."
          />
        ) : (
          <TooltipProvider>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 px-3 font-medium">Submitted</th>
                    <th className="py-2 px-3 font-medium">Decision</th>
                    <th className="py-2 px-3 font-medium">Certificate</th>
                    <th className="py-2 pl-3 font-medium text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items!.map((item) => (
                    <tr key={item.applicationId} className="align-top">
                      <td className="py-3 pr-3">
                        <Link
                          href={`/admin/events/${item.event.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {item.event.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{formatDate(item.event.endAt)}</span>
                          {item.event.status === "archived" && (
                            <Badge variant="outline" className="text-[10px]">
                              Archived
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 tabular-nums text-muted-foreground">
                        {formatDate(item.submittedAt)}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={item.decisionStatus} />
                        {item.decisionPublishedAt && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            published {formatDate(item.decisionPublishedAt)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {item.certificate ? (
                          <a
                            href={`/credentials/verify/${item.certificate.credentialId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Award className="h-3.5 w-3.5" />
                            {item.certificate.status === "REVOKED"
                              ? "Revoked"
                              : "Verify"}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {item.dataPurged ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 text-xs",
                                  "text-muted-foreground",
                                )}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Purged
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Files and raw answers were deleted for this event.
                              Decision status and certificate are preserved.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Check className="h-3.5 w-3.5" />
                            Kept
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
