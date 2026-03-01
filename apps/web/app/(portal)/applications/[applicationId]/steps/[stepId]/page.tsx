"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Send,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmDialog, PageHeader, FormSkeleton, StatusBadge } from "@/components/shared";
import { ApiError, apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { sanitizeHtml } from "@/lib/sanitize";
import { FileUpload, type FileUploadValue } from "@/components/forms/FileUpload";
import { FormMarkdown } from "@/components/forms/form-markdown";
import {
  ConditionMode,
  ConditionOperator,
  FieldType,
  isFieldRequired as evaluateFieldRequired,
  isFieldVisible as evaluateFieldVisible,
  type ConditionGroup,
  type FieldDefinition,
} from "@event-platform/schemas";
import { toast } from "sonner";

interface StepFieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  customMessage?: string;
}

interface StepField {
  fieldId: string;
  schemaFieldId?: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  description?: string;
  allowedMimeTypes?: string[];
  maxFiles?: number;
  maxFileSizeMB?: number;
  validation?: StepFieldValidation;
  logic?: {
    showWhen?: ConditionGroup;
    requireWhen?: ConditionGroup;
  };
}

interface StepDetail {
  stepId: string;
  title: string;
  instructions?: string;
  status: string;
  deadlineAt?: string;
  formDefinition?: {
    sections: Array<{
      id: string;
      title: string;
      description?: string;
      fields: StepField[];
    }>;
  };
  draft?: Record<string, unknown>;
  submission?: Record<string, unknown>;
  needsInfo?: Array<{
    id: string;
    targetFieldIds: string[];
    message: string;
    deadlineAt?: string;
  }>;
}

const schemaTypeToUiType: Record<string, string> = {
  text: "TEXT",
  textarea: "TEXTAREA",
  number: "NUMBER",
  email: "EMAIL",
  phone: "PHONE",
  date: "DATE",
  select: "SELECT",
  multiselect: "MULTISELECT",
  multi_select: "MULTISELECT",
  checkbox: "CHECKBOX",
  file_upload: "FILE",
  file: "FILE",
  info_text: "INFO_TEXT",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapApiRecord(
  value: Record<string, unknown> | { data: Record<string, unknown> } | null,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return isRecord(value.data) ? value.data : value;
}

function normalizeNeedsInfo(
  value: unknown,
): Array<{
  id: string;
  targetFieldIds: string[];
  message: string;
  deadlineAt?: string;
}> {
  const rawItems = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.data)
      ? value.data
      : [];

  return rawItems
    .filter(isRecord)
    .filter((entry) => String(entry.status ?? "").toUpperCase() === "OPEN")
    .map((entry) => ({
      id: String(entry.id ?? ""),
      targetFieldIds: Array.isArray(entry.targetFieldIds)
        ? entry.targetFieldIds
            .filter((fieldId): fieldId is string => typeof fieldId === "string")
            .map((fieldId) => fieldId.trim())
            .filter((fieldId) => fieldId.length > 0)
        : [],
      message:
        typeof entry.message === "string" && entry.message.trim().length > 0
          ? entry.message
          : "Please update the requested information.",
      deadlineAt:
        typeof entry.deadlineAt === "string" ? entry.deadlineAt : undefined,
    }))
    .filter((entry) => entry.id.length > 0);
}

function normalizeConditionOperator(value: unknown): ConditionOperator {
  const normalized = String(value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "eq":
    case "=":
    case "==":
      return ConditionOperator.EQ;
    case "neq":
    case "!=":
    case "<>":
      return ConditionOperator.NEQ;
    case "contains":
      return ConditionOperator.CONTAINS;
    case "not_contains":
    case "notcontains":
      return ConditionOperator.NOT_CONTAINS;
    case "gt":
    case ">":
      return ConditionOperator.GT;
    case "gte":
    case ">=":
      return ConditionOperator.GTE;
    case "lt":
    case "<":
      return ConditionOperator.LT;
    case "lte":
    case "<=":
      return ConditionOperator.LTE;
    case "exists":
      return ConditionOperator.EXISTS;
    case "not_exists":
    case "notexists":
      return ConditionOperator.NOT_EXISTS;
    case "in":
      return ConditionOperator.IN;
    case "not_in":
    case "notin":
      return ConditionOperator.NOT_IN;
    default:
      return ConditionOperator.EQ;
  }
}

function parseConditionGroup(rawGroup: unknown): ConditionGroup | undefined {
  if (!isRecord(rawGroup)) return undefined;
  const rawRules = Array.isArray(rawGroup.rules)
    ? rawGroup.rules
    : Array.isArray(rawGroup.conditions)
      ? rawGroup.conditions
      : [];

  const rules = rawRules
    .filter(isRecord)
    .map((rawRule) => {
      const fieldKey =
        typeof rawRule.fieldKey === "string"
          ? rawRule.fieldKey.trim()
          : typeof rawRule.key === "string"
            ? rawRule.key.trim()
            : "";
      if (!fieldKey) return null;
      return {
        fieldKey,
        operator: normalizeConditionOperator(rawRule.operator),
        ...(rawRule.value !== undefined ? { value: rawRule.value } : {}),
      };
    })
    .filter(
      (
        rule,
      ): rule is { fieldKey: string; operator: ConditionOperator; value?: unknown } =>
        rule !== null,
    );

  if (rules.length === 0) return undefined;
  const mode =
    String(rawGroup.mode ?? "").toLowerCase() === ConditionMode.ANY
      ? ConditionMode.ANY
      : ConditionMode.ALL;
  return { mode, rules };
}

