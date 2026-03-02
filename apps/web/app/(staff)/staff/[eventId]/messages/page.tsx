"use client";

import { useCallback, useEffect, useState } from "react";
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
import { useAuth, usePermissions } from "@/lib/auth-context";
import { Permission } from "@event-platform/shared";
import type { RecipientFilter } from "@event-platform/shared";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface SentMessage {
  id: string;
  subject: string;
  type: "ANNOUNCEMENT" | "DIRECT";
  recipientCount: number;
  sentAt: string;
  readCount: number;
}

function normalizeMessage(raw: any): SentMessage {
  return {
    id: raw.id,
    subject: raw.title ?? raw.subject ?? "(no subject)",
    type: raw.type ?? "ANNOUNCEMENT",
    recipientCount: raw.recipientCount ?? 0,
    sentAt: raw.createdAt ?? raw.sentAt ?? new Date().toISOString(),
    readCount: raw.readCount ?? 0,
  };
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

  // Compose dialog
  const [showCompose, setShowCompose] = useState(false);
  const [composeType, setComposeType] = useState<"ANNOUNCEMENT" | "DIRECT">("ANNOUNCEMENT");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeRecipient, setComposeRecipient] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const fetchMessages = useCallback(async (
    cursor?: string
  ): Promise<{ items: SentMessage[]; nextCursor: string | null }> => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await apiClient<any>(`/events/${eventId}/messages${query}`);
    return unpackMessagesPayload(res);
  }, [eventId]);

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
    if (composeType === "DIRECT" && !composeRecipient.trim()) {
      toast.error("Recipient email is required");
      return;
    }
    setIsSending(true);
    try {
      const payload: Record<string, unknown> = {
        title: composeSubject,
        bodyRich: composeBody,
        bodyText: composeBody,
        sendEmail: composeSendEmail,
      };
      if (composeType === "DIRECT" && composeRecipient) {
        payload.recipientFilter = {
          emails: [composeRecipient.trim().toLowerCase()],
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
      toast.success("Message sent!");
      setShowCompose(false);
      setComposeSubject("");
      setComposeBody("");
      setComposeRecipient("");
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
      toast.success("Message deleted");
    } catch {
      /* handled */
    }
  }

  const announcements = messages.filter((m) => m.type === "ANNOUNCEMENT");
  const direct = messages.filter((m) => m.type === "DIRECT");

  return (
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
                <Label className="text-sm">Recipient email</Label>
                <Input
                  value={composeRecipient}
                  onChange={(e) => setComposeRecipient(e.target.value)}
                  placeholder="applicant@example.com"
                  type="email"
                />
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
  );
}

function MessageCard({
  message,
  canDelete,
  onDelete,
}: {
  message: SentMessage;
  canDelete: boolean;
  onDelete: (messageId: string) => void;
}) {
  const readRate =
    message.recipientCount > 0
      ? Math.round((message.readCount / message.recipientCount) * 100)
      : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
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
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <BarChart3 className="mr-1 h-3 w-3" />
              {readRate}% read
            </Badge>
            <Badge variant={message.type === "ANNOUNCEMENT" ? "default" : "secondary"}>
              {message.type === "ANNOUNCEMENT" ? "Announcement" : "Direct"}
            </Badge>
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
