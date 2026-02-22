"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Reorder } from "framer-motion";
import {
  Plus,
  GripVertical,
  Trash2,
  Settings,
  Save,
  Loader2,
  Workflow as WorkflowIcon,
  CircleHelp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader, ConfirmDialog, EmptyState } from "@/components/shared";
import { ApiError, apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

type StepCategory = "APPLICATION" | "CONFIRMATION" | "INFO_ONLY";
type UnlockPolicy =
  | "AUTO_AFTER_PREV_SUBMITTED"
  | "AFTER_PREV_APPROVED"
  | "AFTER_DECISION_ACCEPTED"
  | "DATE_BASED"
  | "ADMIN_MANUAL";
type RejectBehavior = "FINAL" | "RESUBMIT_ALLOWED";
type SensitivityLevel = "NORMAL" | "SENSITIVE";

interface WorkflowStep {
  id: string;
  title: string;
  category: StepCategory;
  stepIndex: number;
  instructions: string;
  unlockPolicy: UnlockPolicy;
  unlockAt?: string;
  reviewRequired: boolean;
  rejectBehavior: RejectBehavior;
  strictGating: boolean;
  deadlineAt?: string;
  formVersionId?: string | null;
  sensitivityLevel: SensitivityLevel;
}

interface FormVersionOption {
  id: string;
  label: string;
}

function normalizeCategory(rawCategory: unknown): StepCategory {
  const value =
    typeof rawCategory === "string"
      ? rawCategory.trim().toUpperCase()
      : "APPLICATION";

  if (value === "CONFIRMATION") return "CONFIRMATION";
  if (value === "INFO_ONLY") return "INFO_ONLY";
  return "APPLICATION";
}

function normalizeUnlockPolicy(rawPolicy: unknown): UnlockPolicy {
  const value =
    typeof rawPolicy === "string"
      ? rawPolicy.trim().toUpperCase()
      : "AUTO_AFTER_PREV_SUBMITTED";

  if (
    value === "AFTER_PREV_APPROVED" ||
    value === "AFTER_DECISION_ACCEPTED" ||
    value === "DATE_BASED" ||
    value === "ADMIN_MANUAL"
  ) {
    return value;
  }

  return "AUTO_AFTER_PREV_SUBMITTED";
}

function normalizeRejectBehavior(rawBehavior: unknown): RejectBehavior {
  const value =
    typeof rawBehavior === "string" ? rawBehavior.trim().toUpperCase() : "";

  if (value === "FINAL" || value === "REJECT_FINAL") return "FINAL";
  if (value === "RESUBMIT_ALLOWED" || value === "REJECT_RESUBMIT_ALLOWED") {
    return "RESUBMIT_ALLOWED";
  }

  return "RESUBMIT_ALLOWED";
}

function normalizeSensitivityLevel(rawLevel: unknown): SensitivityLevel {
  const value =
    typeof rawLevel === "string" ? rawLevel.trim().toUpperCase() : "";
  return value === "SENSITIVE" ? "SENSITIVE" : "NORMAL";
}

function toLocalDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toNullableIsoDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeStep(raw: any): WorkflowStep {
  const instructionsRich = raw?.instructionsRich;
  const instructions =
    typeof instructionsRich === "string"
      ? instructionsRich
      : typeof instructionsRich?.html === "string"
        ? instructionsRich.html
        : "";

  return {
    id: String(raw?.id ?? `temp_${Date.now()}`),
    title: String(raw?.title ?? "Untitled Step"),
    category: normalizeCategory(raw?.category),
    stepIndex: Number(raw?.stepIndex ?? raw?.order ?? 0),
    instructions,
    unlockPolicy: normalizeUnlockPolicy(raw?.unlockPolicy),
    unlockAt: toLocalDateTimeInput(raw?.unlockAt),
    reviewRequired: Boolean(raw?.reviewRequired),
    rejectBehavior: normalizeRejectBehavior(raw?.rejectBehavior),
    strictGating:
      typeof raw?.strictGating === "boolean" ? raw.strictGating : true,
    deadlineAt: toLocalDateTimeInput(raw?.deadlineAt),
    formVersionId: raw?.formVersionId ?? null,
    sensitivityLevel: normalizeSensitivityLevel(raw?.sensitivityLevel),
  };
}

function toApiPayload(step: WorkflowStep) {
  return {
    title: step.title,
    category: step.category,
    instructionsRich: step.instructions ? { html: step.instructions } : undefined,
    unlockPolicy: step.unlockPolicy,
    unlockAt: toNullableIsoDateTime(step.unlockAt),
    reviewRequired: step.reviewRequired,
    rejectBehavior: step.rejectBehavior,
    strictGating: step.strictGating,
    deadlineAt: toNullableIsoDateTime(step.deadlineAt),
    formVersionId: step.formVersionId || null,
    sensitivityLevel: step.sensitivityLevel,
  };
}

function extractDataArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function SettingHelpLabel({
  label,
  helpText,
}: {
  label: string;
  helpText: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${label} help`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs leading-relaxed">
          {helpText}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function WorkflowBuilderPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();

  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [formVersionOptions, setFormVersionOptions] = useState<
    FormVersionOption[]
  >([]);
  const [removedServerStepIds, setRemovedServerStepIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [workflowRes, formsRes] = await Promise.all([
          apiClient<any>(`/events/${eventId}/workflow`),
          apiClient<any>(`/events/${eventId}/forms?limit=100`),
        ]);

        const workflowList = extractDataArray(workflowRes);
        const forms = extractDataArray(formsRes);

        const versionOptionsNested = await Promise.all(
          forms.map(async (formRaw: any) => {
            const formId = String(formRaw?.id ?? "");
            if (!formId) return [];

            try {
              const versionsRes = await apiClient<any>(
                `/events/${eventId}/forms/${formId}/versions`
              );
              const versions = extractDataArray(versionsRes);
              const formName = String(
                formRaw?.name ?? formRaw?.title ?? "Untitled Form"
              );

              return versions
                .filter((versionRaw: any) => versionRaw?.id)
                .map((versionRaw: any) => ({
                  id: String(versionRaw.id),
                  label: `${formName} (v${Number(versionRaw?.versionNumber ?? 0)})`,
                }));
            } catch {
              return [];
            }
          })
        );

        if (cancelled) return;

        setSteps(
          workflowList
            .map(normalizeStep)
            .sort((a, b) => a.stepIndex - b.stepIndex)
        );
        setFormVersionOptions(
          versionOptionsNested.flat().sort((a, b) => a.label.localeCompare(b.label))
        );
        setRemovedServerStepIds([]);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load workflow.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function addStep() {
    const newStep: WorkflowStep = {
      id: `temp_${Date.now()}`,
      title: `Step ${steps.length + 1}`,
      category: "APPLICATION",
      stepIndex: steps.length,
      unlockPolicy: "AUTO_AFTER_PREV_SUBMITTED",
      unlockAt: "",
      reviewRequired: false,
      rejectBehavior: "RESUBMIT_ALLOWED",
      strictGating: true,
      deadlineAt: "",
      instructions: "",
      formVersionId: null,
      sensitivityLevel: "NORMAL",
    };
    setSteps([...steps, newStep]);
  }

  function updateStep(id: string, updates: Partial<WorkflowStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }

  function removeStep(id: string) {
    setSteps((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, stepIndex: i }))
    );
    if (!id.startsWith("temp_")) {
      setRemovedServerStepIds((prev) =>
        prev.includes(id) ? prev : [...prev, id]
      );
    }
    setDeleteTarget(null);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
      const serverIds: string[] = [];

      for (const stepId of removedServerStepIds) {
        try {
          await apiClient(`/events/${eventId}/workflow/steps/${stepId}`, {
            method: "DELETE",
            csrfToken: csrfToken ?? undefined,
          });
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) {
            throw error;
          }
        }
      }
      setRemovedServerStepIds([]);

      for (const s of ordered) {
        const payload = toApiPayload(s);
        if (s.id.startsWith("temp_")) {
          const res = await apiClient<any>(`/events/${eventId}/workflow/steps`, {
            method: "POST",
            body: payload,
            csrfToken: csrfToken ?? undefined,
          });
          const created = res?.data ?? res;
          serverIds.push(String(created?.id));
        } else {
          await apiClient(`/events/${eventId}/workflow/steps/${s.id}`, {
            method: "PATCH",
            body: payload,
            csrfToken: csrfToken ?? undefined,
          });
          serverIds.push(s.id);
        }
      }

      await apiClient(`/events/${eventId}/workflow/reorder`, {
        method: "PUT",
        body: { stepIds: serverIds },
        csrfToken: csrfToken ?? undefined,
      });

      toast.success("Workflow saved!");

      const res = await apiClient<any>(`/events/${eventId}/workflow`);
      const list = extractDataArray(res);
      setSteps(
        list.map(normalizeStep).sort((a, b) => a.stepIndex - b.stepIndex)
      );
      setRemovedServerStepIds([]);
    } catch (error: any) {
      toast.error(
        typeof error?.message === "string"
          ? error.message
          : "Failed to save workflow."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Workflow" />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading workflow...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Workflow Builder" description="Define the steps applicants go through">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Save workflow
        </Button>
      </PageHeader>

      {steps.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No steps yet"
          description="Add your first workflow step to get started."
          actionLabel="Add step"
          onAction={addStep}
        />
      ) : (
        <Reorder.Group
          axis="y"
          values={steps}
          onReorder={(newOrder) =>
            setSteps(newOrder.map((s, i) => ({ ...s, stepIndex: i })))
          }
          className="space-y-3"
        >
          {steps.map((step, index) => {
            const hasKnownAttachedForm =
              !step.formVersionId ||
              formVersionOptions.some((opt) => opt.id === step.formVersionId);

            return (
              <Reorder.Item key={step.id} value={step} className="list-none">
                <Card className="border-2 border-dashed hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-sm font-bold">
                        {index + 1}
                      </div>
                      <Input
                        value={step.title}
                        onChange={(e) => updateStep(step.id, { title: e.target.value })}
                        className="font-medium flex-1"
                        placeholder="Step title..."
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(step.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <Accordion type="single" collapsible>
                      <AccordionItem value="config" className="border-none">
                        <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
                          <Settings className="mr-2 h-3.5 w-3.5" />
                          Configuration
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <SettingHelpLabel
                                label="Category"
                                helpText="Application is a normal submission step. Confirmation is typically used after decision outcomes. Info-only is read-only content and does not require a form."
                              />
                              <Select
                                value={step.category}
                                onValueChange={(v) =>
                                  updateStep(step.id, {
                                    category: v as StepCategory,
                                    formVersionId:
                                      v === "INFO_ONLY"
                                        ? null
                                        : step.formVersionId ?? null,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="APPLICATION">Application</SelectItem>
                                  <SelectItem value="CONFIRMATION">Confirmation</SelectItem>
                                  <SelectItem value="INFO_ONLY">Info only</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <SettingHelpLabel
                                label="Unlock policy"
                                helpText="Controls when this step unlocks: after previous submission, after previous approval, after accepted decision publication, at a date/time, or manual staff unlock."
                              />
                              <Select
                                value={step.unlockPolicy}
                                onValueChange={(v) =>
                                  updateStep(step.id, { unlockPolicy: v as UnlockPolicy })
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="AUTO_AFTER_PREV_SUBMITTED">
                                    After previous submitted
                                  </SelectItem>
                                  <SelectItem value="AFTER_PREV_APPROVED">
                                    After previous approved
                                  </SelectItem>
                                  <SelectItem value="AFTER_DECISION_ACCEPTED">
                                    After decision accepted
                                  </SelectItem>
                                  <SelectItem value="DATE_BASED">Date based</SelectItem>
                                  <SelectItem value="ADMIN_MANUAL">Manual</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <SettingHelpLabel
                                label="Unlock date (for DATE_BASED)"
                                helpText="Used only when unlock policy is Date based. This step stays locked until this date/time."
                              />
                              <Input
                                type="datetime-local"
                                value={step.unlockAt ?? ""}
                                onChange={(e) =>
                                  updateStep(step.id, { unlockAt: e.target.value })
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <SettingHelpLabel
                                label="Deadline"
                                helpText="Applicants cannot submit this step after the deadline."
                              />
                              <Input
                                type="datetime-local"
                                value={step.deadlineAt ?? ""}
                                onChange={(e) =>
                                  updateStep(step.id, { deadlineAt: e.target.value })
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <SettingHelpLabel
                              label="Instructions (HTML)"
                              helpText="Instructions shown to applicants for this step. Saved as HTML content."
                            />
                            <Textarea
                              value={step.instructions}
                              onChange={(e) =>
                                updateStep(step.id, {
                                  instructions: e.target.value,
                                })
                              }
                              rows={3}
                              placeholder="Instructions shown to the applicant..."
                              className="text-xs"
                            />
                          </div>

                          <div className="space-y-2">
                            <SettingHelpLabel
                              label="Published form version"
                              helpText="Attaches a published form schema to this step. Non-info steps without a form cannot collect applicant submissions."
                            />
                            <Select
                              value={step.formVersionId ?? "__none__"}
                              onValueChange={(v) =>
                                updateStep(step.id, {
                                  formVersionId: v === "__none__" ? null : v,
                                })
                              }
                              disabled={step.category === "INFO_ONLY"}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select published form version" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">No form attached</SelectItem>
                                {step.formVersionId && !hasKnownAttachedForm ? (
                                  <SelectItem value={step.formVersionId}>
                                    Unknown version ({step.formVersionId.slice(0, 8)}...)
                                  </SelectItem>
                                ) : null}
                                {formVersionOptions.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {step.category === "INFO_ONLY" ? (
                              <p className="text-[11px] text-muted-foreground">
                                Info-only steps do not need an attached form.
                              </p>
                            ) : formVersionOptions.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">
                                No published forms found. Publish a form first.
                              </p>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center justify-between">
                              <SettingHelpLabel
                                label="Review required"
                                helpText="Sends this step into reviewer workflows. Enable this if a later step unlocks only after previous approval."
                              />
                              <Switch
                                checked={step.reviewRequired}
                                onCheckedChange={(v) =>
                                  updateStep(step.id, { reviewRequired: v })
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <SettingHelpLabel
                                label="Strict gating"
                                helpText="When enabled, this step unlocks only after the previous step is submitted or approved. If this step goes to revision, downstream steps are re-locked."
                              />
                              <Switch
                                checked={step.strictGating}
                                onCheckedChange={(v) =>
                                  updateStep(step.id, { strictGating: v })
                                }
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <SettingHelpLabel
                                label="Reject behavior"
                                helpText="Allow resubmission keeps the step recoverable after rejection. Final rejection marks the step final and locks all downstream steps."
                              />
                              <Select
                                value={step.rejectBehavior}
                                onValueChange={(v) =>
                                  updateStep(step.id, {
                                    rejectBehavior: v as RejectBehavior,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="RESUBMIT_ALLOWED">
                                    Allow resubmission
                                  </SelectItem>
                                  <SelectItem value="FINAL">
                                    Final rejection
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <SettingHelpLabel
                                label="Sensitivity"
                                helpText="Classifies this step as normal or sensitive for downstream access and handling controls."
                              />
                              <Select
                                value={step.sensitivityLevel}
                                onValueChange={(v) =>
                                  updateStep(step.id, {
                                    sensitivityLevel: v as SensitivityLevel,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="NORMAL">Normal</SelectItem>
                                  <SelectItem value="SENSITIVE">Sensitive</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}

      <Button variant="outline" onClick={addStep} className="w-full border-dashed">
        <Plus className="mr-1.5 h-4 w-4" />
        Add step
      </Button>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete step?"
        description="This will remove the step from the workflow. Existing submissions will not be deleted."
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && removeStep(deleteTarget)}
        variant="destructive"
      />
    </div>
  );
}