function toSchemaFieldType(fieldType: string): FieldType {
  switch (fieldType) {
    case "TEXTAREA":
      return FieldType.TEXTAREA;
    case "NUMBER":
      return FieldType.NUMBER;
    case "EMAIL":
      return FieldType.EMAIL;
    case "PHONE":
      return FieldType.PHONE;
    case "DATE":
      return FieldType.DATE;
    case "SELECT":
      return FieldType.SELECT;
    case "MULTISELECT":
      return FieldType.MULTISELECT;
    case "CHECKBOX":
      return FieldType.CHECKBOX;
    case "FILE":
      return FieldType.FILE_UPLOAD;
    case "INFO_TEXT":
      return FieldType.INFO_TEXT;
    case "TEXT":
    default:
      return FieldType.TEXT;
  }
}

function toSchemaFieldDefinition(field: StepField): FieldDefinition {
  const validation: Record<string, unknown> = {
    ...(field.validation?.required !== undefined
      ? { required: field.validation.required }
      : {}),
    ...(typeof field.validation?.min === "number" ? { min: field.validation.min } : {}),
    ...(typeof field.validation?.max === "number" ? { max: field.validation.max } : {}),
    ...(field.validation?.pattern ? { pattern: field.validation.pattern } : {}),
    ...(field.validation?.customMessage
      ? { customMessage: field.validation.customMessage }
      : {}),
  };

  return {
    id: field.schemaFieldId ?? field.fieldId,
    key: field.fieldId,
    type: toSchemaFieldType(field.type),
    label: field.label,
    ...(Object.keys(validation).length > 0 ? { validation } : {}),
    ...(field.logic ? { logic: field.logic } : {}),
  } as FieldDefinition;
}

function isFieldVisibleByLogic(
  field: StepField,
  values: Record<string, unknown>,
): boolean {
  return evaluateFieldVisible(toSchemaFieldDefinition(field), values);
}

function isFieldRequiredByLogic(
  field: StepField,
  values: Record<string, unknown>,
): boolean {
  return evaluateFieldRequired(toSchemaFieldDefinition(field), values);
}

