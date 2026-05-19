"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type ReviewVerdict = "APPROVE" | "REJECT" | "REQUEST_INFO";

export interface VerdictDraft {
  outcome: ReviewVerdict;
  comment: string;
  requestInfoFieldIds: string[];
  requestInfoDeadline: string;
  requestInfoNotifyApplicant: boolean;
  requestInfoSendEmail: boolean;
}

export interface RequestFieldOption {
  id: string;
  label: string;
  section?: string;
}

interface VerdictWorkspaceProps {
  currentItemId: string;
  currentQueueMode?: "direct" | "shared";
  canActOnCurrentItem: boolean;
  isCurrentAssignedToActor: boolean;
  canSendMessages: boolean;
  requestFieldOptions: RequestFieldOption[];
  onClaim: () => void;
  onRelease: () => void;
  onSubmit: (draft: VerdictDraft) => Promise<void>;
  isSubmittingReview: boolean;
  autoAdvance: boolean;
  setAutoAdvance: (value: boolean) => void;
  nextPreview?: { title: string; subtitle?: string } | null;
}

function defaultDraft(
  outcome: ReviewVerdict,
  canSendMessages: boolean,
): VerdictDraft {
  return {
    outcome,
    comment: "",
    requestInfoFieldIds: [],
    requestInfoDeadline: "",
    requestInfoNotifyApplicant: canSendMessages,
    requestInfoSendEmail: false,
  };
}

