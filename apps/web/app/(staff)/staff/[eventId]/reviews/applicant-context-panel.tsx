"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { motion } from "framer-motion";
import {
  ListChecks,
  Loader2,
  PencilLine,
  Plus,
  RotateCw,
  StickyNote,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  INTERNAL_NOTE_CONTENT_MAX_LENGTH,
  Permission,
  type AppendInternalNoteResponse,
  type ReviewContextNote,
  type ReviewContextSubmission,
  type ReviewQueueItemContext,
} from "@event-platform/shared";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiClient } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import {
  buildOrderedAnswerEntries,
  describeAnswerValue,
  groupAnswerEntriesBySection,
  type AnswerEntry,
  type FileAnswerRef,
} from "@/lib/answer-entries";
import { formatExactTimestamp } from "@/lib/relative-time";
import { renderAnswerEntryValue } from "@/lib/render-answer-value";
import {
  buildApplicantProfileRows,
  buildContextStepRows,
  buildEditedFieldMap,
  formatTimeAgo,
  getNoteAuthorLabel,
  indexContextFiles,
  resolveContextFileMeta,
  type ContextFileIndex,
  type ContextStepRow,
} from "@/lib/review-context";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ContextFilePreview } from "./context-file-preview";

export const APPLICANT_CONTEXT_PANEL_ID = "applicant-context-panel";

const ORIGINAL_TOOLTIP_MAX_LENGTH = 160;

export interface ApplicantContextPanelProps {
  eventId: string;
  /** Queue item currently shown in the main card; the panel follows it. */
  queueItemId: string;
  /** Display name of the current applicant (header subtitle). */
  applicantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ≥ lg (64rem): docked in the review grid. Below: modal full-width sheet. */
  isDesktop: boolean;
  /** "Applicant info" button; focus returns here when the panel closes. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /**
   * Set by the trigger when the user opens the panel. The docked panel only
   * takes focus (and scrolls into view) for that user-initiated open — not
   * when it remounts on its own, e.g. after the queue empties and refills.
   */
  focusOnOpenRef: RefObject<boolean>;
}

/**
 * Read-only applicant context next to the review card. On desktop it replaces
 * the review-actions column in place (no overlay, no focus trap) so the
 * answers stay usable side by side; on smaller screens it is a modal sheet.
 * It stays open across Previous/Next and follows the current queue item.
 */
export function ApplicantContextPanel({
  eventId,
  queueItemId,
  applicantName,
  open,
  onOpenChange,
  isDesktop,
  triggerRef,
  focusOnOpenRef,
}: ApplicantContextPanelProps) {
  const titleId = useId();
  const sheetTitleRef = useRef<HTMLHeadingElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  // Unsent note drafts per application — kept here (always mounted) so closing
  // the panel or moving to another applicant doesn't lose typed text.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  function setNoteDraft(applicationId: string, value: string) {
    setNoteDrafts((prev) => {
      if ((prev[applicationId] ?? "") === value) return prev;
      const next = { ...prev };
      if (value.length === 0) delete next[applicationId];
      else next[applicationId] = value;
      return next;
    });
  }

  function closeAndReturnFocus() {
    onOpenChange(false);
    triggerRef.current?.focus();
  }

  const body = (
    <ApplicantContextBody
      eventId={eventId}
      queueItemId={queueItemId}
      isDesktop={isDesktop}
      noteDrafts={noteDrafts}
      onNoteDraftChange={setNoteDraft}
    />
  );

  if (isDesktop) {
    if (!open) return null;
    return (
      <motion.aside
        ref={asideRef}
        id={APPLICANT_CONTEXT_PANEL_ID}
        aria-labelledby={titleId}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          // Nested Radix layers (tooltips) dismiss themselves and mark the
          // event as handled; only a "bare" Escape closes the panel.
          if (event.key !== "Escape" || event.defaultPrevented) return;
          event.stopPropagation();
          closeAndReturnFocus();
        }}
        className="bg-card text-card-foreground sticky top-4 flex h-[calc(100svh-2rem)] min-w-0 scroll-mt-4 flex-col overflow-hidden rounded-xl border shadow-sm print:hidden"
      >
        <DesktopPanelHeader
          titleId={titleId}
          applicantName={applicantName}
          onClose={closeAndReturnFocus}
          focusOnOpenRef={focusOnOpenRef}
          asideRef={asideRef}
        />
        {body}
      </motion.aside>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <SheetContent
        id={APPLICANT_CONTEXT_PANEL_ID}
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          // Default would focus the first control (possibly the note
          // textarea → on-screen keyboard). Start at the title instead.
          event.preventDefault();
          sheetTitleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle ref={sheetTitleRef} tabIndex={-1} className="outline-none">
            Applicant info
          </SheetTitle>
          <SheetDescription className="truncate">{applicantName}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}

