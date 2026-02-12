"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBasePath } from "@/hooks/use-event-base-path";
import {
  Search,
  Download,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  PageHeader,
  StatusBadge,
  TableSkeleton,
  ConfirmDialog,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { resolvePublicApiBaseUrl } from "@/lib/public-api-url";
import { toast } from "sonner";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { Permission } from "@event-platform/shared";

const PUBLIC_API_URL = resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

interface Application {
  id: string;
  applicantName: string;
  applicantEmail: string;
  status: string;
  currentStep: string;
  submittedAt?: string;
  tags: string[];
  decision?: string;
}

type StatusFilterValue =
  | "all"
  | "waiting_applicant"
  | "waiting_review"
  | "revision_required"
  | "all_required_steps_approved"
  | "accepted"
  | "waitlisted"
  | "confirmed"
  | "rejected";

function matchesStatusFilter(status: string, filter: StatusFilterValue): boolean {
  if (filter === "all") return true;

  const normalized = String(status ?? "").toUpperCase();
  switch (filter) {
    case "waiting_applicant":
      return normalized.startsWith("WAITING_FOR_APPLICANT_STEP_");
    case "waiting_review":
      return (
        normalized.startsWith("WAITING_FOR_REVIEW_STEP_") ||
        normalized === "IN_REVIEW"
      );
    case "revision_required":
      return (
        normalized.startsWith("REVISION_REQUIRED_STEP_") ||
        normalized === "NEEDS_REVISION"
      );
    case "all_required_steps_approved":
      return normalized === "ALL_REQUIRED_STEPS_APPROVED";
    case "accepted":
      return (
        normalized === "ACCEPTED" || normalized.startsWith("DECISION_ACCEPTED")
      );
    case "waitlisted":
      return (
        normalized === "WAITLISTED" ||
        normalized.startsWith("DECISION_WAITLISTED")
      );
    case "confirmed":
      return normalized === "CONFIRMED";
    case "rejected":
      return (
        normalized === "BLOCKED_REJECTED" ||
        normalized === "REJECTED" ||
        normalized === "REJECTED_FINAL" ||
        normalized.startsWith("DECISION_REJECTED")
      );
    default:
      return false;
  }
}

/** Normalise an API ApplicationSummary → frontend Application */
function normalizeApplication(raw: Record<string, unknown>): Application {
  const ss = raw.stepsSummary as { total?: number; completed?: number } | undefined;
  return {
    id: raw.id as string,
    applicantName: (raw.applicantName ?? raw.applicantEmail ?? "Unknown") as string,
    applicantEmail: (raw.applicantEmail ?? "") as string,
    status: (raw.derivedStatus ?? raw.status ?? "UNKNOWN") as string,
    currentStep: ss
      ? `${ss.completed ?? 0}/${ss.total ?? 0} steps`
      : (raw.currentStep ?? "") as string,
    submittedAt: (raw.createdAt ?? raw.submittedAt) as string | undefined,
    tags: (raw.tags ?? []) as string[],
    decision: (raw.decisionStatus ?? raw.decision) as string | undefined,
  };
}

function filenameFromContentDisposition(
  contentDisposition: string | null,
  fallback: string
): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return fallback;
}

export default function ApplicationsListPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const basePath = useEventBasePath();
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canDeleteApplications = hasPermission(Permission.EVENT_APPLICATION_DELETE);

  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<
          | Application[]
          | { data: Array<Record<string, unknown>>; meta?: unknown }
        >(`/events/${eventId}/applications`);
        const raw = Array.isArray(res)
          ? (res as unknown as Array<Record<string, unknown>>)
          : Array.isArray((res as any).data)
            ? (res as any).data
            : [];
        setApplications(raw.map(normalizeApplication));
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [eventId]);

  const filteredData = useMemo(
    () => applications.filter((a) => matchesStatusFilter(a.status, statusFilter)),
    [applications, statusFilter]
  );

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch(
        `${PUBLIC_API_URL}/events/${eventId}/applications/export`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromContentDisposition(
        res.headers.get("content-disposition"),
        `applications-${eventId}.csv`
      );
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Applications CSV downloaded.");
    } catch {
      toast.error("Could not export applications.");
    } finally {
      setIsExporting(false);
    }
  }

  async function deleteApplication() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await apiClient(`/events/${eventId}/applications/${deleteTarget.id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setApplications((prev) =>
        prev.filter((application) => application.id !== deleteTarget.id)
      );
      toast.success("Application deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Could not delete application");
    } finally {
      setIsDeleting(false);
    }
  }

  const columns: ColumnDef<Application>[] = useMemo(
    () => [
      {
        accessorKey: "applicantName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-3"
          >
            Applicant
            <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-sm">{row.original.applicantName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.applicantEmail}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "currentStep",
        header: "Current Step",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.currentStep}
          </span>
        ),
      },
      {
        accessorKey: "decision",
        header: "Decision",
        cell: ({ row }) =>
          row.original.decision ? (
            <StatusBadge status={row.original.decision} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "submittedAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-3"
          >
            Submitted
            <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) =>
          row.original.submittedAt ? (
            <span className="text-sm text-muted-foreground">
              {new Date(row.original.submittedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                router.push(`${basePath}/applications/${row.original.id}`);
              }}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              View
            </Button>
            {canDeleteApplications && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteTarget(row.original);
                }}
                disabled={isDeleting && deleteTarget?.id === row.original.id}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        ),
      },
    ],
    [
      basePath,
      canDeleteApplications,
      deleteTarget?.id,
      isDeleting,
      router,
    ]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description={`${applications.length} total applications`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilterValue)}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="waiting_applicant">Waiting for applicant</SelectItem>
            <SelectItem value="waiting_review">Waiting for review</SelectItem>
            <SelectItem value="revision_required">Revision required</SelectItem>
            <SelectItem value="all_required_steps_approved">
              All steps approved
            </SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="waitlisted">Waitlisted</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center py-12 text-muted-foreground"
                    >
                      No applications found.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(
                          `${basePath}/applications/${row.original.id}`
                        )
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {filteredData.length}{" "}
          applications
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete application?"
        description={
          deleteTarget
            ? `This will permanently delete ${deleteTarget.applicantName || deleteTarget.applicantEmail}'s application and related submissions.`
            : "This action cannot be undone."
        }
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        variant="destructive"
        onConfirm={deleteApplication}
      />
    </div>
  );
}
