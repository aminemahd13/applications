"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Send,
  Users,
  User,
  Plus,
  Loader2,
  Mail,
  Bell,
  BarChart3,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  PageHeader,
  EmptyState,
  CardSkeleton,
  AudienceBuilder,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import {
  emailDeliveryProgressPercent,
  emailDeliveryStateLabel,
  normalizeMessageEmailDelivery,
  type MessageEmailDeliverySummary,
} from "@/lib/message-email-delivery";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { Permission } from "@event-platform/shared";
import type { RecipientFilter } from "@event-platform/shared";
import type { ResolveApplicationsByEmailsResult } from "@event-platform/shared";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MAX_PASTED_EMAILS, parsePastedEmails } from "@/lib/pasted-emails";

interface SentMessage {
  id: string;
  subject: string;
  type: "ANNOUNCEMENT" | "DIRECT";
  status: string;
  recipientCount: number;
  sentAt: string;
  readCount: number;
  emailDelivery: MessageEmailDeliverySummary;
}

interface MessageDetail {
  id: string;
  subject: string;
  type: "ANNOUNCEMENT" | "DIRECT";
  status: string;
  recipientCount: number;
  readCount: number;
  createdAt: string;
  bodyText: string | null;
  bodyRich: unknown;
  emailDelivery: MessageEmailDeliverySummary;
}

function normalizeMessage(raw: any): SentMessage {
  const recipientCount = raw.recipientCount ?? 0;
  return {
    id: raw.id,
    subject: raw.title ?? raw.subject ?? "(no subject)",
    type: raw.type ?? "ANNOUNCEMENT",
    status: raw.status ?? "SENT",
    recipientCount,
    sentAt: raw.createdAt ?? raw.sentAt ?? new Date().toISOString(),
    readCount: raw.readCount ?? 0,
    emailDelivery: normalizeMessageEmailDelivery(raw.emailDelivery, recipientCount),
  };
}

