"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScrollText,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  User,
  Calendar,
  Globe,
  FileText,
  Shield,
  Settings,
  Trash2,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader, EmptyState, TableSkeleton, ConfirmDialog } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

const ACTION_ICONS: Record<string, typeof User> = {
  auth: Shield,
  event: Calendar,
  application: FileText,
  user: User,
  settings: Settings,
  role: Shield,
  default: Globe,
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-500",
  update: "bg-blue-500",
  delete: "bg-red-500",
  login: "bg-primary",
  logout: "bg-muted-foreground",
  assign: "bg-purple-500",
  revoke: "bg-amber-500",
  default: "bg-muted-foreground",
};

interface AuditEntry {
  id: string;
  action: string;
  category?: string;
  actorEmail: string;
  actorName?: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

interface AuditResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  const { csrfToken } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearingAudit, setIsClearingAudit] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const data = await apiClient<AuditResponse>(`/admin/audit?${params}`);
      setEntries(data.data);
      setTotal(data.total);
    } catch {
      /* handled */
    } finally {
      setIsLoading(false);
    }
  }, [page, search, categoryFilter]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  async function clearAuditLog() {
    setIsClearingAudit(true);
    try {
      const result = await apiClient<{ deletedCount?: number }>("/admin/audit", {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      const deletedCount =
        typeof result?.deletedCount === "number" ? result.deletedCount : 0;
      toast.success(`Deleted ${deletedCount} audit entries`);
      setEntries([]);
      setTotal(0);
      setPage(1);
      setExpandedId(null);
    } catch {
      /* handled */
    } finally {
      setIsClearingAudit(false);
      setShowClearConfirm(false);
    }
  }

  function getActionColor(action: string) {
    const key = Object.keys(ACTION_COLORS).find((k) =>
      action.toLowerCase().includes(k),
    );
    return key ? ACTION_COLORS[key] : ACTION_COLORS.default;
  }

  function getCategoryIcon(category?: string) {
    const Icon = category
      ? ACTION_ICONS[category] ?? ACTION_ICONS.default
      : ACTION_ICONS.default;
    return Icon;
  }

  function formatTimeAgo(dateStr: string) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString("en-GB");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Track all system activity and changes"
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search actions or usersâ€¦"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="auth">Authentication</SelectItem>
            <SelectItem value="event">Events</SelectItem>
            <SelectItem value="application">Applications</SelectItem>
            <SelectItem value="user">Users</SelectItem>
            <SelectItem value="role">Roles</SelectItem>
            <SelectItem value="settings">Settings</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchAudit} className="sm:ml-auto">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowClearConfirm(true)}
          disabled={isClearingAudit || total === 0}
        >
          {isClearingAudit ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          Delete all logs
        </Button>
      </div>

      {/* Log entries */}
      {isLoading ? (
        <TableSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          description={search || categoryFilter !== "all" ? "Try different filters." : "System activity will appear here as users interact with the platform."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[65vh] overflow-y-auto">
              <div className="divide-y">
                {entries.map((entry, idx) => {
                  const Icon = getCategoryIcon(entry.category);
                  const isExpanded = expandedId === entry.id;

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="group"
                    >
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Action indicator */}
                          <div className="flex flex-col items-center gap-1 pt-0.5">
                            <div
                              className={`h-2.5 w-2.5 rounded-full ${getActionColor(entry.action)}`}
                            />
                            {idx < entries.length - 1 && (
                              <div className="w-px flex-1 bg-border" />
                            )}
                          </div>

                          {/* Icon */}
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">
                                {entry.actorName ?? entry.actorEmail}
                              </p>
                              <span className="text-sm text-muted-foreground">
                                {entry.action}
                              </span>
                            </div>
                            {entry.details && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {entry.details}
                              </p>
                            )}
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-2 shrink-0">
                            {entry.targetType && (
                              <Badge variant="secondary" className="text-[10px]">
                                {entry.targetType}
                              </Badge>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatTimeAgo(entry.createdAt)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {new Date(entry.createdAt).toLocaleString("en-GB")}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </button>

                      {/* Expanded details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 pl-[4.25rem]">
                              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
                                <div className="grid gap-1.5 sm:grid-cols-2">
                                  <div>
                                    <span className="text-muted-foreground">Actor: </span>
                                    <span className="font-medium">{entry.actorEmail}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Time: </span>
                                    <span className="font-medium">
                                      {new Date(entry.createdAt).toLocaleString("en-GB")}
                                    </span>
                                  </div>
                                  {entry.ip && (
                                    <div>
                                      <span className="text-muted-foreground">IP: </span>
                                      <span className="font-mono">{entry.ip}</span>
                                    </div>
                                  )}
                                  {entry.targetId && (
                                    <div>
                                      <span className="text-muted-foreground">Target ID: </span>
                                      <span className="font-mono text-[10px]">{entry.targetId}</span>
                                    </div>
                                  )}
                                </div>
                                {entry.details && (
                                  <>
                                    <Separator />
                                    <p className="text-muted-foreground">{entry.details}</p>
                                  </>
                                )}
                                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                  <>
                                    <Separator />
                                    <pre className="rounded bg-background p-2 text-[10px] font-mono overflow-x-auto">
                                      {JSON.stringify(entry.metadata, null, 2)}
                                    </pre>
                                  </>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t p-4">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}â€“{Math.min(page * PAGE_SIZE, total)} of {total} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Delete all audit logs?"
        description="This permanently removes all audit entries and cannot be undone."
        confirmLabel="Delete all"
        onConfirm={clearAuditLog}
        variant="destructive"
      />
    </div>
  );
}
