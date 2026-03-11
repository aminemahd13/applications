"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  MailOpen,
  Bell,
  ExternalLink,
  FileText,
  ArrowRight,
  Inbox as InboxIcon,
  Check,
  Filter,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

type InboxMessageType =
  | "ANNOUNCEMENT"
  | "DIRECT"
  | "NOTIFICATION"
  | "ACTION_REQUIRED"
  | "TRANSACTIONAL"
  | "SYSTEM";

type InboxActionType = "OPEN_STEP" | "OPEN_APPLICATION" | "EXTERNAL_LINK";

interface MessageSummary {
  id: string;
  subject: string;
  preview: string;
  type: InboxMessageType;
  actionType?: InboxActionType;
  actionPayload?: Record<string, string>;
  actionLabel?: string;
  senderName?: string;
  eventName?: string;
  isRead: boolean;
  createdAt: string;
}

interface MessageDetail {
  id: string;
  subject: string;
  type: InboxMessageType;
  bodyText: string | null;
  bodyRich: unknown;
  actionType?: InboxActionType;
  actionPayload?: Record<string, string>;
  actionLabel?: string;
  createdAt: string;
}

function extractActionFields(item: Record<string, unknown>): {
  actionType?: InboxActionType;
  actionPayload?: Record<string, string>;
  actionLabel?: string;
} {
  let actionType = item.actionType as InboxActionType | undefined;
  let actionPayload = item.actionPayload as Record<string, string> | undefined;

  if (!actionType || !actionPayload) {
    const firstAction = Array.isArray(item.actionButtons)
      ? (item.actionButtons[0] as Record<string, unknown> | undefined)
      : undefined;
    const kind = String(firstAction?.kind ?? "").toUpperCase();

    if (kind === "OPEN_STEP") {
      actionType = "OPEN_STEP";
      const stepId =
        typeof firstAction?.stepId === "string" ? firstAction.stepId : "";
      const applicationId =
        typeof firstAction?.applicationId === "string"
          ? firstAction.applicationId
          : "";
      actionPayload = { applicationId, stepId };
    } else if (kind === "OPEN_APPLICATION") {
      actionType = "OPEN_APPLICATION";
      const applicationId =
        typeof firstAction?.applicationId === "string"
          ? firstAction.applicationId
          : "";
      actionPayload = { applicationId };
    } else if (kind === "EXTERNAL_LINK") {
      actionType = "EXTERNAL_LINK";
      const url = typeof firstAction?.url === "string" ? firstAction.url : "";
      actionPayload = { url };
    }
  }

  return {
    actionType,
    actionPayload,
    actionLabel: item.actionLabel as string | undefined,
  };
}

/** Map inbox list item to frontend MessageSummary shape */
function normalizeInboxItem(item: Record<string, unknown>): MessageSummary {
  const action = extractActionFields(item);

  return {
    id: (item.recipientId ?? item.id) as string,
    subject: (item.title ?? item.subject ?? "(no subject)") as string,
    preview: (item.preview ?? item.bodyText ?? item.body ?? "") as string,
    type: (item.type ?? "ANNOUNCEMENT") as InboxMessageType,
    ...action,
    senderName: item.senderName as string | undefined,
    eventName: item.eventName as string | undefined,
    isRead: item.isRead !== undefined ? !!item.isRead : item.readAt != null,
    createdAt: (item.createdAt ?? new Date().toISOString()) as string,
  };
}

function normalizeInboxDetail(item: Record<string, unknown>): MessageDetail {
  const action = extractActionFields(item);

  return {
    id: (item.recipientId ?? item.id) as string,
    subject: (item.title ?? item.subject ?? "(no subject)") as string,
    type: (item.type ?? "ANNOUNCEMENT") as InboxMessageType,
    bodyText: typeof item.bodyText === "string" ? item.bodyText : null,
    bodyRich: item.bodyRich,
    ...action,
    createdAt: (item.createdAt ?? new Date().toISOString()) as string,
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

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB");
}

const typeConfig: Record<InboxMessageType, { icon: React.ReactNode; label: string }> = {
  ANNOUNCEMENT: { icon: <Bell className="h-3.5 w-3.5" />, label: "Announcement" },
  DIRECT: { icon: <Mail className="h-3.5 w-3.5" />, label: "Message" },
  NOTIFICATION: { icon: <FileText className="h-3.5 w-3.5" />, label: "Notification" },
  ACTION_REQUIRED: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: "Action required",
  },
  TRANSACTIONAL: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: "Transactional",
  },
  SYSTEM: { icon: <FileText className="h-3.5 w-3.5" />, label: "System" },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
};

