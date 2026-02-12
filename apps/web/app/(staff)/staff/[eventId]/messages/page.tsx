"use client";

import { useEffect, useState } from "react";
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
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface SentMessage {
  id: string;
  subject: string;
  type: "ANNOUNCEMENT" | "DIRECT";
  recipientCount: number;
  sentAt: string;
  readCount: number;
}

export default function MessagesPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();

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
  const [composeFilter, setComposeFilter] = useState("all");
  const [isSending, setIsSending] = useState(false);

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

  async function fetchMessages(
    cursor?: string
  ): Promise<{ items: SentMessage[]; nextCursor: string | null }> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await apiClient<any>(`/events/${eventId}/messages${query}`);
    return unpackMessagesPayload(res);
  }

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
  }, [eventId]);

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
        sendEmail: false,
      };
      if (composeType === "DIRECT" && composeRecipient) {
        payload.recipientFilter = {
          emails: [composeRecipient.trim().toLowerCase()],
        };
      } else {
        if (composeFilter === "all") {
          payload.recipientFilter = {};
        } else {
          payload.recipientFilter = {
            decisionStatus: [composeFilter.toUpperCase()],
          };
        }
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
                    <MessageCard key={msg.id} message={msg} />
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
                    <MessageCard key={msg.id} message={msg} />
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
        <DialogContent className="max-w-lg">
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
                      Announcement (all applicants)
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
              <div className="space-y-2">
                <Label className="text-sm">Filter recipients</Label>
                <Select value={composeFilter} onValueChange={setComposeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All applicants</SelectItem>
                    <SelectItem value="accepted">Accepted only</SelectItem>
                    <SelectItem value="waitlisted">Waitlisted only</SelectItem>
                    <SelectItem value="rejected">Rejected only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                rows={8}
              />
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

function MessageCard({ message }: { message: SentMessage }) {
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
              <span>{new Date(message.sentAt).toLocaleString()}</span>
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
