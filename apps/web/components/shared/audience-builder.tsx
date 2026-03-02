"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { ChevronDown, ChevronRight, Loader2, Users, X } from "lucide-react";
import type { RecipientFilter } from "@event-platform/shared";
import { DecisionStatus, StepStatus } from "@event-platform/shared";

interface WorkflowStep {
  id: string;
  title: string;
  stepIndex: number;
}

interface AudienceBuilderProps {
  eventId: string;
  filter: RecipientFilter;
  onChange: (filter: RecipientFilter) => void;
  previewCount?: number | null;
  isLoadingPreview?: boolean;
}

const DECISION_STATUSES = [
  { value: DecisionStatus.NONE, label: "No decision" },
  { value: DecisionStatus.ACCEPTED, label: "Accepted" },
  { value: DecisionStatus.WAITLISTED, label: "Waitlisted" },
  { value: DecisionStatus.REJECTED, label: "Rejected" },
];

const STEP_STATUSES = [
  { value: StepStatus.LOCKED, label: "Locked" },
  { value: StepStatus.UNLOCKED, label: "Unlocked" },
  { value: StepStatus.SUBMITTED, label: "Submitted" },
  { value: StepStatus.NEEDS_REVISION, label: "Needs revision" },
  { value: StepStatus.APPROVED, label: "Approved" },
  { value: StepStatus.REJECTED_FINAL, label: "Rejected (final)" },
];

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
}: {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
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
          placeholder="Type and press Enter..."
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

export function AudienceBuilder({
  eventId,
  filter,
  onChange,
  previewCount,
  isLoadingPreview,
}: AudienceBuilderProps) {
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);

  useEffect(() => {
    apiClient<{ data?: Array<any> }>(`/events/${eventId}/workflow/steps`)
      .then((res) => {
        setWorkflowSteps(
          (res.data ?? []).map((s: any) => ({
            id: s.id,
            title: s.title,
            stepIndex: s.stepIndex ?? s.step_index ?? 0,
          }))
        );
      })
      .catch(() => {});
  }, [eventId]);

  const update = useCallback(
    (partial: Partial<RecipientFilter>) => {
      onChange({ ...filter, ...partial });
    },
    [filter, onChange],
  );

  const toggleDecisionStatus = useCallback(
    (status: DecisionStatus) => {
      const current = filter.decisionStatus ?? [];
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      update({ decisionStatus: next.length > 0 ? next : undefined });
    },
    [filter.decisionStatus, update],
  );

  const toggleStepStatus = useCallback(
    (status: StepStatus) => {
      const current = filter.stepStatus ?? [];
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      update({ stepStatus: next.length > 0 ? next : undefined });
    },
    [filter.stepStatus, update],
  );

  const sortedSteps = useMemo(
    () => [...workflowSteps].sort((a, b) => a.stepIndex - b.stepIndex),
    [workflowSteps],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Audience filters</Label>
        {previewCount !== null && previewCount !== undefined && (
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

      <CollapsibleSection title="Decision status" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          {DECISION_STATUSES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={(filter.decisionStatus ?? []).includes(value)}
                onCheckedChange={() => toggleDecisionStatus(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Step filter">
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Step</Label>
            <Select
              value={filter.stepId ?? "__none__"}
              onValueChange={(v) => update({ stepId: v === "__none__" ? undefined : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any step" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Any step</SelectItem>
                {sortedSteps.map((step) => (
                  <SelectItem key={step.id} value={step.id}>
                    {step.stepIndex + 1}. {step.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filter.stepId && (
            <div className="space-y-1">
              <Label className="text-xs">Step status</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {STEP_STATUSES.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={(filter.stepStatus ?? []).includes(value)}
                      onCheckedChange={() => toggleStepStatus(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Current step">
        <Select
          value={filter.currentStepId ?? "__none__"}
          onValueChange={(v) => update({ currentStepId: v === "__none__" ? undefined : v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Any step" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Any step</SelectItem>
            {sortedSteps.map((step) => (
              <SelectItem key={step.id} value={step.id}>
                {step.stepIndex + 1}. {step.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CollapsibleSection>

      <CollapsibleSection title="Status toggles">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Has open info requests</Label>
            <Switch
              checked={filter.needsInfoOpen ?? false}
              onCheckedChange={(v) => update({ needsInfoOpen: v || undefined })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Confirmed attendance</Label>
            <Switch
              checked={filter.confirmed ?? false}
              onCheckedChange={(v) => update({ confirmed: v || undefined })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Checked in</Label>
            <Switch
              checked={filter.checkedIn ?? false}
              onCheckedChange={(v) => update({ checkedIn: v || undefined })}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Tags">
        <TagInput
          label="Has any of these tags (OR)"
          value={filter.tagsAny ?? []}
          onChange={(tags) => update({ tagsAny: tags.length > 0 ? tags : undefined })}
        />
        <TagInput
          label="Has all of these tags (AND)"
          value={filter.tagsAll ?? []}
          onChange={(tags) => update({ tagsAll: tags.length > 0 ? tags : undefined })}
        />
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
                value={(filter as any).ageMin ?? ""}
                onChange={(e) =>
                  update({ ageMin: e.target.value ? Number(e.target.value) : undefined } as any)
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
                value={(filter as any).ageMax ?? ""}
                onChange={(e) =>
                  update({ ageMax: e.target.value ? Number(e.target.value) : undefined } as any)
                }
                placeholder="e.g. 30"
              />
            </div>
          </div>
          <TagInput
            label="Country"
            value={(filter as any).country ?? []}
            onChange={(tags) => update({ country: tags.length > 0 ? tags : undefined } as any)}
          />
          <TagInput
            label="City"
            value={(filter as any).city ?? []}
            onChange={(tags) => update({ city: tags.length > 0 ? tags : undefined } as any)}
          />
          <TagInput
            label="Education level"
            value={(filter as any).educationLevel ?? []}
            onChange={(tags) =>
              update({ educationLevel: tags.length > 0 ? tags : undefined } as any)
            }
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}