function DesktopPanelHeader({
  titleId,
  applicantName,
  onClose,
  focusOnOpenRef,
  asideRef,
}: {
  titleId: string;
  applicantName: string;
  onClose: () => void;
  focusOnOpenRef: RefObject<boolean>;
  asideRef: RefObject<HTMLElement | null>;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Mounted when the panel opens. Only a user-initiated open moves focus and
  // brings the whole panel (incl. the notes composer) into view; a remount on
  // its own (queue emptied and refilled) must not steal focus from filters.
  // Switching applicants keeps the panel mounted, so focus isn't moved again.
  useEffect(() => {
    if (!focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    asideRef.current?.scrollIntoView({ block: "nearest" });
    headingRef.current?.focus({ preventScroll: true });
  }, [focusOnOpenRef, asideRef]);

  return (
    <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
      <div className="min-w-0">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="text-sm font-semibold outline-none"
        >
          Applicant info
        </h2>
        <p className="text-muted-foreground truncate text-xs" aria-live="polite">
          {applicantName}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="-mt-1 -mr-2 shrink-0"
        onClick={onClose}
        aria-label="Close applicant info"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

interface ContextResult {
  /** `${queueItemId}:${reloadToken}` of the request this result answers. */
  key: string | null;
  data: ReviewQueueItemContext | null;
  error: string | null;
}

interface ApplicantContextBodyProps {
  eventId: string;
  queueItemId: string;
  isDesktop: boolean;
  noteDrafts: Record<string, string>;
  onNoteDraftChange: (applicationId: string, value: string) => void;
}

/**
 * Mounted only while the panel is open: loads the context for the current
 * queue item, keeps the previous applicant visible (dimmed, aria-busy) while
 * the next one loads, and remembers expanded steps until the panel closes.
 */
export function ApplicantContextBody({
  eventId,
  queueItemId,
  isDesktop,
  noteDrafts,
  onNoteDraftChange,
}: ApplicantContextBodyProps) {
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canManageNotes = hasPermission(Permission.EVENT_APPLICATION_NOTES_MANAGE);

  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<ContextResult>({
    key: null,
    data: null,
    error: null,
  });
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>([]);
  const [savingNoteFor, setSavingNoteFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const requestKey = `${queueItemId}:${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    const key = `${queueItemId}:${reloadToken}`;
    apiClient<{ data?: ReviewQueueItemContext }>(
      `/events/${eventId}/review-queue/items/${queueItemId}/context`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = response?.data ?? null;
        setResult((prev) =>
          data
            ? { key, data, error: null }
            : { key, data: prev.data, error: "The server returned no data." },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((prev) => ({
          key,
          data: prev.data,
          error:
            error instanceof Error && error.message
              ? error.message
              : "Request failed.",
        }));
      });
    return () => controller.abort();
  }, [eventId, queueItemId, reloadToken]);

  // New applicant → start reading from the top (focus is left alone).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [queueItemId]);

  const isLoading = result.key !== requestKey;
  const error = isLoading ? null : result.error;
  const data = result.data;
  const isStale = data !== null && data.queueItemId !== queueItemId;
  // Never show another applicant's data next to an error for this one.
  const visibleData = error && isStale ? null : data;

  async function submitNote(applicationId: string) {
    const content = (noteDrafts[applicationId] ?? "").trim();
    if (!content || savingNoteFor) return;
    setSavingNoteFor(applicationId);
    try {
      const response = await apiClient<{ data?: AppendInternalNoteResponse }>(
        `/events/${eventId}/applications/${applicationId}/internal-notes`,
        {
          method: "POST",
          body: { content },
          csrfToken: csrfToken ?? undefined,
        },
      );
      const notes = response?.data?.notes;
      if (Array.isArray(notes)) {
        setResult((prev) =>
          prev.data && prev.data.applicationId === applicationId
            ? { ...prev, data: { ...prev.data, internalNotes: notes } }
            : prev,
        );
      }
      onNoteDraftChange(applicationId, "");
      toast.success("Note added");
    } catch {
      /* apiClient already surfaced the error; keep the draft for a retry */
    } finally {
      setSavingNoteFor(null);
    }
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-4 py-4",
        // Docked: let wheel scrolling chain to the page at the panel's end so
        // its bottom is always reachable. Sheet: keep scroll inside the sheet.
        !isDesktop && "overscroll-contain",
      )}
      aria-busy={isLoading}
    >
      <TooltipProvider delayDuration={200}>
        {isLoading && visibleData && (
          <p
            role="status"
            className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs"
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {isStale ? "Loading this applicant…" : "Refreshing…"}
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 mb-4 rounded-md border p-3"
          >
            <p className="text-sm font-medium">Couldn&apos;t load applicant info.</p>
            <p className="text-muted-foreground mt-0.5 text-xs break-words">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              <RotateCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}

        {visibleData ? (
          <div
            className={cn(
              "divide-y transition-opacity duration-150",
              isLoading && isStale && "opacity-60",
            )}
          >
            <ProfileSection context={visibleData} />
            <StepsSection
              eventId={eventId}
              context={visibleData}
              isDesktop={isDesktop}
              expandedStepIds={expandedStepIds}
              onExpandedStepIdsChange={setExpandedStepIds}
            />
            <NotesSection
              notes={visibleData.internalNotes}
              composer={
                canManageNotes ? (
                  <NoteComposer
                    value={noteDrafts[visibleData.applicationId] ?? ""}
                    onChange={(value) =>
                      onNoteDraftChange(visibleData.applicationId, value)
                    }
                    onSubmit={() => {
                      void submitNote(visibleData.applicationId);
                    }}
                    isSaving={savingNoteFor === visibleData.applicationId}
                    isStale={isStale}
                    isDisabled={isStale || savingNoteFor !== null}
                  />
                ) : null
              }
            />
          </div>
        ) : !error ? (
          <ContextSkeleton />
        ) : null}
      </TooltipProvider>
    </div>
  );
}

function ContextSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading applicant info">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <Skeleton key={row} className="h-4 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  children,
  trailing,
}: {
  id: string;
  icon: LucideIcon;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3
        id={id}
        className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider"
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {children}
      </h3>
      {trailing}
    </div>
  );
}

/* ---------- Profile ---------- */

function ProfileSection({ context }: { context: ReviewQueueItemContext }) {
  const headingId = useId();
  const rows = buildApplicantProfileRows(context.applicant);

  return (
    <section aria-labelledby={headingId} className="pb-5">
      <SectionHeading id={headingId} icon={UserRound}>
        Profile
      </SectionHeading>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        {rows.map((row) => (
          <Fragment key={row.key}>
            <dt className="text-muted-foreground text-xs leading-5">{row.label}</dt>
            <dd
              className={cn(
                "min-w-0 text-sm leading-5 break-words [overflow-wrap:anywhere]",
                row.isEmpty && "text-muted-foreground",
              )}
            >
              {row.value}
            </dd>
          </Fragment>
        ))}
      </dl>
      <p className="text-muted-foreground mt-3 text-xs">
        Current profile — it may have changed since the applicant submitted.
      </p>
    </section>
  );
}

/* ---------- Steps ---------- */

function StepsSection({
  eventId,
  context,
  isDesktop,
  expandedStepIds,
  onExpandedStepIdsChange,
}: {
  eventId: string;
  context: ReviewQueueItemContext;
  isDesktop: boolean;
  expandedStepIds: string[];
  onExpandedStepIdsChange: (value: string[]) => void;
}) {
  const headingId = useId();
  const rows = buildContextStepRows(context.steps);
  const fileIndex = indexContextFiles(context.files);

  return (
    <section aria-labelledby={headingId} className="py-5">
      <SectionHeading id={headingId} icon={ListChecks}>
        Workflow steps
      </SectionHeading>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">This event has no workflow steps.</p>
      ) : (
        <Accordion
          type="multiple"
          value={expandedStepIds}
          onValueChange={onExpandedStepIdsChange}
          className="space-y-2"
        >
          {rows.map((row) =>
            row.kind === "submitted" && row.step.submission ? (
              <SubmittedStepItem
                key={row.step.stepId}
                eventId={eventId}
                row={row}
                submission={row.step.submission}
                fileIndex={fileIndex}
                isDesktop={isDesktop}
              />
            ) : (
              <StaticStepRow key={row.step.stepId} row={row} isDesktop={isDesktop} />
            ),
          )}
        </Accordion>
      )}
    </section>
  );
}

function StepTitle({ row }: { row: ContextStepRow }) {
  return (
    <span className="text-sm font-medium break-words [overflow-wrap:anywhere]">
      {row.number}. {row.step.title}
    </span>
  );
}

function StaticStepRow({
  row,
  isDesktop,
}: {
  row: ContextStepRow;
  isDesktop: boolean;
}) {
  const isUnderReview = row.kind === "under-review";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        isUnderReview && "bg-muted/40",
      )}
    >
      <StepTitle row={row} />
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        {isUnderReview ? (
          <>
            <Badge variant="secondary">Being reviewed</Badge>
            <span>{isDesktop ? "shown on the left" : "shown in the main view"}</span>
          </>
        ) : (
          <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
        )}
      </div>
    </div>
  );
}

function SubmittedStepItem({
  eventId,
  row,
  submission,
  fileIndex,
  isDesktop,
}: {
  eventId: string;
  row: ContextStepRow;
  submission: ReviewContextSubmission;
  fileIndex: ContextFileIndex;
  isDesktop: boolean;
}) {
  const submittedAt = new Date(submission.submittedAt);
  const editedCount = submission.editedFields?.length ?? 0;

  return (
    // `last:border-b` restores the bottom border AccordionItem strips from the
    // last item (`last:border-b-0`), which this boxed style needs.
    <AccordionItem value={row.step.stepId} className="rounded-md border px-3 last:border-b">
      <AccordionTrigger className="py-2 hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <StepTitle row={row} />
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal">
            <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
            {!Number.isNaN(submittedAt.getTime()) && (
              <span>Submitted {submittedAt.toLocaleDateString("en-GB")}</span>
            )}
            {editedCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <PencilLine className="h-3 w-3" aria-hidden="true" />
                {editedCount} edited by staff
              </span>
            )}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        {/* Keyed by submission so no per-answer UI state (open previews,
            fetched URLs) survives a switch to another applicant. */}
        <SubmittedStepAnswers
          key={submission.submissionVersionId}
          eventId={eventId}
          stepId={row.step.stepId}
          submission={submission}
          fileIndex={fileIndex}
          isDesktop={isDesktop}
        />
      </AccordionContent>
    </AccordionItem>
  );
}

/** Rendered only while its accordion item is expanded. */
function SubmittedStepAnswers({
  eventId,
  stepId,
  submission,
  fileIndex,
  isDesktop,
}: {
  eventId: string;
  stepId: string;
  submission: ReviewContextSubmission;
  fileIndex: ContextFileIndex;
  isDesktop: boolean;
}) {
  const entries = buildOrderedAnswerEntries(
    submission.formDefinition,
    submission.answers,
  );
  const groups = groupAnswerEntriesBySection(entries);
  const editedFields = buildEditedFieldMap(submission.editedFields);
  // Tooltips need a hover-capable pointer; touch screens (any width) get the
  // original value inline instead.
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)");

  // View-only: files render through the preview component, never through
  // FileAnswerLinks/verification (the union type forbids passing both).
  const renderFile = (ref: FileAnswerRef) => {
    const meta = resolveContextFileMeta(fileIndex, stepId, ref);
    return (
      <ContextFilePreview
        // A different file must never inherit an open preview (and its signed
        // URL) from the previous applicant's file in the same position.
        key={meta.fileObjectId}
        eventId={eventId}
        fileObjectId={meta.fileObjectId}
        filename={meta.filename}
        sizeBytes={meta.sizeBytes}
        mimeType={meta.mimeType}
      />
    );
  };

  const renderEntry = (entry: AnswerEntry) => {
    const isEdited = editedFields.has(entry.key);
    const originalText = isEdited
      ? describeAnswerValue(
          submission.formDefinition,
          entry.key,
          editedFields.get(entry.key),
        )
      : null;
    const isLongOriginal =
      originalText !== null &&
      originalText.length > ORIGINAL_TOOLTIP_MAX_LENGTH;
    const showOriginalInline =
      originalText !== null && (!isDesktop || !canHover || isLongOriginal);

    return (
      <div key={entry.key} className={cn(entry.hiddenByLogic && "opacity-70")}>
        <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium uppercase tracking-wider">
          <span className="break-words [overflow-wrap:anywhere]" title={entry.key}>
            {entry.label}
          </span>
          {entry.isRequired && (
            <span
              className="text-destructive text-sm leading-none"
              aria-label="Required field"
              title="Required"
            >
              *
            </span>
          )}
          {originalText !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="info"
                  tabIndex={0}
                  className="cursor-default tracking-normal normal-case"
                >
                  <PencilLine aria-hidden="true" />
                  Edited by staff
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs break-words [overflow-wrap:anywhere]">
                Originally submitted:{" "}
                {isLongOriginal
                  ? `${originalText.slice(0, ORIGINAL_TOOLTIP_MAX_LENGTH)}… (full value below)`
                  : originalText}
              </TooltipContent>
            </Tooltip>
          )}
          {entry.hiddenByLogic && (
            <span className="text-[11px] font-normal tracking-normal normal-case">
              Hidden by form conditions
            </span>
          )}
        </div>
        <div className="text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
          {renderAnswerEntryValue(entry, { eventId, renderFile })}
        </div>
        {showOriginalInline && (
          // Touch screens can't hover the tooltip, and long originals don't
          // fit in one; show the original inline.
          <p className="text-muted-foreground mt-1 text-xs break-words [overflow-wrap:anywhere]">
            Originally submitted: {originalText}
          </p>
        )}
      </div>
    );
  };

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No answers in this submission.</p>
    );
  }

  if (groups.length > 1) {
    return (
      <div className="space-y-5">
        {groups.map((group, groupIndex) => (
          <section key={`${groupIndex}:${group.title}`} className="space-y-3">
            <h4 className="text-foreground border-b pb-1 text-xs font-semibold">
              {group.title}
            </h4>
            {group.entries.map(renderEntry)}
          </section>
        ))}
      </div>
    );
  }

  return <div className="space-y-3">{entries.map(renderEntry)}</div>;
}

/* ---------- Notes ---------- */

function NotesSection({
  notes,
  composer,
}: {
  notes: ReviewContextNote[];
  composer: ReactNode;
}) {
  const headingId = useId();
  const list = Array.isArray(notes) ? notes : [];

  return (
    <section aria-labelledby={headingId} className="pt-5">
      <SectionHeading
        id={headingId}
        icon={StickyNote}
        trailing={
          list.length > 0 ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {list.length}
            </span>
          ) : null
        }
      >
        Internal notes
      </SectionHeading>
      {composer && <div className="mb-3">{composer}</div>}
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm">No internal notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((note) => (
            <li key={note.id} className="bg-muted/30 rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span
                  className={cn(
                    "font-medium break-words",
                    !note.authorName && "text-muted-foreground",
                  )}
                >
                  {getNoteAuthorLabel(note)}
                </span>
                {note.createdAt && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <time
                        dateTime={note.createdAt}
                        tabIndex={0}
                        className="text-muted-foreground cursor-default tabular-nums"
                      >
                        {formatTimeAgo(note.createdAt)}
                      </time>
                    </TooltipTrigger>
                    <TooltipContent>{formatExactTimestamp(note.createdAt)}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                {note.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteComposer({
  value,
  onChange,
  onSubmit,
  isSaving,
  isStale,
  isDisabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSaving: boolean;
  /** Shown data still belongs to the previous applicant: block typing so text can't land on their draft. */
  isStale: boolean;
  /** Another save is in flight, or the shown data belongs to the previous applicant. */
  isDisabled: boolean;
}) {
  const textareaId = useId();
  const hintId = useId();
  const canSubmit = value.trim().length > 0 && !isSaving && !isDisabled;

  return (
    <div className="space-y-2">
      <label htmlFor={textareaId} className="sr-only">
        New internal note
      </label>
      <Textarea
        id={textareaId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }
        }}
        maxLength={INTERNAL_NOTE_CONTENT_MAX_LENGTH}
        rows={2}
        readOnly={isSaving || isStale}
        aria-disabled={isStale || undefined}
        placeholder="Add a note for other staff…"
        aria-describedby={hintId}
        className="min-h-16 text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={hintId} className="text-muted-foreground text-xs">
          Staff only. Line breaks aren&apos;t kept.{" "}
          <span className="tabular-nums">
            {value.length}/{INTERNAL_NOTE_CONTENT_MAX_LENGTH}
          </span>
        </p>
        <Button type="button" size="sm" onClick={onSubmit} disabled={!canSubmit}>
          {isSaving ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Add note
        </Button>
      </div>
    </div>
  );
}
