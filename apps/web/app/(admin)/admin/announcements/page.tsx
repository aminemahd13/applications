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
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface SentAnnouncement {
  id: string;
  title: string;
  recipientCount: number;
  sentAt: string;
  readCount: number;
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
  return {
    id: raw.id,
    title: raw.title ?? "(no subject)",
    recipientCount: raw.recipientCount ?? 0,
    sentAt: raw.createdAt ?? new Date().toISOString(),
    readCount: raw.readCount ?? 0,
  };
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

  async function deleteAnnouncement(id: string) {
    if (!window.confirm("Delete this announcement? This action cannot be undone.")) return;
    try {
      await apiClient(`/admin/announcements/${id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setAnnouncements((current) => current.filter((a) => a.id !== id));
      toast.success("Announcement deleted");
    } catch {
      toast.error("Could not delete announcement");
    }
  }

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
            return (
              <Card key={ann.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
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
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <BarChart3 className="mr-1 h-3 w-3" />
                        {readRate}% read
                      </Badge>
                      <Badge>System</Badge>
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
    </div>
  );
}
