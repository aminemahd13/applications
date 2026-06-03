"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EDUCATION_LEVEL_OPTIONS } from "@event-platform/shared";
import {
  FieldAnswerCriterion,
  type FieldAnswerValue,
  type FilterableFieldStep,
} from "./field-answer-criterion";
import type { ApplicationsFieldAnswerMatcher } from "@/lib/applications-filters";

/* ============================================================
 * UI model. A rule is intentionally FLAT: a deadline + an
 * ALL/ANY toggle over a plain list of conditions (no nested
 * groups). Converters at the bottom map to/from the API shape,
 * which stores the conditions as a single flat group.
 * ========================================================== */

export type ProfileField =
  | "education_level"
  | "country"
  | "city"
  | "institution";

type UiMatcher = ApplicationsFieldAnswerMatcher;

interface UiProfileCondition {
  _id: string;
  kind: "profile";
  field: ProfileField;
  matcher: UiMatcher;
  values: string[];
}

interface UiFieldCondition {
  _id: string;
  kind: "field_answer";
  stepId: string;
  fieldKey: string;
  matcher: UiMatcher;
  values: string[];
}

type UiCondition = UiProfileCondition | UiFieldCondition;

export interface UiDeadlineRule {
  _id: string;
  mode: "all" | "any";
  conditions: UiCondition[];
  deadlineAt: string; // datetime-local input string
}

const PROFILE_FIELD_LABELS: Record<ProfileField, string> = {
  education_level: "Education level",
  country: "Country",
  city: "City",
  institution: "Institution",
};

/* ---------- id + datetime helpers ---------- */

let seq = 0;
function nid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  seq += 1;
  return `n${seq}`;
}

function isoToLocalInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/* ---------- factories ---------- */

function emptyProfileCondition(): UiProfileCondition {
  return {
    _id: nid(),
    kind: "profile",
    field: "education_level",
    matcher: "any",
    values: [],
  };
}

function emptyFieldCondition(): UiFieldCondition {
  return {
    _id: nid(),
    kind: "field_answer",
    stepId: "",
    fieldKey: "",
    matcher: "any",
    values: [],
  };
}

export function createEmptyDeadlineRule(): UiDeadlineRule {
  return {
    _id: nid(),
    mode: "all",
    conditions: [emptyProfileCondition()],
    deadlineAt: "",
  };
}

/* ============================================================
 * Single condition row
 * ========================================================== */

