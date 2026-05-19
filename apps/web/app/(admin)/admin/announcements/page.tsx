"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Send,
  Users,
  Plus,
  Loader2,
  Bell,
  BarChart3,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { apiClient } from "@/lib/api";
import {
  emailDeliveryProgressPercent,
  emailDeliveryStateLabel,
  normalizeMessageEmailDelivery,
  type MessageEmailDeliverySummary,
} from "@/lib/message-email-delivery";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface SentAnnouncement {
  id: string;
  title: string;
  status: string;
  recipientCount: number;
  sentAt: string;
  readCount: number;
  emailDelivery: MessageEmailDeliverySummary;
}

interface AnnouncementDetail {
  id: string;
  title: string;
  status: string;
  type: string;
  recipientCount: number;
  readCount: number;
  createdAt: string;
  bodyText: string | null;
  bodyRich: unknown;
  emailDelivery: MessageEmailDeliverySummary;
}

interface SystemFilter {
  eventsAttended?: string[];
  registeredAfter?: string;
  registeredBefore?: string;
  country?: string[];
  city?: string[];
  educationLevel?: string[];
  ageMin?: number;
  ageMax?: number;
}

function normalizeAnnouncement(raw: any): SentAnnouncement {
  const recipientCount = raw.recipientCount ?? 0;
  return {
    id: raw.id,
    title: raw.title ?? "(no subject)",
    status: raw.status ?? "SENT",
    recipientCount,
    sentAt: raw.createdAt ?? new Date().toISOString(),
    readCount: raw.readCount ?? 0,
    emailDelivery: normalizeMessageEmailDelivery(raw.emailDelivery, recipientCount),
  };
}

function normalizeAnnouncementDetail(raw: any): AnnouncementDetail {
  const recipientCount = raw.recipientCount ?? 0;
  return {
    id: raw.id,
    title: raw.title ?? "(no subject)",
    status: raw.status ?? "SENT",
    type: raw.type ?? "ANNOUNCEMENT",
    recipientCount,
    readCount: raw.readCount ?? 0,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    bodyText: typeof raw.bodyText === "string" ? raw.bodyText : null,
    bodyRich: raw.bodyRich,
    emailDelivery: normalizeMessageEmailDelivery(raw.emailDelivery, recipientCount),
  };
}

function resolveMessageBody(bodyText: unknown, bodyRich: unknown): string {
  if (typeof bodyText === "string" && bodyText.trim().length > 0) {
    return bodyText;
  }
  if (typeof bodyRich === "string" && bodyRich.trim().length > 0) {
    return bodyRich;
  }
  if (bodyRich && typeof bodyRich === "object") {
    return JSON.stringify(bodyRich, null, 2);
  }
  return "";
}

function getEmailDeliveryBadgeVariant(
  state: MessageEmailDeliverySummary["state"],
): "default" | "secondary" | "outline" | "destructive" {
  if (state === "IN_PROGRESS") return "default";
  if (state === "COMPLETED_WITH_ISSUES") return "destructive";
  if (state === "COMPLETED") return "outline";
  return "secondary";
}

function formatEmailDeliveryTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-GB");
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="flex items-center gap-2 w-full p-2.5 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        {title}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function TagInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = input.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput("");
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder ?? "Type and press Enter..."}
          className="h-8 text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={addTag} className="h-8 px-2">
          Add
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs gap-1">
              {tag}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onChange(value.filter((t) => t !== tag))}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const { csrfToken } = useAuth();

  const [announcements, setAnnouncements] = useState<SentAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [selectedAnnouncement, setSelectedAnnouncement] = useState<SentAnnouncement | null>(null);
  const [announcementDetail, setAnnouncementDetail] = useState<AnnouncementDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pendingDeleteAnnouncementId, setPendingDeleteAnnouncementId] = useState<
    string | null
  >(null);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // System filter
  const [filter, setFilter] = useState<SystemFilter>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fetchAnnouncements = useCallback(
    async (cursor?: string) => {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await apiClient<any>(`/admin/announcements${query}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      return {
        items: list.map(normalizeAnnouncement),
        nextCursor: typeof res?.nextCursor === "string" && res.nextCursor.length > 0 ? res.nextCursor : null,
      };
    },
    [],
  );

  const fetchAnnouncementDetail = useCallback(
    async (announcementId: string): Promise<AnnouncementDetail> => {
      const response = await apiClient<
        { data?: Record<string, unknown> } | Record<string, unknown>
      >(`/admin/announcements/${announcementId}`);

      const rawDetail =
        response &&
        typeof response === "object" &&
        !Array.isArray(response) &&
        "data" in response &&
        response.data &&
        typeof response.data === "object"
          ? (response.data as Record<string, unknown>)
          : (response as Record<string, unknown>);

      return normalizeAnnouncementDetail(rawDetail);
    },
    [],
  );

  const openAnnouncementDialog = useCallback(async (announcement: SentAnnouncement) => {
    setSelectedAnnouncement(announcement);
    setAnnouncementDetail(null);
    setDetailError(null);
    setIsDetailLoading(true);
    setIsDetailOpen(true);

    try {
      const detail = await fetchAnnouncementDetail(announcement.id);
      setAnnouncementDetail(detail);
      setSelectedAnnouncement((current) =>
        current && current.id === detail.id
          ? {
              ...current,
              status: detail.status,
              recipientCount: detail.recipientCount,
              readCount: detail.readCount,
              sentAt: detail.createdAt,
              emailDelivery: detail.emailDelivery,
            }
          : current,
      );
    } catch {
      setDetailError("Could not load full announcement.");
    } finally {
      setIsDetailLoading(false);
    }
  }, [fetchAnnouncementDetail]);

  useEffect(() => {
    (async () => {
      try {
        const payload = await fetchAnnouncements();
        setAnnouncements(payload.items);
        setNextCursor(payload.nextCursor);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchAnnouncements]);

  useEffect(() => {
    if (!isDetailOpen || !selectedAnnouncement?.id) return;
    if (announcementDetail?.emailDelivery.state !== "IN_PROGRESS") return;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const detail = await fetchAnnouncementDetail(selectedAnnouncement.id);
          setAnnouncementDetail(detail);
        } catch {
          /* keep current UI state on background refresh failures */
        }
      })();
    }, 12_000);

    return () => clearInterval(timer);
  }, [
    announcementDetail?.emailDelivery.state,
    fetchAnnouncementDetail,
    isDetailOpen,
    selectedAnnouncement?.id,
  ]);

  // Debounced preview
  useEffect(() => {
    if (!showCompose) {
      setPreviewCount(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoadingPreview(true);
      try {
        const res = await apiClient<{ data: { count: number } }>(
          `/admin/announcements/preview-recipients`,
          {
            method: "POST",
            body: { recipientFilter: filter },
            csrfToken: csrfToken ?? undefined,
          },
        );
        setPreviewCount(res.data?.count ?? 0);
      } catch {
        setPreviewCount(null);
      } finally {
        setIsLoadingPreview(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [filter, showCompose, csrfToken]);

  async function handleSend() {
    if (!composeSubject.trim() || !composeBody.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setIsSending(true);
    try {
      await apiClient(`/admin/announcements`, {
        method: "POST",
        body: {
          title: composeSubject,
          bodyRich: composeBody,
          bodyText: composeBody,
          recipientFilter: filter,
          sendEmail: composeSendEmail,
        },
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Announcement sent!");
      setShowCompose(false);
      setComposeSubject("");
      setComposeBody("");
      setFilter({});
      setComposeSendEmail(false);
      const refreshed = await fetchAnnouncements();
      setAnnouncements(refreshed.items);
      setNextCursor(refreshed.nextCursor);
    } catch {
      toast.error("Could not send announcement");
    } finally {
      setIsSending(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const payload = await fetchAnnouncements(nextCursor);
      setAnnouncements((current) => {
        const seen = new Set(current.map((a) => a.id));
        return [...current, ...payload.items.filter((a: SentAnnouncement) => !seen.has(a.id))];
      });
      setNextCursor(payload.nextCursor);
    } catch {
      /* handled */
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function performDeleteAnnouncement(id: string) {
    try {
      await apiClient(`/admin/announcements/${id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setAnnouncements((current) => current.filter((a) => a.id !== id));
      if (selectedAnnouncement?.id === id) {
        setIsDetailOpen(false);
      }
      toast.success("Announcement deleted");
    } catch {
      toast.error("Could not delete announcement");
    }
  }

  function deleteAnnouncement(id: string) {
    setPendingDeleteAnnouncementId(id);
  }

  const fullBody = resolveMessageBody(announcementDetail?.bodyText, announcementDetail?.bodyRich);
  const detailEmailDelivery =
    announcementDetail?.emailDelivery ??
    selectedAnnouncement?.emailDelivery ??
    normalizeMessageEmailDelivery(undefined, selectedAnnouncement?.recipientCount ?? 0);
  const detailEmailProgressPct = emailDeliveryProgressPercent(detailEmailDelivery);
  const detailLastAttemptLabel = formatEmailDeliveryTime(detailEmailDelivery.lastAttemptAt);
  const detailNextRetryLabel = formatEmailDeliveryTime(detailEmailDelivery.nextRetryAt);

  return (
    <div className="space-y-6">
      <PageHeader title="System Announcements" description="Send announcements to all platform users">
        <Button onClick={() => setShowCompose(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New announcement
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No announcements"
          description="Send your first system-wide announcement."
          actionLabel="New announcement"
          onAction={() => setShowCompose(true)}
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const readRate =
              ann.recipientCount > 0
                ? Math.round((ann.readCount / ann.recipientCount) * 100)
                : 0;
            const emailProgress = emailDeliveryProgressPercent(ann.emailDelivery);
            return (
              <Card key={ann.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{ann.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(ann.sentAt).toLocaleString("en-GB")}</span>
                        <span>|</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {ann.recipientCount} recipients
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge variant="outline" className="text-xs">
                        <BarChart3 className="mr-1 h-3 w-3" />
                        {readRate}% read
                      </Badge>
                      <Badge
                        variant={getEmailDeliveryBadgeVariant(ann.emailDelivery.state)}
                        className="text-xs"
                      >
                        {emailDeliveryStateLabel(ann.emailDelivery.state)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Email {ann.emailDelivery.sentCount}/{ann.emailDelivery.requestedCount} sent
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {ann.emailDelivery.remainingCount} left
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {emailProgress}% done
                      </Badge>
                      <Badge>System</Badge>
                      <Button variant="outline" size="sm" onClick={() => void openAnnouncementDialog(ann)}>
                        View full message
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteAnnouncement(ann.id)}
                        aria-label="Delete announcement"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Load older announcements
          </Button>
        </div>
      )}

      <Dialog
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setSelectedAnnouncement(null);
            setAnnouncementDetail(null);
            setDetailError(null);
            setIsDetailLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedAnnouncement?.title ?? "Announcement"}</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block text-xs">
                {selectedAnnouncement ? new Date(selectedAnnouncement.sentAt).toLocaleString("en-GB") : ""}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge>System</Badge>
                <Badge variant="outline" className="text-xs">
                  <BarChart3 className="mr-1 h-3 w-3" />
                  {selectedAnnouncement && selectedAnnouncement.recipientCount > 0
                    ? `${Math.round((selectedAnnouncement.readCount / selectedAnnouncement.recipientCount) * 100)}% read`
                    : "0% read"}
                </Badge>
                {announcementDetail ? (
                  <Badge variant="outline" className="text-xs">
                    {announcementDetail.status}
                  </Badge>
                ) : null}
                {selectedAnnouncement ? (
                  <Badge
                    variant={getEmailDeliveryBadgeVariant(detailEmailDelivery.state)}
                    className="text-xs"
                  >
                    Email {emailDeliveryStateLabel(detailEmailDelivery.state)}
                  </Badge>
                ) : null}
              </span>
            </DialogDescription>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading announcement...
            </div>
          ) : detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getEmailDeliveryBadgeVariant(detailEmailDelivery.state)}>
                    {emailDeliveryStateLabel(detailEmailDelivery.state)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {detailEmailDelivery.sentCount}/{detailEmailDelivery.requestedCount} sent
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {detailEmailDelivery.remainingCount} left
                  </span>
                </div>
                <Progress value={detailEmailProgressPct} />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Sent {detailEmailDelivery.sentCount}</Badge>
                  <Badge variant="outline">Left {detailEmailDelivery.remainingCount}</Badge>
                  <Badge variant="outline">Deferred {detailEmailDelivery.deferredCount}</Badge>
                  <Badge variant="outline">
                    Final failures {detailEmailDelivery.failedFinalCount}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {detailNextRetryLabel ? <span>Next retry: {detailNextRetryLabel}</span> : null}
                  {detailLastAttemptLabel ? <span>Last attempt: {detailLastAttemptLabel}</span> : null}
                  {typeof detailEmailDelivery.successRatePct === "number" ? (
                    <span>Success rate: {detailEmailDelivery.successRatePct}%</span>
                  ) : null}
                </div>
              </div>
              <div className="rounded-md border p-3 text-sm whitespace-pre-wrap break-words">
                {fullBody || "No announcement body available."}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New system announcement</DialogTitle>
            <DialogDescription>
              This announcement will be delivered to all users matching your filters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* System-level audience filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Audience filters</Label>
                {previewCount !== null && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {isLoadingPreview ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Users className="h-3 w-3" />
                    )}
                    {isLoadingPreview ? "Counting..." : `${previewCount} recipient(s)`}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Leave all filters empty to target every user on the platform.
              </p>

              <CollapsibleSection title="Registration date">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Registered after</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={filter.registeredAfter ?? ""}
                      onChange={(e) =>
                        setFilter((f) => ({
                          ...f,
                          registeredAfter: e.target.value || undefined,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Registered before</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={filter.registeredBefore ?? ""}
                      onChange={(e) =>
                        setFilter((f) => ({
                          ...f,
                          registeredBefore: e.target.value || undefined,
                        }))
                      }
                    />
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Demographics">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Min age</Label>
                      <Input
                        type="number"
                        min={0}
                        max={150}
                        className="h-8 text-xs"
                        value={filter.ageMin ?? ""}
                        onChange={(e) =>
                          setFilter((f) => ({
                            ...f,
                            ageMin: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                        placeholder="e.g. 18"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max age</Label>
                      <Input
                        type="number"
                        min={0}
                        max={150}
                        className="h-8 text-xs"
                        value={filter.ageMax ?? ""}
                        onChange={(e) =>
                          setFilter((f) => ({
                            ...f,
                            ageMax: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                        placeholder="e.g. 30"
                      />
                    </div>
                  </div>
                  <TagInput
                    label="Country"
                    value={filter.country ?? []}
                    onChange={(tags) =>
                      setFilter((f) => ({ ...f, country: tags.length > 0 ? tags : undefined }))
                    }
                  />
                  <TagInput
                    label="City"
                    value={filter.city ?? []}
                    onChange={(tags) =>
                      setFilter((f) => ({ ...f, city: tags.length > 0 ? tags : undefined }))
                    }
                  />
                  <TagInput
                    label="Education level"
                    value={filter.educationLevel ?? []}
                    onChange={(tags) =>
                      setFilter((f) => ({
                        ...f,
                        educationLevel: tags.length > 0 ? tags : undefined,
                      }))
                    }
                  />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Event participation">
                <TagInput
                  label="Attended events (paste event IDs)"
                  value={filter.eventsAttended ?? []}
                  onChange={(tags) =>
                    setFilter((f) => ({
                      ...f,
                      eventsAttended: tags.length > 0 ? tags : undefined,
                    }))
                  }
                  placeholder="Paste event UUID..."
                />
              </CollapsibleSection>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Subject</Label>
              <Input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Announcement subject..."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Body</Label>
              <Textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Write your announcement..."
                rows={6}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={composeSendEmail}
                onCheckedChange={setComposeSendEmail}
                id="admin-send-email"
              />
              <Label htmlFor="admin-send-email" className="text-sm">
                Also send via email
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send announcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDeleteAnnouncementId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteAnnouncementId(null);
        }}
        title="Delete this announcement?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          const id = pendingDeleteAnnouncementId;
          setPendingDeleteAnnouncementId(null);
          if (id) void performDeleteAnnouncement(id);
        }}
      />
    </div>
  );
}