function normalizeFieldId(fieldId: string | null | undefined): string | null {
  if (typeof fieldId !== "string") return null;
  const normalized = fieldId.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveCanonicalFieldId(
  fieldId: string,
  fieldAliases: Map<string, string>,
): string {
  return fieldAliases.get(fieldId) ?? fieldId;
}

function buildFormFieldAliasMap(
  formDefinition: StepDetail["formDefinition"] | undefined,
): Map<string, string> {
  const aliases = new Map<string, string>();
  if (!formDefinition) return aliases;

  for (const section of formDefinition.sections) {
    for (const field of section.fields) {
      const canonicalFieldId = normalizeFieldId(field.fieldId);
      if (!canonicalFieldId) continue;
      aliases.set(canonicalFieldId, canonicalFieldId);

      const schemaFieldId = normalizeFieldId(field.schemaFieldId);
      if (schemaFieldId) {
        aliases.set(schemaFieldId, canonicalFieldId);
      }
    }
  }

  return aliases;
}

function buildConditionalDependencyGraph(
  formDefinition: StepDetail["formDefinition"] | undefined,
  fieldAliases: Map<string, string>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  if (!formDefinition) return graph;

  for (const section of formDefinition.sections) {
    for (const field of section.fields) {
      const normalizedFieldId = normalizeFieldId(field.fieldId);
      if (!normalizedFieldId) continue;

      const canonicalTargetFieldId = resolveCanonicalFieldId(
        normalizedFieldId,
        fieldAliases,
      );
      if (!graph.has(canonicalTargetFieldId)) {
        graph.set(canonicalTargetFieldId, new Set<string>());
      }

      const conditionGroups = [field.logic?.showWhen, field.logic?.requireWhen];
      for (const group of conditionGroups) {
        for (const rule of group?.rules ?? []) {
          const normalizedSourceFieldId = normalizeFieldId(rule.fieldKey);
          if (!normalizedSourceFieldId) continue;

          const canonicalSourceFieldId = resolveCanonicalFieldId(
            normalizedSourceFieldId,
            fieldAliases,
          );
          if (!graph.has(canonicalSourceFieldId)) {
            graph.set(canonicalSourceFieldId, new Set<string>());
          }
          graph.get(canonicalSourceFieldId)?.add(canonicalTargetFieldId);
        }
      }
    }
  }

  return graph;
}

function expandRevisionFieldIds(
  formDefinition: StepDetail["formDefinition"] | undefined,
  targetedFieldIds: Set<string>,
): Set<string> {
  if (targetedFieldIds.size === 0) return new Set<string>();

  const fieldAliases = buildFormFieldAliasMap(formDefinition);
  const dependencyGraph = buildConditionalDependencyGraph(
    formDefinition,
    fieldAliases,
  );
  const expandedFieldIds = new Set<string>();
  const queue: string[] = [];

  for (const targetedFieldId of targetedFieldIds) {
    const canonicalFieldId = resolveCanonicalFieldId(
      targetedFieldId,
      fieldAliases,
    );
    if (expandedFieldIds.has(canonicalFieldId)) continue;
    expandedFieldIds.add(canonicalFieldId);
    queue.push(canonicalFieldId);
  }

  while (queue.length > 0) {
    const currentFieldId = queue.shift();
    if (!currentFieldId) continue;

    const dependentFieldIds = dependencyGraph.get(currentFieldId);
    if (!dependentFieldIds) continue;

    for (const dependentFieldId of dependentFieldIds) {
      if (expandedFieldIds.has(dependentFieldId)) continue;
      expandedFieldIds.add(dependentFieldId);
      queue.push(dependentFieldId);
    }
  }

  return expandedFieldIds;
}

function normalizeFormDefinition(raw: unknown): StepDetail["formDefinition"] {
  const root = isRecord(raw) ? raw : {};
  const rawSections = Array.isArray(root.sections)
    ? root.sections
    : Array.isArray(root.pages)
      ? root.pages
      : [];

  return {
    sections: rawSections.map((section) => {
      const sectionRecord = isRecord(section) ? section : {};
      const fields = Array.isArray(sectionRecord.fields)
        ? sectionRecord.fields
        : [];
      return {
        id: String(sectionRecord.id ?? ""),
        title: String(sectionRecord.title ?? "Section"),
        description:
          typeof sectionRecord.description === "string"
            ? sectionRecord.description
            : undefined,
        fields: fields.map((field) => {
          const fieldRecord = isRecord(field) ? field : {};
          const ui = isRecord(fieldRecord.ui) ? fieldRecord.ui : {};
          const validation = isRecord(fieldRecord.validation)
            ? fieldRecord.validation
            : {};
          const logic = isRecord(fieldRecord.logic) ? fieldRecord.logic : {};
          const optionsSource = ui.options ?? fieldRecord.options;
          const allowedTypesSource =
            ui.allowedMimeTypes ??
            validation.allowedTypes ??
            fieldRecord.allowedTypes;
          const showWhen = parseConditionGroup(logic.showWhen ?? fieldRecord.showWhen);
          const requireWhen = parseConditionGroup(
            logic.requireWhen ?? fieldRecord.requireWhen,
          );

          return {
            fieldId: String(fieldRecord.key ?? fieldRecord.id ?? "").trim(),
            schemaFieldId:
              typeof fieldRecord.id === "string" &&
              fieldRecord.id.trim().length > 0
                ? fieldRecord.id.trim()
                : undefined,
            type:
              schemaTypeToUiType[
                String(fieldRecord.type ?? "").toLowerCase()
              ] ?? "TEXT",
            label: String(fieldRecord.label ?? "Field"),
            required: Boolean(validation.required ?? fieldRecord.required),
            validation: {
              required: Boolean(validation.required ?? fieldRecord.required),
              min: typeof validation.min === "number" ? validation.min : undefined,
              max: typeof validation.max === "number" ? validation.max : undefined,
              pattern:
                typeof validation.pattern === "string"
                  ? validation.pattern
                  : undefined,
              customMessage:
                typeof validation.customMessage === "string"
                  ? validation.customMessage
                  : undefined,
            },
            placeholder:
              typeof ui.placeholder === "string"
                ? ui.placeholder
                : typeof fieldRecord.placeholder === "string"
                  ? fieldRecord.placeholder
                  : undefined,
            options: Array.isArray(optionsSource)
              ? optionsSource
                  .filter(
                    (option): option is { label: string; value: string } =>
                      isRecord(option) &&
                      typeof option.label === "string" &&
                      typeof option.value === "string"
                  )
                  .map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))
              : undefined,
            description:
              typeof ui.description === "string"
                ? ui.description
                : typeof fieldRecord.description === "string"
                  ? fieldRecord.description
                  : undefined,
            allowedMimeTypes: Array.isArray(allowedTypesSource)
              ? allowedTypesSource.filter(
                  (type): type is string => typeof type === "string"
                )
              : undefined,
            maxFiles:
              typeof ui.maxFiles === "number" ? ui.maxFiles : undefined,
            maxFileSizeMB:
              typeof ui.maxFileSizeMB === "number"
                ? ui.maxFileSizeMB
                : undefined,
            logic:
              showWhen || requireWhen
                ? {
                    ...(showWhen ? { showWhen } : {}),
                    ...(requireWhen ? { requireWhen } : {}),
                  }
                : undefined,
          };
        }),
      };
    }),
  };
}

function normalizeFileValues(value: unknown): FileUploadValue[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeFileValues(entry));
  }

  if (typeof value === "string") {
    return [{ fileObjectId: value, originalFilename: value, sizeBytes: 0 }];
  }

  if (typeof value === "object") {
    const candidate = value as Partial<FileUploadValue>;
    if (typeof candidate.fileObjectId === "string") {
      return [
        {
          fileObjectId: candidate.fileObjectId,
          originalFilename:
            typeof candidate.originalFilename === "string"
              ? candidate.originalFilename
              : candidate.fileObjectId,
          sizeBytes:
            typeof candidate.sizeBytes === "number" ? candidate.sizeBytes : 0,
        },
      ];
    }
  }

  return [];
}