export function VerdictWorkspace({
  currentItemId,
  currentQueueMode,
  canActOnCurrentItem,
  isCurrentAssignedToActor,
  canSendMessages,
  requestFieldOptions,
  onClaim,
  onRelease,
  onSubmit,
  isSubmittingReview,
  autoAdvance,
  setAutoAdvance,
  nextPreview,
}: VerdictWorkspaceProps) {
  const [draft, setDraft] = useState<VerdictDraft | null>(null);
  const [fieldQuery, setFieldQuery] = useState("");

  // Reset draft when the current item changes (post-submit, manual nav, etc.)
  // — but not mid-submit, so the form stays visible until the parent updates.
  const submittingRef = useRef(isSubmittingReview);
  useEffect(() => {
    submittingRef.current = isSubmittingReview;
  }, [isSubmittingReview]);

  useEffect(() => {
    if (!submittingRef.current) {
      setDraft(null);
      setFieldQuery("");
    }
  }, [currentItemId]);

  // Group fields by their section heading for editorial scanning.
  const groupedFields = useMemo(() => {
    const groups = new Map<string, RequestFieldOption[]>();
    for (const field of requestFieldOptions) {
      const key = field.section ?? "Fields";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(field);
    }
    return Array.from(groups.entries());
  }, [requestFieldOptions]);

  // Same case-insensitive predicate cmdk uses — duplicated client-side so
  // "Select all matching" knows which IDs are currently visible.
  const matchingFieldIds = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase();
    if (!q) return requestFieldOptions.map((f) => f.id);
    return requestFieldOptions
      .filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          (f.section ?? "").toLowerCase().includes(q),
      )
      .map((f) => f.id);
  }, [fieldQuery, requestFieldOptions]);

  const openDraft = (outcome: ReviewVerdict) => {
    setDraft(defaultDraft(outcome, canSendMessages));
    setFieldQuery("");
  };

  const handleSubmit = async () => {
    if (!draft) return;
    await onSubmit(draft);
    // On success: currentItemId changes → the effect clears the draft.
    // On failure: parent already toasted; keep the draft so user can retry.
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Review actions</CardTitle>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={autoAdvance}
              onCheckedChange={(checked) => setAutoAdvance(Boolean(checked))}
              aria-label="Auto-advance to next item after submit"
            />
            <span>Auto-advance</span>
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Claim / Release strip — always visible */}
        <div className="rounded-md border border-border/60 p-3">
          {currentQueueMode === "shared" ? (
            <Button
              className="w-full justify-start"
              variant="outline"
              onClick={onClaim}
              disabled={isSubmittingReview}
            >
              Claim
            </Button>
          ) : isCurrentAssignedToActor ? (
            <Button
              className="w-full justify-start"
              variant="ghost"
              onClick={onRelease}
              disabled={isSubmittingReview}
            >
              Release to shared
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              This item is directly assigned to another reviewer.
            </p>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {draft === null ? (
            <motion.div
              key="mode-a"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="space-y-3"
            >
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => openDraft("APPROVE")}
                disabled={!canActOnCurrentItem || isSubmittingReview}
              >
                <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                Approve
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => openDraft("REQUEST_INFO")}
                disabled={!canActOnCurrentItem || isSubmittingReview}
              >
                <AlertTriangle className="mr-2 h-4 w-4 text-warning" />
                Request revision
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => openDraft("REJECT")}
                disabled={!canActOnCurrentItem || isSubmittingReview}
              >
                <XCircle className="mr-2 h-4 w-4 text-destructive" />
                Reject
              </Button>
              {!canActOnCurrentItem && (
                <p className="text-xs text-muted-foreground">
                  Claim this item to unlock review decisions.
                </p>
              )}
              {nextPreview && autoAdvance && (
                <div className="mt-4 rounded-md border border-dashed border-border/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    Next up
                    <ArrowRight className="h-3 w-3" />
                  </p>
                  <p className="truncate text-sm font-medium">
                    {nextPreview.title}
                  </p>
                  {nextPreview.subtitle && (
                    <p className="truncate text-xs text-muted-foreground">
                      {nextPreview.subtitle}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`mode-b-${draft.outcome}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">
                  {draft.outcome === "APPROVE"
                    ? "Approve submission"
                    : draft.outcome === "REJECT"
                      ? "Reject submission"
                      : "Request revision"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {draft.outcome === "REQUEST_INFO"
                    ? "Specify fields that need revision and an optional deadline."
                    : "Add an optional comment."}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  {draft.outcome === "REQUEST_INFO"
                    ? "Message to applicant"
                    : "Comment (optional)"}
                </Label>
                <Textarea
                  value={draft.comment}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, comment: e.target.value } : prev,
                    )
                  }
                  placeholder={
                    draft.outcome === "REQUEST_INFO"
                      ? "Explain what needs to be updated..."
                      : "Add a review comment..."
                  }
                  rows={3}
                />
              </div>

              {draft.outcome === "REQUEST_INFO" && (
                <>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs">Fields to revise</Label>
                      {requestFieldOptions.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      requestInfoFieldIds:
                                        requestFieldOptions.map((f) => f.id),
                                    }
                                  : prev,
                              )
                            }
                          >
                            All
                          </Button>
                          {fieldQuery.trim() &&
                            matchingFieldIds.length > 0 &&
                            matchingFieldIds.length <
                              requestFieldOptions.length && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDraft((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          requestInfoFieldIds: Array.from(
                                            new Set([
                                              ...prev.requestInfoFieldIds,
                                              ...matchingFieldIds,
                                            ]),
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                              >
                                All matching ({matchingFieldIds.length})
                              </Button>
                            )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDraft((prev) =>
                                prev
                                  ? { ...prev, requestInfoFieldIds: [] }
                                  : prev,
                              )
                            }
                          >
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>
                    {requestFieldOptions.length === 0 ? (
                      <div className="rounded-lg border border-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">
                          No fields available for this step. Leave this empty to
                          request a full-step revision.
                        </p>
                      </div>
                    ) : (
                      <Command
                        className="rounded-lg border border-muted/40"
                        // The label-based filtering above is duplicated for
                        // "All matching"; cmdk's built-in filtering drives the
                        // visible list via the CommandItem `value`.
                      >
                        <CommandInput
                          placeholder="Filter fields…"
                          value={fieldQuery}
                          onValueChange={setFieldQuery}
                        />
                        <CommandList className="max-h-56">
                          <CommandEmpty>No fields match.</CommandEmpty>
                          {groupedFields.map(([section, fields]) => (
                            <CommandGroup key={section} heading={section}>
                              {fields.map((field) => {
                                const checked =
                                  draft.requestInfoFieldIds.includes(field.id);
                                return (
                                  <CommandItem
                                    key={field.id}
                                    value={`${section} ${field.label}`}
                                    onSelect={() => {
                                      setDraft((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              requestInfoFieldIds: checked
                                                ? prev.requestInfoFieldIds.filter(
                                                    (id) => id !== field.id,
                                                  )
                                                : Array.from(
                                                    new Set([
                                                      ...prev.requestInfoFieldIds,
                                                      field.id,
                                                    ]),
                                                  ),
                                            }
                                          : prev,
                                      );
                                    }}
                                  >
                                    <span
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
                                      aria-hidden="true"
                                    >
                                      {checked && (
                                        <Check className="h-3 w-3" />
                                      )}
                                    </span>
                                    <span className="min-w-0 truncate">
                                      {field.label}
                                    </span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          ))}
                        </CommandList>
                      </Command>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Leave empty to request a full-step revision.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Deadline (optional)</Label>
                    <Input
                      type="date"
                      value={draft.requestInfoDeadline}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? { ...prev, requestInfoDeadline: e.target.value }
                            : prev,
                        )
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label className="text-xs">Notify applicant</Label>
                      <p className="break-words text-xs text-muted-foreground">
                        Send an inbox message with a direct link to the step.
                      </p>
                    </div>
                    <Switch
                      className="shrink-0"
                      checked={draft.requestInfoNotifyApplicant}
                      onCheckedChange={(checked) => {
                        const enabled = Boolean(checked);
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                requestInfoNotifyApplicant: enabled,
                                requestInfoSendEmail: enabled
                                  ? prev.requestInfoSendEmail
                                  : false,
                              }
                            : prev,
                        );
                      }}
                      disabled={!canSendMessages}
                    />
                  </div>

                  {draft.requestInfoNotifyApplicant && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Label className="text-xs">Also send email</Label>
                        <p className="break-words text-xs text-muted-foreground">
                          Deliver the revision request via email.
                        </p>
                      </div>
                      <Switch
                        className="shrink-0"
                        checked={draft.requestInfoSendEmail}
                        onCheckedChange={(checked) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  requestInfoSendEmail: Boolean(checked),
                                }
                              : prev,
                          )
                        }
                        disabled={!canSendMessages}
                      />
                    </div>
                  )}

                  {!canSendMessages && (
                    <p className="text-xs text-muted-foreground">
                      You do not have permission to send applicant messages.
                    </p>
                  )}
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft(null)}
                  disabled={isSubmittingReview}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmittingReview}
                  variant={draft.outcome === "REJECT" ? "destructive" : "default"}
                  size="sm"
                >
                  {isSubmittingReview && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  {draft.outcome === "APPROVE"
                    ? "Approve"
                    : draft.outcome === "REJECT"
                      ? "Reject"
                      : "Request revision"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
