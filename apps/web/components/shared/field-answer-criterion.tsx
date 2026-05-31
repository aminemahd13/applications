"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ApplicationsFieldAnswerMatcher } from "@/lib/applications-filters";

/* ---------- Shared types (mirror GET /events/:id/workflow/field-options) ---------- */

export interface FilterableFieldOption {
  value: string;
  label: string;
}

export interface FilterableField {
  key: string;
  label: string;
  type: string; // select | multiselect | checkbox | text | textarea | number | email | phone | date
  options?: FilterableFieldOption[];
}

export interface FilterableFieldStep {
  stepId: string;
  stepTitle: string;
  stepIndex: number;
  fields: FilterableField[];
}

export interface FieldAnswerValue {
  stepId: string;
  fieldKey: string;
  matcher: ApplicationsFieldAnswerMatcher;
  values: string[];
}

const OPTION_TYPES = new Set(["select", "multiselect", "checkbox"]);

const OPTION_MATCHER_LABELS: Partial<
  Record<ApplicationsFieldAnswerMatcher, string>
> = {
  any: "is any of",
  all: "has all of",
  none: "is none of",
};
const TEXT_MATCHER_LABELS: Partial<
  Record<ApplicationsFieldAnswerMatcher, string>
> = {
  contains: "contains",
  equals: "equals",
  not_contains: "does not contain",
};

function fieldKeyFor(stepId: string, fieldKey: string): string {
  return `${stepId}::${fieldKey}`;
}

/**
 * Editor for a single "filter applicants by their answer to a question"
 * criterion. Shared by the applications advanced filter and the messaging
 * audience-builder so both behave identically.
 */
export function FieldAnswerCriterion({
  steps,
  value,
  onChange,
}: {
  steps: FilterableFieldStep[];
  value: FieldAnswerValue;
  onChange: (next: FieldAnswerValue) => void;
}) {
  const selectedField = useMemo(() => {
    const step = steps.find((s) => s.stepId === value.stepId);
    return step?.fields.find((f) => f.key === value.fieldKey) ?? null;
  }, [steps, value.stepId, value.fieldKey]);

  const fieldType = selectedField?.type ?? "";
  const isOption = OPTION_TYPES.has(fieldType);
  const isSingleOption = fieldType === "select";

  const matchers: ApplicationsFieldAnswerMatcher[] = isOption
    ? isSingleOption
      ? ["any", "none"]
      : ["any", "all", "none"]
    : ["contains", "equals", "not_contains"];

  const matcherLabels = isOption ? OPTION_MATCHER_LABELS : TEXT_MATCHER_LABELS;

  function selectField(combined: string) {
    const sep = combined.indexOf("::");
    if (sep < 0) return;
    const stepId = combined.slice(0, sep);
    const fieldKey = combined.slice(sep + 2);
    const step = steps.find((s) => s.stepId === stepId);
    const field = step?.fields.find((f) => f.key === fieldKey);
    const nextIsOption = field ? OPTION_TYPES.has(field.type) : false;
    onChange({
      stepId,
      fieldKey,
      matcher: nextIsOption ? "any" : "contains",
      values: [],
    });
  }

  function toggleOption(optionValue: string) {
    const has = value.values.includes(optionValue);
    onChange({
      ...value,
      values: has
        ? value.values.filter((v) => v !== optionValue)
        : [...value.values, optionValue],
    });
  }

  return (
    <div className="space-y-3">
      {/* Field selector (grouped by step via label prefix) */}
      <Select
        value={
          value.stepId && value.fieldKey
            ? fieldKeyFor(value.stepId, value.fieldKey)
            : "__none__"
        }
        onValueChange={(v) => v !== "__none__" && selectField(v)}
      >
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Select question" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Select question</SelectItem>
          {steps.flatMap((step) =>
            step.fields.map((field) => (
              <SelectItem
                key={fieldKeyFor(step.stepId, field.key)}
                value={fieldKeyFor(step.stepId, field.key)}
              >
                {step.stepIndex + 1}. {step.stepTitle} — {field.label}
              </SelectItem>
            )),
          )}
        </SelectContent>
      </Select>

      {selectedField && (
        <>
          {/* Matcher */}
          <Select
            value={value.matcher}
            onValueChange={(v) =>
              onChange({
                ...value,
                matcher: v as ApplicationsFieldAnswerMatcher,
              })
            }
          >
            <SelectTrigger className="h-8 w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {matchers.map((m) => (
                <SelectItem key={m} value={m}>
                  {matcherLabels[m] ?? m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Value control */}
          {isOption ? (
            (selectedField.options ?? []).length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(selectedField.options ?? []).map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={value.values.includes(option.value)}
                      onCheckedChange={() => toggleOption(option.value)}
                    />
                    <span className="min-w-0 break-words">{option.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                This question has no defined options.
              </p>
            )
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Answer text
              </Label>
              <Input
                value={value.values[0] ?? ""}
                placeholder="Text to match..."
                onChange={(e) =>
                  onChange({
                    ...value,
                    values: e.target.value ? [e.target.value] : [],
                  })
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