export default function InboxPage() {
  const { csrfToken } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const [selectedMessage, setSelectedMessage] = useState<MessageSummary | null>(null);
  const [messageDetail, setMessageDetail] = useState<MessageDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiClient<
          | { data: Array<Record<string, unknown>> }
          | Array<Record<string, unknown>>
        >("/me/inbox");
        const raw = Array.isArray(response)
          ? response
          : Array.isArray((response as any).data)
            ? (response as any).data
            : [];
        setMessages(raw.map(normalizeInboxItem));
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await apiClient(`/me/inbox/${id}/read`, {
          method: "POST",
          csrfToken: csrfToken ?? undefined,
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isRead: true } : m))
        );
      } catch {
        /* silent */
      }
    },
    [csrfToken]
  );

  const markAllRead = useCallback(async () => {
    try {
      await apiClient("/me/inbox/read-all", {
        method: "POST",
        csrfToken: csrfToken ?? undefined,
      });
      setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
      setSelectedMessage((prev) => (prev ? { ...prev, isRead: true } : prev));
    } catch {
      /* silent */
    }
  }, [csrfToken]);

  function handleAction(
    actionType?: InboxActionType,
    actionPayload?: Record<string, string>
  ) {
    if (!actionType || !actionPayload) return;
    switch (actionType) {
      case "OPEN_STEP":
        if (!actionPayload.applicationId || !actionPayload.stepId) return;
        router.push(
          `/applications/${actionPayload.applicationId}/steps/${actionPayload.stepId}`
        );
        break;
      case "OPEN_APPLICATION":
        if (!actionPayload.applicationId) return;
        router.push(`/applications/${actionPayload.applicationId}`);
        break;
      case "EXTERNAL_LINK":
        if (!actionPayload.url) return;
        window.open(actionPayload.url, "_blank", "noopener");
        break;
    }
  }

  const openMessageDialog = useCallback(
    async (message: MessageSummary) => {
      setSelectedMessage(message);
      setMessageDetail(null);
      setDetailError(null);
      setIsDetailLoading(true);
      setIsDetailOpen(true);

      if (!message.isRead) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id ? { ...item, isRead: true } : item
          )
        );
        setSelectedMessage((prev) =>
          prev && prev.id === message.id ? { ...prev, isRead: true } : prev
        );
        void markRead(message.id);
      }

      try {
        const response = await apiClient<
          { data?: Record<string, unknown> } | Record<string, unknown>
        >(`/me/inbox/${message.id}`);

        const rawDetail =
          response &&
          typeof response === "object" &&
          !Array.isArray(response) &&
          "data" in response &&
          response.data &&
          typeof response.data === "object"
            ? (response.data as Record<string, unknown>)
            : (response as Record<string, unknown>);

        setMessageDetail(normalizeInboxDetail(rawDetail));
      } catch {
        setDetailError("Could not load full message.");
      } finally {
        setIsDetailLoading(false);
      }
    },
    [markRead]
  );

  const filtered = filter === "unread" ? messages.filter((m) => !m.isRead) : messages;
  const unreadCount = messages.filter((m) => !m.isRead).length;

  const actionType = messageDetail?.actionType ?? selectedMessage?.actionType;
  const actionPayload = messageDetail?.actionPayload ?? selectedMessage?.actionPayload;
  const actionLabel = messageDetail?.actionLabel ?? selectedMessage?.actionLabel;
  const fullBody = resolveMessageBody(messageDetail?.bodyText, messageDetail?.bodyRich);

  return (
    <>
      <div className="space-y-6">
        <PageHeader title="Inbox" description="Messages and announcements from events you've applied to">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </PageHeader>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">
              All
              {messages.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1">
                  {messages.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Unread
              {unreadCount > 0 && (
                <Badge className="ml-1.5 h-5 min-w-5 px-1">{unreadCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={filter === "unread" ? "All caught up!" : "No messages yet"}
            description={
              filter === "unread"
                ? "You have no unread messages."
                : "Messages from events you apply to will appear here."
            }
          />
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            {filtered.map((msg) => (
              <motion.div key={msg.id} variants={itemVariants}>
                <Card
                  className={`transition-colors ${
                    !msg.isRead
                      ? "border-l-4 border-l-primary border-primary/20 bg-primary/[0.02]"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {msg.isRead ? (
                          <MailOpen className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <div className="relative">
                            <Mail className="h-4 w-4 text-primary" />
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="text-[10px] gap-1 shrink-0 font-normal">
                              {typeConfig[msg.type].icon}
                              {typeConfig[msg.type].label}
                            </Badge>
                            <span
                              className={`text-sm truncate ${
                                !msg.isRead ? "font-semibold" : "font-medium"
                              }`}
                            >
                              {msg.subject}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {relativeTime(msg.createdAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {msg.eventName && <span>{msg.eventName}</span>}
                          {msg.senderName && (
                            <>
                              <span>-</span>
                              <span>{msg.senderName}</span>
                            </>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                          {msg.preview || "Open to view full message."}
                        </p>

                        <div className="mt-3 flex items-center justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openMessageDialog(msg)}
                          >
                            View full message
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

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
                {selectedMessage ? new Date(selectedMessage.createdAt).toLocaleString("en-GB") : ""}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {selectedMessage ? (
                  <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                    {typeConfig[selectedMessage.type].icon}
                    {typeConfig[selectedMessage.type].label}
                  </Badge>
                ) : null}
                {selectedMessage?.eventName ? (
                  <span className="text-xs text-muted-foreground">{selectedMessage.eventName}</span>
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
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm whitespace-pre-wrap break-words">
                {fullBody || "No message body available."}
              </div>

              {actionType && actionPayload && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(actionType, actionPayload)}
                >
                  {actionType === "EXTERNAL_LINK" ? (
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {actionLabel ??
                    (actionType === "OPEN_STEP"
                      ? "Open step"
                      : actionType === "OPEN_APPLICATION"
                        ? "View application"
                        : "Open link")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