function validateFieldValue(
  field: StepField,
  value: unknown,
  values: Record<string, unknown>,
): string | null {
  if (!isFieldVisibleByLogic(field, values)) return null;
  const required = isFieldRequiredByLogic(field, values);

  if (field.type === "INFO_TEXT") return null;

  if (field.type === "CHECKBOX") {
    if (required && value !== true) return "Required";
    return null;
  }

  if (field.type === "MULTISELECT") {
    const selected = Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    if (required && selected.length === 0) return "Required";
    if (selected.length === 0) return null;
    if (
      typeof field.validation?.min === "number" &&
      selected.length < field.validation.min
    ) {
      return `Select at least ${field.validation.min} option${field.validation.min === 1 ? "" : "s"}`;
    }
    if (
      typeof field.validation?.max === "number" &&
      selected.length > field.validation.max
    ) {
      return `Select at most ${field.validation.max} option${field.validation.max === 1 ? "" : "s"}`;
    }
    return null;
  }

  if (field.type === "FILE") {
    const files = normalizeFileValues(value);
    if (required && files.length === 0) return "Required";
    if (files.length === 0) return null;

    if (typeof field.maxFiles === "number" && files.length > field.maxFiles) {
      return `Maximum ${field.maxFiles} file${field.maxFiles === 1 ? "" : "s"} allowed`;
    }

    if (typeof field.maxFileSizeMB === "number" && field.maxFileSizeMB > 0) {
      const maxBytes = Math.floor(field.maxFileSizeMB * 1024 * 1024);
      if (
        files.some(
          (file) =>
            typeof file.sizeBytes === "number" &&
            file.sizeBytes > 0 &&
            file.sizeBytes > maxBytes,
        )
      ) {
        return `Each file must be ${field.maxFileSizeMB} MB or smaller`;
      }
    }

    return null;
  }

  if (field.type === "NUMBER") {
    const raw =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? value.trim()
          : "";

    if (raw === "" || raw === null || raw === undefined) {
      return required ? "Required" : null;
    }

    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isNaN(parsed)) return "Must be a number";

    if (
      typeof field.validation?.min === "number" &&
      parsed < field.validation.min
    ) {
      return `Minimum value is ${field.validation.min}`;
    }
    if (
      typeof field.validation?.max === "number" &&
      parsed > field.validation.max
    ) {
      return `Maximum value is ${field.validation.max}`;
    }

    return null;
  }

  const text = typeof value === "string" ? value : "";
  const trimmed = text.trim();
  if (trimmed.length === 0) return required ? "Required" : null;

  if (field.type === "EMAIL" && !EMAIL_REGEX.test(trimmed)) {
    return "Enter a valid email address";
  }

  if (
    (field.type === "TEXT" || field.type === "TEXTAREA") &&
    typeof field.validation?.min === "number" &&
    text.length < field.validation.min
  ) {
    return `Minimum ${field.validation.min} characters`;
  }

  if (
    (field.type === "TEXT" || field.type === "TEXTAREA") &&
    typeof field.validation?.max === "number" &&
    text.length > field.validation.max
  ) {
    return `Maximum ${field.validation.max} characters`;
  }

  if (
    (field.type === "TEXT" || field.type === "TEXTAREA") &&
    typeof field.validation?.pattern === "string"
  ) {
    try {
      const regex = new RegExp(field.validation.pattern);
      if (!regex.test(text)) {
        return field.validation.customMessage ?? "Invalid format";
      }
    } catch {
      // Ignore malformed patterns coming from legacy form definitions.
    }
  }

  if (field.type === "SELECT" && field.options?.length) {
    const allowed = field.options.some((option) => option.value === text);
    if (!allowed) return "Select a valid option";
  }

  if (field.type === "DATE") {
    if (Number.isNaN(new Date(text).getTime())) {
      return "Enter a valid date";
    }
  }

  return null;
}

function collectValidationIssues(
  formDefinition: StepDetail["formDefinition"] | undefined,
  values: Record<string, unknown>,
  options?: {
    limitToFieldIds?: Set<string>;
  },
): Record<string, string> {
  if (!formDefinition) return {};
  const issues: Record<string, string> = {};
  const limitToFieldIds = options?.limitToFieldIds;

  for (const section of formDefinition.sections) {
    for (const field of section.fields) {
      if (limitToFieldIds && !limitToFieldIds.has(field.fieldId)) {
        continue;
      }
      const issue = validateFieldValue(field, values[field.fieldId], values);
      if (issue) {
        issues[field.fieldId] = issue;
      }
    }
  }

  return issues;
}