function normalizeMessageDetail(raw: any): MessageDetail {
  const recipientCount = raw.recipientCount ?? 0;
  return {
    id: raw.id,
    subject: raw.title ?? raw.subject ?? "(no subject)",
    type: raw.type ?? "ANNOUNCEMENT",
    status: raw.status ?? "SENT",
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

function unpackMessagesPayload(raw: any): {
  items: SentMessage[];
  nextCursor: string | null;
} {
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : [];
  const parsedNextCursor =
    typeof raw?.nextCursor === "string" && raw.nextCursor.length > 0
      ? raw.nextCursor
      : null;

  return {
    items: list.map(normalizeMessage),
    nextCursor: parsedNextCursor,
  };
}

export default function MessagesPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canDeleteMessages = hasPermission(Permission.EVENT_APPLICATION_DELETE);

  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<SentMessage | null>(null);
  const [messageDetail, setMessageDetail] = useState<MessageDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Compose dialog
  const [showCompose, setShowCompose] = useState(false);
  const [composeType, setComposeType] = useState<"ANNOUNCEMENT" | "DIRECT">("ANNOUNCEMENT");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeDirectRecipientsText, setComposeDirectRecipientsText] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const parsedDirectRecipients = useMemo(
    () => parsePastedEmails(composeDirectRecipientsText),
    [composeDirectRecipientsText],
  );

  const fetchMessages = useCallback(async (
    cursor?: string
  ): Promise<{ items: SentMessage[]; nextCursor: string | null }> => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await apiClient<any>(`/events/${eventId}/messages${query}`);
    return unpackMessagesPayload(res);
  }, [eventId]);

  const fetchMessageDetail = useCallback(
    async (messageId: string): Promise<MessageDetail> => {
      const response = await apiClient<
        { data?: Record<string, unknown> } | Record<string, unknown>
      >(`/events/${eventId}/messages/${messageId}`);

      const rawDetail =
        response &&
        typeof response === "object" &&
        !Array.isArray(response) &&
        "data" in response &&
        response.data &&
        typeof response.data === "object"
          ? (response.data as Record<string, unknown>)
          : (response as Record<string, unknown>);

      return normalizeMessageDetail(rawDetail);
    },
    [eventId],
  );

  const openMessageDialog = useCallback(
    async (message: SentMessage) => {
      setSelectedMessage(message);
      setMessageDetail(null);
      setDetailError(null);
      setIsDetailLoading(true);
      setIsDetailOpen(true);

      try {
        const detail = await fetchMessageDetail(message.id);
        setMessageDetail(detail);
        setSelectedMessage((current) =>
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
        setDetailError("Could not load full message.");
      } finally {
        setIsDetailLoading(false);
      }
    },
    [fetchMessageDetail]
  );

  useEffect(() => {
    (async () => {
      try {
        const payload = await fetchMessages();
        setMessages(payload.items);
        setNextCursor(payload.nextCursor);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchMessages]);

  useEffect(() => {
    if (!isDetailOpen || !selectedMessage?.id) return;
    if (messageDetail?.emailDelivery.state !== "IN_PROGRESS") return;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const latestDetail = await fetchMessageDetail(selectedMessage.id);
          setMessageDetail(latestDetail);
        } catch {
          /* keep current UI state on background refresh failures */
        }
      })();
    }, 12_000);

    return () => clearInterval(timer);
  }, [
    fetchMessageDetail,
    isDetailOpen,
    messageDetail?.emailDelivery.state,
    selectedMessage?.id,
  ]);

  // Debounced recipient preview for announcements
  useEffect(() => {
    if (!showCompose || composeType !== "ANNOUNCEMENT") {
      setPreviewCount(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoadingPreview(true);
      try {
        const res = await apiClient<{ data: { count: number } }>(
          `/events/${eventId}/messages/preview-recipients`,
          {
            method: "POST",
            body: { recipientFilter },
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
  }, [recipientFilter, showCompose, composeType, eventId, csrfToken]);

  async function handleSend() {
    if (!composeSubject.trim() || !composeBody.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    if (composeType === "DIRECT" && parsedDirectRecipients.emails.length === 0) {
      toast.error("Paste at least one valid recipient email.");
      return;
    }

    setIsSending(true);
    let directResolution: ResolveApplicationsByEmailsResult | null = null;
    try {
      const payload: Record<string, unknown> = {
        title: composeSubject,
        bodyRich: composeBody,
        bodyText: composeBody,
        sendEmail: composeSendEmail,
      };

      if (composeType === "DIRECT") {
        const resolved = await apiClient<{ data?: ResolveApplicationsByEmailsResult }>(
          `/events/${eventId}/applications/resolve-by-emails`,
          {
            method: "POST",
            body: { emails: parsedDirectRecipients.emails },
            csrfToken: csrfToken ?? undefined,
          },
        );
        directResolution = resolved.data ?? {
          applicationIds: [],
          userIds: [],
          matchedEmails: [],
          unmatchedEmails: [],
        };
        if (directResolution.userIds.length === 0) {
          toast.error("No event applicants matched the pasted emails.");
          return;
        }

        payload.explicitUserIds = directResolution.userIds;
        payload.recipientFilter = {
          emails: directResolution.matchedEmails,
        };
      } else {
        // Use the full audience builder filter for announcements
        payload.recipientFilter = recipientFilter;
      }

      await apiClient(`/events/${eventId}/messages`, {
        method: "POST",
        body: payload,
        csrfToken: csrfToken ?? undefined,
      });

      if (composeType === "DIRECT") {
        const matchedCount = directResolution?.userIds.length ?? 0;
        const unmatchedCount = directResolution?.unmatchedEmails.length ?? 0;
        const invalidCount = parsedDirectRecipients.invalidTokens.length;
        toast.success(`Message sent to ${matchedCount} matched recipient(s).`);
        if (
          unmatchedCount > 0 ||
          invalidCount > 0 ||
          parsedDirectRecipients.overLimit
        ) {
          const limitNote = parsedDirectRecipients.overLimit
            ? `limit ${MAX_PASTED_EMAILS} reached`
            : null;
          toast.info(
            [
              `${unmatchedCount} unmatched`,
              `${invalidCount} invalid`,
              limitNote,
            ]
              .filter((part): part is string => Boolean(part))
              .join(", "),
          );
        }
      } else {
        toast.success("Message sent!");
      }

      setShowCompose(false);
      setComposeSubject("");
      setComposeBody("");
      setComposeDirectRecipientsText("");
      setRecipientFilter({});
      setComposeSendEmail(false);
      // Refresh
      const refreshed = await fetchMessages();
      setMessages(refreshed.items);
      setNextCursor(refreshed.nextCursor);
    } catch {
      /* handled */
    } finally {
      setIsSending(false);
    }
  }

  async function loadMoreMessages() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const payload = await fetchMessages(nextCursor);
      setMessages((current) => {
        const seen = new Set(current.map((message) => message.id));
        const appended = payload.items.filter((message) => !seen.has(message.id));
        return [...current, ...appended];
      });
      setNextCursor(payload.nextCursor);
    } catch {
      /* handled */
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!canDeleteMessages) return;
    if (!window.confirm("Delete this message? This action cannot be undone.")) {
      return;
    }

    try {
      await apiClient(`/events/${eventId}/messages/${messageId}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setMessages((current) =>
        current.filter((message) => message.id !== messageId)
      );
      if (selectedMessage?.id === messageId) {
        setIsDetailOpen(false);
      }
      toast.success("Message deleted");
    } catch {
      /* handled */
    }
  }

  const announcements = messages.filter((m) => m.type === "ANNOUNCEMENT");
  const direct = messages.filter((m) => m.type === "DIRECT");

  const fullBody = resolveMessageBody(messageDetail?.bodyText, messageDetail?.bodyRich);
  const detailEmailDelivery =
    messageDetail?.emailDelivery ??
    selectedMessage?.emailDelivery ??
    normalizeMessageEmailDelivery(undefined, selectedMessage?.recipientCount ?? 0);
  const detailEmailProgressPct = emailDeliveryProgressPercent(detailEmailDelivery);
  const detailLastAttemptLabel = formatEmailDeliveryTime(detailEmailDelivery.lastAttemptAt);
  const detailNextRetryLabel = formatEmailDeliveryTime(detailEmailDelivery.nextRetryAt);

  return (
    <>
      <div className="space-y-6">
        <PageHeader title="Messages" description="Send announcements and direct messages to applicants">
          <Button onClick={() => setShowCompose(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Compose
          </Button>
        </PageHeader>

        <Tabs defaultValue="announcements">
          <TabsList>
            <TabsTrigger value="announcements">
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              Announcements
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1">
                {announcements.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="direct">
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Direct
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1">
                {direct.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="space-y-3 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              <TabsContent value="announcements" className="mt-4">
                {announcements.length === 0 ? (
                  <EmptyState
                    icon={Bell}
                    title="No announcements"
                    description="Send your first announcement to all applicants."
                    actionLabel="Compose"
                    onAction={() => {
                      setComposeType("ANNOUNCEMENT");
                      setShowCompose(true);
                    }}
                  />
                ) : (
                  <div className="space-y-3">
                    {announcements.map((msg) => (
                      <MessageCard
                        key={msg.id}
                        message={msg}
                        canDelete={canDeleteMessages}
                        onDelete={deleteMessage}
                        onView={openMessageDialog}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="direct" className="mt-4">
                {direct.length === 0 ? (
                  <EmptyState
                    icon={Mail}
                    title="No direct messages"
                    description="Send a message to a specific applicant."
                    actionLabel="Compose"
                    onAction={() => {
                      setComposeType("DIRECT");
                      setShowCompose(true);
                    }}
                  />
                ) : (
                  <div className="space-y-3">
                    {direct.map((msg) => (
                      <MessageCard
                        key={msg.id}
                        message={msg}
                        canDelete={canDeleteMessages}
                        onDelete={deleteMessage}
                        onView={openMessageDialog}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>

        {!isLoading && nextCursor && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Load older messages
            </Button>
          </div>
        )}

        <Dialog
          open={isDetailOpen}
          onOpenChange={(open) => {
            setIsDetailOpen(open);
            if (!open) {
              setSelectedMessage(null);
              setMessageDetail(null);
              setDetailError(null);
              setIsDetailLoading(false);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedMessage?.subject ?? "Message"}</DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block text-xs">
                  {selectedMessage ? new Date(selectedMessage.sentAt).toLocaleString("en-GB") : ""}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {selectedMessage ? (
                    <Badge variant={selectedMessage.type === "ANNOUNCEMENT" ? "default" : "secondary"}>
                      {selectedMessage.type === "ANNOUNCEMENT" ? "Announcement" : "Direct"}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-xs">
                    <BarChart3 className="mr-1 h-3 w-3" />
                    {selectedMessage && selectedMessage.recipientCount > 0
                      ? `${Math.round((selectedMessage.readCount / selectedMessage.recipientCount) * 100)}% read`
                      : "0% read"}
                  </Badge>
                  {messageDetail ? (
                    <Badge variant="outline" className="text-xs">
                      {messageDetail.status}
                    </Badge>
                  ) : null}
                  {selectedMessage ? (
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
                Loading message...
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
                  {fullBody || "No message body available."}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Compose dialog */}
        <Dialog open={showCompose} onOpenChange={setShowCompose}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Compose message</DialogTitle>
              <DialogDescription>
                Send an announcement or direct message to applicants.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Type</Label>
                <Select
                  value={composeType}
                  onValueChange={(v) => setComposeType(v as typeof composeType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANNOUNCEMENT">
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        Announcement
                      </span>
                    </SelectItem>
                    <SelectItem value="DIRECT">
                      <span className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5" />
                        Direct message
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {composeType === "ANNOUNCEMENT" && (
                <AudienceBuilder
                  eventId={eventId}
                  filter={recipientFilter}
                  onChange={setRecipientFilter}
                  previewCount={previewCount}
                  isLoadingPreview={isLoadingPreview}
                />
              )}

              {composeType === "DIRECT" && (
                <div className="space-y-2">
                  <Label className="text-sm">Recipient emails</Label>
                  <Textarea
                    value={composeDirectRecipientsText}
                    onChange={(e) => setComposeDirectRecipientsText(e.target.value)}
                    placeholder={"alice@example.com\nbob@example.com"}
                    rows={6}
                  />
                  <div className="rounded-md border border-border/60 p-3 text-xs space-y-1">
                    <p>{parsedDirectRecipients.emails.length} valid unique email(s)</p>
                    <p>{parsedDirectRecipients.duplicateEmails.length} duplicate email(s) ignored</p>
                    <p>{parsedDirectRecipients.invalidTokens.length} invalid token(s)</p>
                    {parsedDirectRecipients.overLimit && (
                      <p className="text-destructive">
                        Only the first {MAX_PASTED_EMAILS} valid unique emails are used (
                        {parsedDirectRecipients.truncatedCount} ignored).
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm">Subject</Label>
                <Input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Message subject..."
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Body</Label>
                <Textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your message..."
                  rows={6}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={composeSendEmail}
                  onCheckedChange={setComposeSendEmail}
                  id="compose-send-email"
                />
                <Label htmlFor="compose-send-email" className="text-sm">
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
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function MessageCard({
  message,
  canDelete,
  onDelete,
  onView,
}: {
  message: SentMessage;
  canDelete: boolean;
  onDelete: (messageId: string) => void;
  onView: (message: SentMessage) => void;
}) {
  const readRate =
    message.recipientCount > 0
      ? Math.round((message.readCount / message.recipientCount) * 100)
      : 0;
  const emailProgress = emailDeliveryProgressPercent(message.emailDelivery);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-sm">{message.subject}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{new Date(message.sentAt).toLocaleString("en-GB")}</span>
              <span>|</span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {message.recipientCount} recipients
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="text-xs">
              <BarChart3 className="mr-1 h-3 w-3" />
              {readRate}% read
            </Badge>
            <Badge
              variant={getEmailDeliveryBadgeVariant(message.emailDelivery.state)}
              className="text-xs"
            >
              {emailDeliveryStateLabel(message.emailDelivery.state)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Email {message.emailDelivery.sentCount}/{message.emailDelivery.requestedCount} sent
            </Badge>
            <Badge variant="outline" className="text-xs">
              {message.emailDelivery.remainingCount} left
            </Badge>
            <Badge variant="outline" className="text-xs">
              {emailProgress}% done
            </Badge>
            <Badge variant={message.type === "ANNOUNCEMENT" ? "default" : "secondary"}>
              {message.type === "ANNOUNCEMENT" ? "Announcement" : "Direct"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => onView(message)}>
              View full message
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(message.id)}
                aria-label="Delete message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
