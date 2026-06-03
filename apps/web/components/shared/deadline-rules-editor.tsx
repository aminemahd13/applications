"use client";

import { Plus, Trash2, CornerDownRight } from "lucide-react";
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
 * UI condition-tree model (mirrors the shared DeadlineRule DTO,
 * with stable `_id`s for React keys / editing). Converters at the
 * bottom translate to/from the API shape.
 * ========================================================== */

export type ProfileField =
  | "education_level"
  | "country"
  | "city"
  | "institution";

type UiMatcher = ApplicationsFieldAnswerMatcher;

interface UiProfileLeaf {
  _id: string;
  node: "leaf";
  kind: "profile";
  field: ProfileField;
  matcher: UiMatcher;
  values: string[];
}

interface UiFieldLeaf {
  _id: string;
  node: "leaf";
  kind: "field_answer";
  stepId: string;
  fieldKey: string;
  matcher: UiMatcher;
  values: string[];
}

type UiLeaf = UiProfileLeaf | UiFieldLeaf;

interface UiGroup {
  _id: string;
  node: "group";
  mode: "all" | "any";
  negate: boolean;
  children: UiNode[];
}

type UiNode = UiGroup | UiLeaf;

export interface UiDeadlineRule {
  _id: string;
  condition: UiGroup;
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

/* ---------- empty-node factories ---------- */

function emptyGroup(): UiGroup {
  return { _id: nid(), node: "group", mode: "all", negate: false, children: [] };
}

function emptyProfileLeaf(): UiProfileLeaf {
  return {
    _id: nid(),
    node: "leaf",
    kind: "profile",
    field: "education_level",
    matcher: "any",
    values: [],
  };
}

function emptyFieldLeaf(): UiFieldLeaf {
  return {
    _id: nid(),
    node: "leaf",
    kind: "field_answer",
    stepId: "",
    fieldKey: "",
    matcher: "any",
    values: [],
  };
}

export function createEmptyDeadlineRule(): UiDeadlineRule {
  return { _id: nid(), condition: emptyGroup(), deadlineAt: "" };
}

/* ============================================================
 * Leaf editor
 * ========================================================== */

function LeafEditor({
  leaf,
  fieldSteps,
  onChange,
}: {
  leaf: UiLeaf;
  fieldSteps: FilterableFieldStep[];
  onChange: (next: UiLeaf) => void;
}) {
  const profileFields: ProfileField[] = [
    "education_level",
    "country",
    "city",
    "institution",
  ];

  return (
    <div className="space-y-3">
      {/* Source toggle: profile vs earlier answer */}
      <Select
        value={leaf.kind}
        onValueChange={(v) =>
          onChange(
            v === "profile"
              ? { ...emptyProfileLeaf(), _id: leaf._id }
              : { ...emptyFieldLeaf(), _id: leaf._id },
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

      {leaf.kind === "profile" ? (
        <div className="space-y-3">
          <Select
            value={leaf.field}
            onValueChange={(v) => {
              const field = v as ProfileField;
              const isEducation = field === "education_level";
              onChange({
                ...leaf,
                field,
                matcher: isEducation ? "any" : "contains",
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

          {leaf.field === "education_level" ? (
            <>
              <Select
                value={leaf.matcher}
                onValueChange={(v) =>
                  onChange({ ...leaf, matcher: v as UiMatcher })
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
                      checked={leaf.values.includes(option)}
                      onCheckedChange={() =>
                        onChange({
                          ...leaf,
                          values: leaf.values.includes(option)
                            ? leaf.values.filter((x) => x !== option)
                            : [...leaf.values, option],
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
                value={leaf.matcher}
                onValueChange={(v) =>
                  onChange({ ...leaf, matcher: v as UiMatcher })
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
                  {PROFILE_FIELD_LABELS[leaf.field]} value
                </Label>
                <Input
                  className="h-8"
                  value={leaf.values[0] ?? ""}
                  placeholder="Text to match..."
                  onChange={(e) =>
                    onChange({
                      ...leaf,
                      values: e.target.value ? [e.target.value] : [],
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <FieldAnswerCriterion
          steps={fieldSteps}
          value={{
            stepId: leaf.stepId,
            fieldKey: leaf.fieldKey,
            matcher: leaf.matcher,
            values: leaf.values,
          }}
          onChange={(next: FieldAnswerValue) =>
            onChange({
              ...leaf,
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
 * Group editor (recursive)
 * ========================================================== */

function GroupEditor({
  group,
  fieldSteps,
  depth,
  onChange,
  onRemove,
}: {
  group: UiGroup;
  fieldSteps: FilterableFieldStep[];
  depth: number;
  onChange: (next: UiGroup) => void;
  onRemove?: () => void;
}) {
  function updateChild(id: string, next: UiNode | null) {
    onChange({
      ...group,
      children: next
        ? group.children.map((c) => (c._id === id ? next : c))
        : group.children.filter((c) => c._id !== id),
    });
  }

  return (
    <div className="rounded-md border border-dashed p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Match</span>
        <Select
          value={group.mode}
          onValueChange={(v) =>
            onChange({ ...group, mode: v as "all" | "any" })
          }
        >
          <SelectTrigger className="h-7 w-[88px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ALL</SelectItem>
            <SelectItem value="any">ANY</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground">
          of the following
        </span>
        <label className="ml-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox
            checked={group.negate}
            onCheckedChange={(c) =>
              onChange({ ...group, negate: c === true })
            }
          />
          NOT (invert)
        </label>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove group"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {group.children.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No conditions yet — add one below.
        </p>
      ) : (
        <div className="space-y-3">
          {group.children.map((child) =>
            child.node === "group" ? (
              <GroupEditor
                key={child._id}
                group={child}
                fieldSteps={fieldSteps}
                depth={depth + 1}
                onChange={(next) => updateChild(child._id, next)}
                onRemove={() => updateChild(child._id, null)}
              />
            ) : (
              <div
                key={child._id}
                className="rounded-md border bg-muted/30 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CornerDownRight className="h-3 w-3" /> Condition
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => updateChild(child._id, null)}
                    aria-label="Remove condition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <LeafEditor
                  leaf={child}
                  fieldSteps={fieldSteps}
                  onChange={(next) => updateChild(child._id, next)}
                />
              </div>
            ),
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            onChange({
              ...group,
              children: [...group.children, emptyProfileLeaf()],
            })
          }
        >
          <Plus className="mr-1 h-3 w-3" /> Add condition
        </Button>
        {depth < 2 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              onChange({
                ...group,
                children: [...group.children, emptyGroup()],
              })
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Add group
          </Button>
        ) : null}
      </div>
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
              <span className="pb-2 text-[11px] text-muted-foreground">
                applies when the applicant matches:
              </span>
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

            <GroupEditor
              group={rule.condition}
              fieldSteps={fieldSteps}
              depth={1}
              onChange={(next) => updateRule(rule._id, { ...rule, condition: next })}
            />
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

function nodeFromApi(raw: any): UiNode {
  if (raw && raw.type === "group") {
    return {
      _id: nid(),
      node: "group",
      mode: raw.mode === "any" ? "any" : "all",
      negate: Boolean(raw.negate),
      children: Array.isArray(raw.children)
        ? raw.children.map(nodeFromApi)
        : [],
    };
  }
  if (raw && raw.kind === "field_answer") {
    return {
      _id: nid(),
      node: "leaf",
      kind: "field_answer",
      stepId: String(raw.stepId ?? ""),
      fieldKey: String(raw.fieldKey ?? ""),
      matcher: (raw.matcher ?? "any") as UiMatcher,
      values: Array.isArray(raw.values) ? raw.values.map(String) : [],
    };
  }
  // default: profile leaf
  return {
    _id: nid(),
    node: "leaf",
    kind: "profile",
    field: (["education_level", "country", "city", "institution"].includes(
      raw?.field,
    )
      ? raw.field
      : "education_level") as ProfileField,
    matcher: (raw?.matcher ?? "any") as UiMatcher,
    values: Array.isArray(raw?.values) ? raw.values.map(String) : [],
  };
}

function asGroup(node: UiNode): UiGroup {
  if (node.node === "group") return node;
  return {
    _id: nid(),
    node: "group",
    mode: "all",
    negate: false,
    children: [node],
  };
}

export function deadlineRulesFromApi(raw: unknown): UiDeadlineRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((rule: any) => ({
    _id: nid(),
    condition: asGroup(nodeFromApi(rule?.condition ?? { type: "group" })),
    deadlineAt: isoToLocalInput(rule?.deadlineAt),
  }));
}

function leafIsComplete(leaf: UiLeaf): boolean {
  if (leaf.values.length === 0) return false;
  if (leaf.kind === "field_answer") {
    return Boolean(leaf.stepId && leaf.fieldKey);
  }
  return true;
}

function nodeToApi(node: UiNode): any | null {
  if (node.node === "group") {
    const children = node.children
      .map(nodeToApi)
      .filter((c): c is any => c !== null);
    if (children.length === 0) return null;
    return {
      type: "group",
      mode: node.mode,
      ...(node.negate ? { negate: true } : {}),
      children,
    };
  }
  if (!leafIsComplete(node)) return null;
  if (node.kind === "field_answer") {
    return {
      kind: "field_answer",
      stepId: node.stepId,
      fieldKey: node.fieldKey,
      matcher: node.matcher,
      values: node.values,
    };
  }
  return {
    kind: "profile",
    field: node.field,
    matcher: node.matcher,
    values: node.values,
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
    const condition = nodeToApi(rule.condition);
    if (!condition || !Array.isArray(condition.children) || condition.children.length === 0) {
      continue;
    }
    out.push({ condition, deadlineAt });
  }
  return out;
}
