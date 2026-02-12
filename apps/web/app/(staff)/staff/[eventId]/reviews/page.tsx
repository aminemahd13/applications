"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { ScrollArea } from "@/components/ui/scroll-area";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  CardSkeleton,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { renderAnswerValue } from "@/lib/render-answer-value";
import { getRequiredFieldKeySet } from "@/lib/file-answer-utils";

interface ReviewItem {
  id: string;
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  stepTitle: string;
  stepId: string;
  submissionVersionId?: string;
  status: string;
  submittedAt: string;
  answers: Record<string, unknown>;
  formDefinition?: Record<string, unknown> | null;
  previousReviews?: Array<{
    reviewerName: string;
    verdict: string;
    comment?: string;
    createdAt: string;
  }>;
}

type ReviewVerdict = "APPROVE" | "REJECT" | "REQUEST_INFO";

export default function ReviewsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepFilter, setStepFilter] = useState("all");

  // Review dialog state
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewVerdict, setReviewVerdict] = useState<ReviewVerdict | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [requestInfoFields, setRequestInfoFields] = useState("");
  const [requestInfoDeadline, setRequestInfoDeadline] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<any>(
          `/events/${eventId}/review-queue`
        );
        const list: ReviewItem[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : [];
        setQueue(list);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [eventId]);

  const stepNames = [...new Set(queue.map((r) => r.stepTitle))];
  const filtered =
    stepFilter === "all" ? queue : queue.filter((r) => r.stepTitle === stepFilter);
  const current = filtered[currentIndex];
  const requiredFieldKeys = getRequiredFieldKeySet(current?.formDefinition);

  function openReviewDialog(verdict: ReviewVerdict) {
    setReviewVerdict(verdict);
    setReviewComment("");
    setRequestInfoFields("");
    setRequestInfoDeadline("");
    setShowReviewDialog(true);
  }

  async function submitReview() {
    if (!current || !reviewVerdict) return;
    const vid = current.submissionVersionId;
    if (!vid) {
      toast.error("No submission version found for this step");
      return;
    }
    setIsSubmittingReview(true);
    try {
      await apiClient(
        `/events/${eventId}/applications/${current.applicationId}/steps/${current.stepId}/versions/${vid}/reviews`,
        {
          method: "POST",
          body: {
            outcome: reviewVerdict,
            messageToApplicant: reviewComment || undefined,
            targetFieldIds:
              reviewVerdict === "REQUEST_INFO" && requestInfoFields
                ? requestInfoFields.split(",").map((s) => s.trim())
                : undefined,
            deadline: requestInfoDeadline || undefined,
          },
          csrfToken: csrfToken ?? undefined,
        }
      );
      toast.success(
        reviewVerdict === "APPROVE"
          ? "Step approved!"
          : reviewVerdict === "REJECT"
          ? "Step rejected"
          : "Revision requested"
      );
      // Remove from queue and advance
      setQueue((prev) => prev.filter((r) => r.id !== current.id));
      if (currentIndex >= filtered.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }
    } catch {
      /* handled */
    } finally {
      setIsSubmittingReview(false);
      setShowReviewDialog(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Review Queue" />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Queue"
        description={`${queue.length} submissions awaiting review`}
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={stepFilter} onValueChange={setStepFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All steps</SelectItem>
            {stepNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length > 0
            ? `${currentIndex + 1} of ${filtered.length}`
            : "0 of 0"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All caught up!"
          description="There are no submissions waiting for review."
        />
      ) : current ? (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left: Submission content (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {current.applicantName}
                        </CardTitle>
                        <CardDescription>{current.applicantEmail}</CardDescription>
                      </div>
                      <Badge variant="secondary">{current.stepTitle}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submitted{" "}
                      {new Date(current.submittedAt).toLocaleDateString()}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[60vh]">
                      <div className="space-y-4">
                        {Object.entries(current.answers).map(([key, val]) => {
                          const isRequired = requiredFieldKeys.has(key);
                          return (
                            <div key={key}>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-2">
                                <span>{key}</span>
                                {isRequired && (
                                  <span
                                    className="text-destructive text-sm leading-none"
                                    aria-label="Required field"
                                    title="Required"
                                  >
                                    *
                                  </span>
                                )}
                              </p>
                              <div className="text-sm whitespace-pre-wrap">
                                {renderAnswerValue(val, {
                                  eventId,
                                  verification: current.submissionVersionId
                                    ? {
                                        applicationId: current.applicationId,
                                        stepId: current.stepId,
                                        submissionVersionId: current.submissionVersionId,
                                        fieldKey: key,
                                      }
                                    : undefined,
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentIndex(
                    Math.min(filtered.length - 1, currentIndex + 1)
                  )
                }
                disabled={currentIndex >= filtered.length - 1}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Right: Actions panel (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Review Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openReviewDialog("APPROVE")}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                  Approve
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openReviewDialog("REQUEST_INFO")}
                >
                  <AlertTriangle className="mr-2 h-4 w-4 text-warning" />
                  Request revision
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openReviewDialog("REJECT")}
                >
                  <XCircle className="mr-2 h-4 w-4 text-destructive" />
                  Reject
                </Button>
              </CardContent>
            </Card>

            {/* Previous reviews */}
            {current.previousReviews && current.previousReviews.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Previous Reviews</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {current.previousReviews.map((r, i) => (
                    <div key={i} className="text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.reviewerName}</span>
                        <StatusBadge status={r.verdict} />
                      </div>
                      {r.comment && (
                        <p className="text-muted-foreground">{r.comment}</p>
                      )}
                      <p className="text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : null}

      {/* Review dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewVerdict === "APPROVE"
                ? "Approve submission"
                : reviewVerdict === "REJECT"
                ? "Reject submission"
                : "Request revision"}
            </DialogTitle>
            <DialogDescription>
              {reviewVerdict === "REQUEST_INFO"
                ? "Specify which fields need revision and an optional deadline."
                : "Add an optional comment for the review."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Comment (optional)</Label>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Add a review comment..."
                rows={3}
              />
            </div>

            {reviewVerdict === "REQUEST_INFO" && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">Field IDs to revise</Label>
                  <Input
                    value={requestInfoFields}
                    onChange={(e) => setRequestInfoFields(e.target.value)}
                    placeholder="field_a, field_b (comma-separated)"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Deadline (optional)</Label>
                  <Input
                    type="date"
                    value={requestInfoDeadline}
                    onChange={(e) => setRequestInfoDeadline(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              disabled={isSubmittingReview}
              variant={
                reviewVerdict === "REJECT" ? "destructive" : "default"
              }
            >
              {isSubmittingReview && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {reviewVerdict === "APPROVE"
                ? "Approve"
                : reviewVerdict === "REJECT"
                ? "Reject"
                : "Request revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
