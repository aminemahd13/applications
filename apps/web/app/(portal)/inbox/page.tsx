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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { sanitizeHtml } from "@/lib/sanitize";
import { useRouter } from "next/navigation";

interface Message {
  id: string;
  subject: string;
  body: string;
  type: "ANNOUNCEMENT" | "DIRECT" | "NOTIFICATION" | "ACTION_REQUIRED" | "TRANSACTIONAL" | "SYSTEM";
  actionType?: "OPEN_STEP" | "OPEN_APPLICATION" | "EXTERNAL_LINK";
  actionPayload?: Record<string, string>;
  actionLabel?: string;
  senderName?: string;
  eventName?: string;
  isRead: boolean;
  createdAt: string;
}

/** Map API inbox item to frontend Message shape */
function normalizeInboxItem(item: Record<string, unknown>): Message {
  let actionType = item.actionType as Message["actionType"] | undefined;
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
    id: (item.recipientId ?? item.id) as string,
    subject: (item.title ?? item.subject ?? "(no subject)") as string,
    body: (item.bodyText ?? item.preview ?? item.body ?? "") as string,
    type: (item.type ?? "ANNOUNCEMENT") as Message["type"],
    actionType,
    actionPayload,
    actionLabel: item.actionLabel as string | undefined,
    senderName: item.senderName as string | undefined,
    eventName: item.eventName as string | undefined,
    isRead: item.isRead !== undefined ? !!item.isRead : item.readAt != null,
    createdAt: (item.createdAt ?? new Date().toISOString()) as string,
  };
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
  return new Date(dateStr).toLocaleDateString();
}

const typeConfig: Record<string, { icon: React.ReactNode; label: string }> = {
  ANNOUNCEMENT: { icon: <Bell className="h-3.5 w-3.5" />, label: "Announcement" },
  DIRECT: { icon: <Mail className="h-3.5 w-3.5" />, label: "Message" },
  NOTIFICATION: { icon: <FileText className="h-3.5 w-3.5" />, label: "Notification" },
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

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
    } catch {
      /* silent */
    }
  }, [csrfToken]);

  function handleAction(msg: Message) {
    if (!msg.actionType || !msg.actionPayload) return;
    switch (msg.actionType) {
      case "OPEN_STEP":
        if (!msg.actionPayload.applicationId || !msg.actionPayload.stepId) return;
        router.push(
          `/applications/${msg.actionPayload.applicationId}/steps/${msg.actionPayload.stepId}`
        );
        break;
      case "OPEN_APPLICATION":
        if (!msg.actionPayload.applicationId) return;
        router.push(`/applications/${msg.actionPayload.applicationId}`);
        break;
      case "EXTERNAL_LINK":
        if (!msg.actionPayload.url) return;
        window.open(msg.actionPayload.url, "_blank", "noopener");
        break;
    }
  }

  const filtered = filter === "unread" ? messages.filter((m) => !m.isRead) : messages;
  const unreadCount = messages.filter((m) => !m.isRead).length;

  return (
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
          {filtered.map((msg) => {
            const isExpanded = expanded === msg.id;
            return (
              <motion.div key={msg.id} variants={itemVariants}>
                <Card
                  className={`transition-colors cursor-pointer ${
                    !msg.isRead
                      ? "border-l-4 border-l-primary border-primary/20 bg-primary/[0.02]"
                      : "hover:bg-muted/30"
                  }`}
                  onClick={() => {
                    setExpanded(isExpanded ? null : msg.id);
                    if (!msg.isRead) markRead(msg.id);
                  }}
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
                              {typeConfig[msg.type]?.icon}
                              {typeConfig[msg.type]?.label}
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
                              <span>·</span>
                              <span>{msg.senderName}</span>
                            </>
                          )}
                        </div>

                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Separator className="my-3" />
                            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.body) }} />
                            </div>

                            {msg.actionType && msg.actionPayload && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-3"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAction(msg);
                                }}
                              >
                                {msg.actionType === "EXTERNAL_LINK" ? (
                                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                ) : (
                                  <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {msg.actionLabel ??
                                  (msg.actionType === "OPEN_STEP"
                                    ? "Open step"
                                    : msg.actionType === "OPEN_APPLICATION"
                                    ? "View application"
                                    : "Open link")}
                              </Button>
                            )}
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