function ConditionRow({
  condition,
  fieldSteps,
  onChange,
  onRemove,
}: {
  condition: UiCondition;
  fieldSteps: FilterableFieldStep[];
  onChange: (next: UiCondition) => void;
  onRemove: () => void;
}) {
  const profileFields: ProfileField[] = [
    "education_level",
    "country",
    "city",
    "institution",
  ];

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Select
          value={condition.kind}
          onValueChange={(v) =>
            onChange(
              v === "profile"
                ? { ...emptyProfileCondition(), _id: condition._id }
                : { ...emptyFieldCondition(), _id: condition._id },
            )
          }
        >
          <SelectTrigger className="h-8 w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="profile">Applicant profile</SelectItem>
            <SelectItem value="field_answer">Answer to a question</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-destructive hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove condition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {condition.kind === "profile" ? (
        <div className="space-y-3">
          <Select
            value={condition.field}
            onValueChange={(v) => {
              const field = v as ProfileField;
              onChange({
                ...condition,
                field,
                matcher: field === "education_level" ? "any" : "contains",
                values: [],
              });
            }}
          >
            <SelectTrigger className="h-8 w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {profileFields.map((f) => (
                <SelectItem key={f} value={f}>
                  {PROFILE_FIELD_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {condition.field === "education_level" ? (
            <>
              <Select
                value={condition.matcher}
                onValueChange={(v) =>
                  onChange({ ...condition, matcher: v as UiMatcher })
                }
              >
                <SelectTrigger className="h-8 w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">is any of</SelectItem>
                  <SelectItem value="none">is none of</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid gap-2 sm:grid-cols-2">
                {EDUCATION_LEVEL_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={condition.values.includes(option)}
                      onCheckedChange={() =>
                        onChange({
                          ...condition,
                          values: condition.values.includes(option)
                            ? condition.values.filter((x) => x !== option)
                            : [...condition.values, option],
                        })
                      }
                    />
                    <span className="min-w-0 break-words">{option}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Select
                value={condition.matcher}
                onValueChange={(v) =>
                  onChange({ ...condition, matcher: v as UiMatcher })
                }
              >
                <SelectTrigger className="h-8 w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">contains</SelectItem>
                  <SelectItem value="equals">equals</SelectItem>
                  <SelectItem value="not_contains">does not contain</SelectItem>
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {PROFILE_FIELD_LABELS[condition.field]} value
                </Label>
                <Input
                  className="h-8"
                  value={condition.values[0] ?? ""}
                  placeholder="Text to match..."
                  onChange={(e) =>
                    onChange({
                      ...condition,
                      values: e.target.value ? [e.target.value] : [],
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>
      ) : fieldSteps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No earlier step has questions to reference yet. Attach a form with
          questions to an earlier step and save the workflow, then its answers
          can be used here. (For education level, country, etc., use{" "}
          <span className="font-medium">Applicant profile</span> instead.)
        </p>
      ) : (
        <FieldAnswerCriterion
          steps={fieldSteps}
          value={{
            stepId: condition.stepId,
            fieldKey: condition.fieldKey,
            matcher: condition.matcher,
            values: condition.values,
          }}
          onChange={(next: FieldAnswerValue) =>
            onChange({
              ...condition,
              stepId: next.stepId,
              fieldKey: next.fieldKey,
              matcher: next.matcher,
              values: next.values,
            })
          }
        />
      )}
    </div>
  );
}

/* ============================================================
 * Top-level rules editor
 * ========================================================== */

export function DeadlineRulesEditor({
  value,
  fieldSteps,
  onChange,
}: {
  value: UiDeadlineRule[];
  fieldSteps: FilterableFieldStep[];
  onChange: (next: UiDeadlineRule[]) => void;
}) {
  function updateRule(id: string, next: UiDeadlineRule) {
    onChange(value.map((r) => (r._id === id ? next : r)));
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No conditional deadlines. The base deadline above applies to everyone.
        </p>
      ) : (
        value.map((rule, index) => (
          <div
            key={rule._id}
            className="rounded-md border border-primary/20 bg-primary/[0.02] p-3 space-y-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Rule {index + 1} deadline
                </Label>
                <Input
                  type="datetime-local"
                  className="h-8 text-xs"
                  value={rule.deadlineAt}
                  onChange={(e) =>
                    updateRule(rule._id, {
                      ...rule,
                      deadlineAt: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex items-center gap-1.5 pb-1">
                <span className="text-[11px] text-muted-foreground">
                  applies when
                </span>
                <Select
                  value={rule.mode}
                  onValueChange={(v) =>
                    updateRule(rule._id, { ...rule, mode: v as "all" | "any" })
                  }
                >
                  <SelectTrigger className="h-7 w-[86px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ALL</SelectItem>
                    <SelectItem value="any">ANY</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">
                  conditions match
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8 text-destructive hover:text-destructive"
                onClick={() =>
                  onChange(value.filter((r) => r._id !== rule._id))
                }
                aria-label={`Remove rule ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {rule.conditions.map((condition) => (
                <ConditionRow
                  key={condition._id}
                  condition={condition}
                  fieldSteps={fieldSteps}
                  onChange={(next) =>
                    updateRule(rule._id, {
                      ...rule,
                      conditions: rule.conditions.map((c) =>
                        c._id === condition._id ? next : c,
                      ),
                    })
                  }
                  onRemove={() =>
                    updateRule(rule._id, {
                      ...rule,
                      conditions: rule.conditions.filter(
                        (c) => c._id !== condition._id,
                      ),
                    })
                  }
                />
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                updateRule(rule._id, {
                  ...rule,
                  conditions: [...rule.conditions, emptyProfileCondition()],
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Add condition
            </Button>
          </div>
        ))
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, createEmptyDeadlineRule()])}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Add deadline rule
      </Button>
    </div>
  );
}

/* ============================================================
 * API <-> UI converters
 * ========================================================== */

/** Recursively collect leaf conditions from an API condition node. */
function collectConditions(node: any): UiCondition[] {
  if (!node || typeof node !== "object") return [];
  if (node.type === "group") {
    return Array.isArray(node.children)
      ? node.children.flatMap(collectConditions)
      : [];
  }
  if (node.kind === "field_answer") {
    return [
      {
        _id: nid(),
        kind: "field_answer",
        stepId: String(node.stepId ?? ""),
        fieldKey: String(node.fieldKey ?? ""),
        matcher: (node.matcher ?? "any") as UiMatcher,
        values: Array.isArray(node.values) ? node.values.map(String) : [],
      },
    ];
  }
  return [
    {
      _id: nid(),
      kind: "profile",
      field: (["education_level", "country", "city", "institution"].includes(
        node.field,
      )
        ? node.field
        : "education_level") as ProfileField,
      matcher: (node.matcher ?? "any") as UiMatcher,
      values: Array.isArray(node.values) ? node.values.map(String) : [],
    },
  ];
}

export function deadlineRulesFromApi(raw: unknown): UiDeadlineRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((rule: any) => ({
    _id: nid(),
    mode: rule?.condition?.mode === "any" ? "any" : "all",
    conditions: collectConditions(rule?.condition),
    deadlineAt: isoToLocalInput(rule?.deadlineAt),
  }));
}

function conditionToApi(condition: UiCondition): any | null {
  if (condition.values.length === 0) return null;
  if (condition.kind === "field_answer") {
    if (!condition.stepId || !condition.fieldKey) return null;
    return {
      kind: "field_answer",
      stepId: condition.stepId,
      fieldKey: condition.fieldKey,
      matcher: condition.matcher,
      values: condition.values,
    };
  }
  return {
    kind: "profile",
    field: condition.field,
    matcher: condition.matcher,
    values: condition.values,
  };
}

/**
 * Serialize UI rules to the API shape. Rules without a deadline or with no
 * complete condition are dropped (incomplete), so partially-filled rows never
 * reach the server.
 */
export function deadlineRulesToApi(
  rules: UiDeadlineRule[],
): Array<{ condition: any; deadlineAt: string }> {
  const out: Array<{ condition: any; deadlineAt: string }> = [];
  for (const rule of rules) {
    const deadlineAt = localInputToIso(rule.deadlineAt);
    if (!deadlineAt) continue;
    const children = rule.conditions
      .map(conditionToApi)
      .filter((c): c is any => c !== null);
    if (children.length === 0) continue;
    out.push({
      condition: { type: "group", mode: rule.mode, children },
      deadlineAt,
    });
  }
  return out;
}
