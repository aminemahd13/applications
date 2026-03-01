"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Eye,
  Settings,
  Archive,
  Trash2,
  BriefcaseBusiness,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PageHeader, TableSkeleton, ConfirmDialog } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface EventRow {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  status: string;
  applicationCount: number;
  staffCount: number;
  createdAt: string;
}

interface ApiEvent {
  id: string;
  title?: string;
  name?: string;
  slug?: string;
  status?: string;
  isPublished?: boolean;
  applicationCount?: number;
  staffCount?: number;
  createdAt?: string;
}

function normalizeEventRow(event: ApiEvent): EventRow {
  const status =
    event.status?.toLowerCase() ??
    (event.isPublished ? "published" : "draft");
  return {
    id: event.id,
    name: event.title ?? event.name ?? "Untitled event",
    slug: event.slug ?? "",
    isPublished:
      event.isPublished ?? event.status?.toLowerCase() === "published",
    status,
    applicationCount: event.applicationCount ?? 0,
    staffCount: event.staffCount ?? 0,
    createdAt: event.createdAt ?? new Date().toISOString(),
  };
}

function unwrapEventListResponse(
  response: ApiEvent[] | { data?: ApiEvent[]; events?: ApiEvent[] },
): ApiEvent[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.events)) return response.events;
  return [];
}

function unwrapEventResponse(
  response: ApiEvent | { data?: ApiEvent },
): ApiEvent {
  if ("data" in response && response.data) return response.data;
  return response as ApiEvent;
}

export default function AdminEventsPage() {
  const router = useRouter();
  const { csrfToken, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (showArchived) params.set("includeArchived", "true");
        const path = params.size ? `/admin/events?${params}` : "/admin/events";
        const data = await apiClient<
          ApiEvent[] | { data?: ApiEvent[]; events?: ApiEvent[] }
        >(path);
        if (!cancelled) {
          setEvents(unwrapEventListResponse(data).map(normalizeEventRow));
        }
      } catch (err) {
        console.error("Failed to load events:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, showArchived]);

  async function createEvent() {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      const eventResponse = await apiClient<ApiEvent | { data?: ApiEvent }>(
        "/admin/events",
        {
          method: "POST",
          body: {
            title: newTitle,
            slug: newSlug || newTitle.toLowerCase().replace(/\s+/g, "-"),
          },
          csrfToken: csrfToken ?? undefined,
        },
      );
      const event = normalizeEventRow(unwrapEventResponse(eventResponse));
      setEvents((prev) => [event, ...prev]);
      setShowCreate(false);
      setNewTitle("");
      setNewSlug("");
      toast.success("Event created!");
      router.push(`/admin/events/${event.id}`);
    } catch {
      /* handled */
    } finally {
      setIsCreating(false);
    }
  }

  async function archiveEvent(id: string) {
    try {
      await apiClient(`/admin/events/${id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast.success("Event archived");
    } catch {
      /* handled */
    } finally {
      setArchiveTarget(null);
    }
  }

  async function hardDeleteEvent(id: string) {
    try {
      await apiClient(`/admin/events/${id}/hard-delete`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast.success("Event deleted permanently");
    } catch {
      /* handled */
    } finally {
      setHardDeleteTarget(null);
    }
  }

  const columns: ColumnDef<EventRow>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-3"
          >
            Name <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-sm">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              /{row.original.slug}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "isPublished",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "published"
                ? "default"
                : "secondary"
            }
          >
            {row.original.status === "archived"
              ? "Archived"
              : row.original.isPublished
                ? "Published"
                : "Draft"}
          </Badge>
        ),
      },
      {
        accessorKey: "applicationCount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-3"
          >
            Applications <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ),
      },
      {
        accessorKey: "staffCount",
        header: "Staff",
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString("en-GB")}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push(`/admin/events/${row.original.id}`)}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Open staff workspace"
              onClick={() => router.push(`/staff/${row.original.id}`)}
            >
              <BriefcaseBusiness className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                router.push(`/admin/events/${row.original.id}/settings`)
              }
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Archive event"
              onClick={(e) => {
                e.stopPropagation();
                setArchiveTarget(row.original.id);
              }}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              title="Delete permanently"
              onClick={(e) => {
                e.stopPropagation();
                setHardDeleteTarget(row.original.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [router],
  );

  const table = useReactTable({
    data: events,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Events" description="Manage all platform events">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New event
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowArchived((prev) => !prev)}
          className="gap-1.5"
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id}>
                        {h.isPlaceholder
                          ? null
                          : flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
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
                      No events found.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/admin/events/${row.original.id}`)
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {events.length} events total
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

      {/* Create event dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create event</DialogTitle>
            <DialogDescription>
              Set up a new event on the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Math Olympiad 2025"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Slug</Label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="math-olympiad-2025"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={createEvent} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(v) => !v && setArchiveTarget(null)}
        title="Archive event?"
        description="This will archive the event and hide it from the active list."
        confirmLabel="Archive"
        onConfirm={() => archiveTarget && archiveEvent(archiveTarget)}
        variant="destructive"
      />
      <ConfirmDialog
        open={!!hardDeleteTarget}
        onOpenChange={(v) => !v && setHardDeleteTarget(null)}
        title="Delete event permanently?"
        description="This will permanently delete the event and all associated data. This cannot be undone."
        confirmLabel="Delete permanently"
        onConfirm={() =>
          hardDeleteTarget && hardDeleteEvent(hardDeleteTarget)
        }
        variant="destructive"
      />
    </div>
  );
}