function formatDeadline(deadline: Date): string {
  return deadline.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getFriendlySubmitError(error: unknown, deadlineAt?: string): string {
  const rawMessage =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "";

  if (rawMessage.length === 0) {
    return "Could not submit this step. Please review your answers and try again.";
  }

  if (rawMessage.toLowerCase().includes("step deadline has passed")) {
    if (deadlineAt) {
      const parsedDeadline = new Date(deadlineAt);
      if (!Number.isNaN(parsedDeadline.getTime())) {
        return `This step deadline passed on ${formatDeadline(parsedDeadline)}.`;
      }
    }
    return "This step deadline has passed.";
  }

  if (rawMessage.toLowerCase().startsWith("validation failed")) {
    return rawMessage.replace(/^validation failed:\s*/i, "");
  }

  return rawMessage;
}

export default function StepFormPage() {
  const params = useParams();
  const router = useRouter();
  const { csrfToken } = useAuth();
  const applicationId = params.applicationId as string;
  const stepId = params.stepId as string;

  const [step, setStep] = useState<StepDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [isStepUnavailable, setIsStepUnavailable] = useState(false);

  const form = useForm({ defaultValues: {} as Record<string, unknown> });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchedValues = useWatch({ control: form.control }) as
    | Record<string, unknown>
    | undefined;

  const isReadOnly =
    step?.status === "SUBMITTED" ||
    step?.status === "APPROVED" ||
    step?.status === "REJECTED_FINAL";
  const isLocked = step?.status === "LOCKED";

  const requestedNeedsInfoFieldIds = useMemo(
    () =>
      new Set(
        (step?.needsInfo?.flatMap((ni) => ni.targetFieldIds) ?? [])
          .map((fieldId) => fieldId.trim())
          .filter((fieldId) => fieldId.length > 0)
      ),
    [step?.needsInfo]
  );
  const editableNeedsInfoFieldIds = useMemo(
    () => expandRevisionFieldIds(step?.formDefinition, requestedNeedsInfoFieldIds),
    [step?.formDefinition, requestedNeedsInfoFieldIds]
  );
  const hasTargetedNeedsInfo = requestedNeedsInfoFieldIds.size > 0;
  const isRevisionTargetedMode =
    step?.status === "NEEDS_REVISION" && hasTargetedNeedsInfo;

  const validationIssues = useMemo(
    () =>
      collectValidationIssues(step?.formDefinition, watchedValues ?? {}, {
        limitToFieldIds: isRevisionTargetedMode
          ? editableNeedsInfoFieldIds
          : undefined,
      }),
    [
      step?.formDefinition,
      watchedValues,
      isRevisionTargetedMode,
      editableNeedsInfoFieldIds,
    ]
  );

  const fieldLabelById = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const section of step?.formDefinition?.sections ?? []) {
      for (const field of section.fields) {
        labels[field.fieldId] = field.label;
      }
    }
    return labels;
  }, [step?.formDefinition]);

  const validationIssueEntries = useMemo(
    () => Object.entries(validationIssues),
    [validationIssues]
  );
  const requiredIssueCount = validationIssueEntries.filter(
    ([, message]) => message === "Required"
  ).length;
  const validationSummaryFields = validationIssueEntries
    .slice(0, 3)
    .map(([fieldId]) => fieldLabelById[fieldId] ?? fieldId);

  const deadlineInfo = useMemo(() => {
    if (!step?.deadlineAt) return null;
    const parsedDeadline = new Date(step.deadlineAt);
    if (Number.isNaN(parsedDeadline.getTime())) return null;
    const hoursLeft = Math.ceil(
      (parsedDeadline.getTime() - Date.now()) / (1000 * 60 * 60)
    );
    if (hoursLeft <= 0) {
      return { kind: "passed" as const, deadline: parsedDeadline, hoursLeft };
    }
    if (hoursLeft <= 72) {
      return { kind: "soon" as const, deadline: parsedDeadline, hoursLeft };
    }
    return { kind: "upcoming" as const, deadline: parsedDeadline, hoursLeft };
  }, [step?.deadlineAt]);

  const isDeadlinePassed = deadlineInfo?.kind === "passed";
  const canSubmit =
    Boolean(resolvedEventId) &&
    !isReadOnly &&
    !isLocked &&
    !isSubmitting &&
    !isDeadlinePassed &&
    validationIssueEntries.length === 0;

  useEffect(() => {
    (async () => {
      try {
        setIsStepUnavailable(false);
        // Resolve eventId from the applications list
        const listRes = await apiClient<
          | {
              applications?: Array<Record<string, unknown>>;
              data?: Array<Record<string, unknown>>;
            }
          | Array<Record<string, unknown>>
        >("/applications/me");
        const apps = Array.isArray(listRes)
          ? listRes.filter((entry): entry is Record<string, unknown> =>
              isRecord(entry)
            )
          : isRecord(listRes)
            ? (
                Array.isArray(listRes.applications)
                  ? listRes.applications
                  : Array.isArray(listRes.data)
                    ? listRes.data
                    : []
              ).filter((entry): entry is Record<string, unknown> =>
                isRecord(entry)
              )
            : [];
        const match = apps.find((app) => app.id === applicationId);
        const eventId =
          match && typeof match.eventId === "string" ? match.eventId : undefined;
        if (!eventId) { setIsLoading(false); return; }
        setResolvedEventId(eventId);

        // Get the draft for this step
        const draftRes = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
          `/events/${eventId}/applications/me/steps/${stepId}/draft`
        ).catch(() => null);
        const draft = unwrapApiRecord(draftRes);
        const needsInfoRes = await apiClient<
          Record<string, unknown> | { data: Array<Record<string, unknown>> }
        >(`/events/${eventId}/applications/${applicationId}/needs-info?stepId=${stepId}`).catch(
          () => null
        );
        const needsInfo = normalizeNeedsInfo(needsInfoRes);

        // Build a step detail object (the API doesn't have a dedicated "get step detail" for applicants)
        // We get step info from the full application
        const appRes = await apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
          `/events/${eventId}/applications/me`
        );
        const appRaw = unwrapApiRecord(appRes);
        const rawStepStates = appRaw?.stepStates;
        const stepStates =
          Array.isArray(rawStepStates)
            ? rawStepStates.filter((entry): entry is Record<string, unknown> =>
                isRecord(entry)
              )
            : [];
        const stepState = stepStates.find(
          (candidate) =>
            typeof candidate.stepId === "string" && candidate.stepId === stepId,
        );
        if (!stepState) {
          setStep(null);
          setIsStepUnavailable(true);
          form.reset({});
          return;
        }
        const draftAnswers =
          draft && isRecord(draft.answers) ? draft.answers : draft ?? undefined;
        const submissionAnswers =
          stepState && isRecord(stepState.answers) ? stepState.answers : undefined;

        const stepDetail: StepDetail = {
          stepId,
          title:
            typeof stepState?.stepTitle === "string"
              ? stepState.stepTitle
              : "Step",
          instructions:
            typeof stepState?.instructions === "string"
              ? stepState.instructions
              : undefined,
          status:
            typeof stepState?.status === "string"
              ? stepState.status
              : "UNLOCKED",
          deadlineAt:
            typeof stepState?.deadlineAt === "string"
              ? stepState.deadlineAt
              : undefined,
          formDefinition: normalizeFormDefinition(stepState?.formDefinition),
          draft: draftAnswers,
          submission: submissionAnswers,
          needsInfo,
        };
        setStep(stepDetail);
        setSubmitError(null);
        setHasTriedSubmit(false);
        const submissionValues = isRecord(stepDetail.submission)
          ? stepDetail.submission
          : {};
        const draftValues = isRecord(stepDetail.draft) ? stepDetail.draft : {};
        const initialValues = { ...submissionValues, ...draftValues };
        form.reset(initialValues as Record<string, unknown>);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [applicationId, stepId, form]);

  // Autosave (3s debounce)
  const saveDraft = useCallback(
    async (values: Record<string, unknown>) => {
      if (isReadOnly || isLocked || isStepUnavailable || !resolvedEventId) return;
      setIsSaving(true);
      try {
        await apiClient(`/events/${resolvedEventId}/applications/me/steps/${stepId}/draft`, {
          method: "PATCH",
          body: { answers: values },
          csrfToken: csrfToken ?? undefined,
        });
        setLastSaved(new Date());
      } catch {
        /* silent */
      } finally {
        setIsSaving(false);
      }
    },
    [resolvedEventId, stepId, csrfToken, isReadOnly, isLocked, isStepUnavailable]
  );

  useEffect(() => {
    if (isReadOnly || isLocked) return;
    const subscription = form.watch((values) => {
      if (submitError) {
        setSubmitError(null);
      }
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => saveDraft(values), 3000);
    });
    return () => {
      subscription.unsubscribe();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [form, saveDraft, isReadOnly, isLocked, submitError]);

  function handleSubmitClick() {
    setHasTriedSubmit(true);
    setSubmitError(null);
    if (!canSubmit) return;
    setShowConfirm(true);
  }

  async function handleSubmit() {
    if (isReadOnly || isLocked || isStepUnavailable || !resolvedEventId) return;

    const values = form.getValues() as Record<string, unknown>;
    const issues = collectValidationIssues(step?.formDefinition, values, {
      limitToFieldIds: isRevisionTargetedMode
        ? editableNeedsInfoFieldIds
        : undefined,
    });
    setHasTriedSubmit(true);
    if (Object.keys(issues).length > 0 || isDeadlinePassed) {
      setShowConfirm(false);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await apiClient(`/events/${resolvedEventId}/applications/me/steps/${stepId}/submit`, {
        method: "POST",
        body: { answers: values },
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Step submitted successfully!");
      router.push(`/applications/${applicationId}`);
    } catch (error: unknown) {
      setSubmitError(getFriendlySubmitError(error, step?.deadlineAt));
    } finally {
      setIsSubmitting(false);
      setShowConfirm(false);
    }
  }

  if (isLoading) return <FormSkeleton />;
  if (isStepUnavailable) {
    return (
      <div className="text-center py-16 space-y-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-bold">Step unavailable</h2>
        <p className="text-muted-foreground">
          This step is not available for your application.
        </p>
        <Button
          variant="default"
          onClick={() => router.push(`/applications/${applicationId}`)}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to application
        </Button>
      </div>
    );
  }
  if (!step) return null;
  if (isLocked) {
    return (
      <div className="text-center py-16 space-y-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-bold">Step locked</h2>
        <p className="text-muted-foreground">
          This step is not yet available. Complete the previous steps first.
        </p>
        <Button
          variant="default"
          onClick={() => router.push(`/applications/${applicationId}`)}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to application
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-5xl mx-auto w-full space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="font-medium border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10"
            onClick={() => router.push(`/applications/${applicationId}`)}
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to application
          </Button>
          <PageHeader title={step.title}>
            <StatusBadge status={step.status} />
          </PageHeader>
        </div>
      </div>

      {/* Instructions */}
      {step.instructions && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setInstructionsOpen(!instructionsOpen)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Instructions</CardTitle>
              </div>
              {instructionsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </CardHeader>
          {instructionsOpen && (
            <CardContent>
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(step.instructions) }}
              />
            </CardContent>
          )}
        </Card>
      )}

      {/* Needs info alerts */}
      {step.needsInfo?.map((ni) => (
        <Alert key={ni.id} className="border-warning bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            <strong>Revision requested:</strong> {ni.message}
            {ni.deadlineAt && (
              <span className="text-xs text-muted-foreground ml-2">
                (due {new Date(ni.deadlineAt).toLocaleDateString()})
              </span>
            )}
          </AlertDescription>
        </Alert>
      ))}

      {deadlineInfo && (
        <Alert
          className={
            deadlineInfo.kind === "passed"
              ? "border-destructive bg-destructive/5"
              : deadlineInfo.kind === "soon"
                ? "border-warning bg-warning/5"
                : "border-border bg-muted/30"
          }
        >
          <AlertTriangle
            className={
              deadlineInfo.kind === "passed"
                ? "h-4 w-4 text-destructive"
                : deadlineInfo.kind === "soon"
                  ? "h-4 w-4 text-warning"
                  : "h-4 w-4 text-muted-foreground"
            }
          />
          <AlertTitle>
            {deadlineInfo.kind === "passed"
              ? "Deadline passed"
              : deadlineInfo.kind === "soon"
                ? "Deadline coming soon"
                : "Step deadline"}
          </AlertTitle>
          <AlertDescription className="text-sm">
            Due {formatDeadline(deadlineInfo.deadline)}
            {deadlineInfo.kind === "soon" && (
              <> ({deadlineInfo.hoursLeft}h remaining)</>
            )}
            {deadlineInfo.kind === "passed" && (
              <>. Submission is no longer available for this step.</>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!isReadOnly && validationIssueEntries.length > 0 && (
        <Alert className="border-warning bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle>
            {validationIssueEntries.length} issue
            {validationIssueEntries.length === 1 ? "" : "s"} to fix before submit
          </AlertTitle>
          <AlertDescription className="text-sm">
            {requiredIssueCount > 0 && (
              <span>
                {requiredIssueCount} required field
                {requiredIssueCount === 1 ? "" : "s"} missing.
              </span>
            )}
            {validationSummaryFields.length > 0 && (
              <span className="ml-1">
                Check: {validationSummaryFields.join(", ")}
                {validationIssueEntries.length > validationSummaryFields.length
                  ? "..."
                  : "."}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {submitError && (
        <Alert className="border-destructive bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle>Could not submit</AlertTitle>
          <AlertDescription className="text-sm">{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Form sections */}
      {step.formDefinition?.sections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            {section.description && (
              <FormMarkdown
                content={section.description}
                className="text-sm text-muted-foreground [&_p]:my-0"
              />
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {section.fields.map((field) => {
              const currentValues = watchedValues ?? {};
              if (!isFieldVisibleByLogic(field, currentValues)) {
                return null;
              }
              const isFieldRequired = isFieldRequiredByLogic(field, currentValues);
              const hasNeedsInfo = requestedNeedsInfoFieldIds.has(field.fieldId);
              const hasRevisionAccess = editableNeedsInfoFieldIds.has(field.fieldId);
              const isLockedForRevision =
                isRevisionTargetedMode && !hasRevisionAccess;
              const fieldReadOnly = isReadOnly || isLockedForRevision;
              const fieldIssue = validationIssues[field.fieldId];
              const fieldState = form.getFieldState(field.fieldId);
              const showFieldIssue =
                Boolean(fieldIssue) &&
                (hasTriedSubmit || fieldState.isDirty || fieldState.isTouched);

              return (
                <div
                  key={field.fieldId}
                  className={
                    hasNeedsInfo
                      ? "rounded-lg border-2 border-warning/50 bg-warning/5 p-3 -m-3"
                      : isRevisionTargetedMode && hasRevisionAccess
                        ? "rounded-lg border border-primary/30 bg-primary/5 p-3 -m-3"
                      : isLockedForRevision
                        ? "rounded-lg border border-muted/50 bg-muted/20 p-3 -m-3"
                        : ""
                  }
                >
                  <div className="space-y-2">
                    <Label htmlFor={field.fieldId} className="text-sm font-medium">
                      {field.label}
                      {isFieldRequired && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </Label>
                    {field.description && (
                      <FormMarkdown
                        content={field.description}
                        className="text-xs text-muted-foreground [&_p]:my-0"
                      />
                    )}

                    {/* Field render by type */}
                    {(field.type === "TEXT" || field.type === "EMAIL" || field.type === "NUMBER") && (
                      <Input
                        id={field.fieldId}
                        type={field.type === "NUMBER" ? "number" : field.type === "EMAIL" ? "email" : "text"}
                        placeholder={field.placeholder}
                        disabled={fieldReadOnly}
                        className={showFieldIssue ? "border-destructive" : undefined}
                        {...form.register(field.fieldId)}
                      />
                    )}

                    {field.type === "PHONE" && (
                      <Controller
                        control={form.control}
                        name={field.fieldId}
                        render={({ field: controllerField }) => (
                          <PhoneInput
                            value={(controllerField.value as string) ?? ""}
                            onChange={(next) =>
                              form.setValue(field.fieldId, next, {
                                shouldDirty: true,
                                shouldTouch: true,
                              })
                            }
                            disabled={fieldReadOnly}
                            placeholder={field.placeholder ?? "Phone number"}
                          />
                        )}
                      />
                    )}

                    {field.type === "TEXTAREA" && (
                      <Textarea
                        id={field.fieldId}
                        placeholder={field.placeholder}
                        rows={4}
                        disabled={fieldReadOnly}
                        className={showFieldIssue ? "border-destructive" : undefined}
                        {...form.register(field.fieldId)}
                      />
                    )}

                    {field.type === "SELECT" && (
                      <Combobox
                        options={field.options ?? []}
                        value={(form.watch(field.fieldId) as string) ?? ""}
                        onValueChange={(v) =>
                          form.setValue(field.fieldId, v, {
                            shouldDirty: true,
                            shouldTouch: true,
                          })
                        }
                        disabled={fieldReadOnly}
                        placeholder={field.placeholder ?? "Select..."}
                        searchPlaceholder="Search options..."
                        className={showFieldIssue ? "border-destructive" : undefined}
                      />
                    )}

                    {field.type === "MULTISELECT" && (
                      <Controller
                        control={form.control}
                        name={field.fieldId}
                        render={({ field: controllerField }) => {
                          const selected = Array.isArray(controllerField.value)
                            ? controllerField.value.filter(
                                (v): v is string => typeof v === "string"
                              )
                            : [];
                          const toggleValue = (value: string, checked: boolean) => {
                            const next = checked
                              ? Array.from(new Set([...selected, value]))
                              : selected.filter((v) => v !== value);
                            form.setValue(field.fieldId, next, {
                              shouldDirty: true,
                              shouldTouch: true,
                            });
                          };

                          return (
                            <div className="grid gap-2">
                              {field.options?.length ? (
                                field.options.map((opt) => (
                                  <label
                                    key={opt.value}
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    <Checkbox
                                      checked={selected.includes(opt.value)}
                                      onCheckedChange={(v) =>
                                        toggleValue(opt.value, v === true)
                                      }
                                      disabled={fieldReadOnly}
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No options available.
                                </p>
                              )}
                            </div>
                          );
                        }}
                      />
                    )}

                    {field.type === "CHECKBOX" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={field.fieldId}
                          disabled={fieldReadOnly}
                          checked={!!form.watch(field.fieldId)}
                          onCheckedChange={(v) =>
                            form.setValue(field.fieldId, v === true, {
                              shouldDirty: true,
                              shouldTouch: true,
                            })
                          }
                        />
                        <Label htmlFor={field.fieldId} className="text-sm font-normal">
                          {field.placeholder ?? field.label}
                        </Label>
                      </div>
                    )}

                    {field.type === "DATE" && (
                      <Input
                        id={field.fieldId}
                        type="date"
                        disabled={fieldReadOnly}
                        className={showFieldIssue ? "border-destructive" : undefined}
                        {...form.register(field.fieldId)}
                      />
                    )}

                    {field.type === "FILE" &&
                      (resolvedEventId ? (
                        <Controller
                          control={form.control}
                          name={field.fieldId}
                          render={({ field: controllerField }) => {
                            const uploadValue = Array.isArray(controllerField.value)
                              ? (controllerField.value as FileUploadValue[])
                              : controllerField.value &&
                                typeof controllerField.value === "object"
                                ? (controllerField.value as FileUploadValue)
                                : null;
                            const maxFiles = field.maxFiles;
                            const multiple =
                              typeof maxFiles === "number" ? maxFiles > 1 : false;
                            return (
                              <FileUpload
                                value={uploadValue}
                                onChange={(next) =>
                                  form.setValue(field.fieldId, next as unknown, {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                  })
                                }
                                eventId={resolvedEventId}
                                applicationId={applicationId}
                                stepId={stepId}
                                fieldId={field.fieldId}
                                readOnly={fieldReadOnly}
                                accept={field.allowedMimeTypes?.join(",")}
                                multiple={multiple}
                                maxFiles={typeof maxFiles === "number" ? maxFiles : undefined}
                                maxFileSizeMB={
                                  typeof field.maxFileSizeMB === "number"
                                    ? field.maxFileSizeMB
                                    : undefined
                                }
                              />
                            );
                          }}
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Upload unavailable until event context is loaded.
                        </p>
                      ))}

                    {field.type === "INFO_TEXT" && (
                      <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                        <FormMarkdown
                          content={field.description}
                          className="text-sm text-muted-foreground [&_p]:my-0"
                        />
                      </div>
                    )}

                    {showFieldIssue && fieldIssue && (
                      <p className="text-xs text-destructive">{fieldIssue}</p>
                    )}

                    {hasNeedsInfo && (
                      <p className="text-xs text-warning font-medium flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" />
                        This field needs revision
                      </p>
                    )}
                    {isLockedForRevision && (
                      <p className="text-xs text-muted-foreground font-medium mt-1">
                        Locked for this revision request.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* Action bar */}
      {!isReadOnly && (
        <div className="flex items-center justify-between sticky bottom-4 bg-background/95 backdrop-blur border rounded-xl p-4 shadow-soft-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving draft...
              </>
            ) : lastSaved ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-success" />
                Saved {lastSaved.toLocaleTimeString()}
              </>
            ) : (
              <>
                <Save className="h-3 w-3" />
                Autosave enabled
              </>
            )}
            {validationIssueEntries.length > 0 && (
              <span className="text-warning">
                - {validationIssueEntries.length} issue
                {validationIssueEntries.length === 1 ? "" : "s"} remaining
              </span>
            )}
            {isDeadlinePassed && (
              <span className="text-destructive">- Deadline passed</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveDraft(form.getValues())}
              disabled={isSaving}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save draft
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitClick}
              disabled={!canSubmit}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Submit
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Submit this step?"
        description="Once submitted, you won't be able to edit your answers unless a revision is requested."
        confirmLabel="Submit"
        onConfirm={handleSubmit}
      />
    </motion.div>
  );
}
