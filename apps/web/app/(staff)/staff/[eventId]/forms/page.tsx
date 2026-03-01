"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Reorder } from "framer-motion";
import {
  Plus,
  FileEdit,
  GripVertical,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  PageHeader,
  EmptyState,
  CardSkeleton,
  ConfirmDialog,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface FormDef {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  sectionCount: number;
  fieldCount: number;
  updatedAt: string;
}

interface FormField {
  fieldId: string;
  key: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    allowedTypes?: string[];
  };
  file?: {
    allowedMimeTypes?: string[];
    maxFileSizeMB?: number;
    maxFiles?: number;
  };
  logic?: {
    showWhen?: ConditionGroup;
    requireWhen?: ConditionGroup;
  };
}

type ConditionOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "not_exists"
  | "in"
  | "not_in";

type ConditionMode = "all" | "any";

interface ConditionRule {
  fieldKey: string;
  operator: ConditionOperator;
  value?: string;
}

interface ConditionGroup {
  mode: ConditionMode;
  rules: ConditionRule[];
}

interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

interface FormDetail {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  sections: FormSection[];
}

interface FormVersion {
  id: string;
  versionNumber: number;
  publishedAt: string;
  publishedBy?: string;
}

const fieldTypes = [
  { value: "TEXT", label: "Short text" },
  { value: "TEXTAREA", label: "Long text" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone number" },
  { value: "NUMBER", label: "Number" },
  { value: "SELECT", label: "Dropdown" },
  { value: "MULTISELECT", label: "Multi-select" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "DATE", label: "Date" },
  { value: "FILE", label: "File upload" },
  { value: "INFO_TEXT", label: "Info text (no input)" },
];

const schemaToUiFieldType: Record<string, string> = {
  text: "TEXT",
  textarea: "TEXTAREA",
  email: "EMAIL",
  phone: "PHONE",
  number: "NUMBER",
  select: "SELECT",
  multiselect: "MULTISELECT",
  multi_select: "MULTISELECT",
  checkbox: "CHECKBOX",
  date: "DATE",
  file_upload: "FILE",
  info_text: "INFO_TEXT",
};

const uiToSchemaFieldType: Record<string, string> = {
  TEXT: "text",
  TEXTAREA: "textarea",
  EMAIL: "email",
  PHONE: "phone",
  NUMBER: "number",
  SELECT: "select",
  MULTISELECT: "multiselect",
  CHECKBOX: "checkbox",
  DATE: "date",
  FILE: "file_upload",
  INFO_TEXT: "info_text",
};

const conditionOperators: Array<{
  value: ConditionOperator;
  label: string;
  needsValue?: boolean;
}> = [
  { value: "eq", label: "Equals", needsValue: true },
  { value: "neq", label: "Not equals", needsValue: true },
  { value: "contains", label: "Contains", needsValue: true },
  { value: "not_contains", label: "Does not contain", needsValue: true },
  { value: "gt", label: "Greater than", needsValue: true },
  { value: "gte", label: "Greater than or equal", needsValue: true },
  { value: "lt", label: "Less than", needsValue: true },
  { value: "lte", label: "Less than or equal", needsValue: true },
  { value: "exists", label: "Has any value", needsValue: false },
  { value: "not_exists", label: "Is empty", needsValue: false },
  { value: "in", label: "In list (comma separated)", needsValue: true },
  { value: "not_in", label: "Not in list (comma separated)", needsValue: true },
];

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

function mergeStringArrays(
  ...values: Array<string[] | undefined>
): string[] | undefined {
  const merged = values.flatMap((arr) => arr ?? []);
  const unique = Array.from(new Set(merged.map((v) => v.trim()).filter(Boolean)));
  return unique.length > 0 ? unique : undefined;
}

function normalizeConditionOperator(value: unknown): ConditionOperator {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "==" || normalized === "=") return "eq";
  if (normalized === "!=" || normalized === "<>") return "neq";
  if (normalized === ">") return "gt";
  if (normalized === ">=") return "gte";
  if (normalized === "<") return "lt";
  if (normalized === "<=") return "lte";
  if (normalized === "notcontains") return "not_contains";
  if (normalized === "notexists") return "not_exists";
  if (normalized === "notin") return "not_in";
  const supported = new Set(conditionOperators.map((item) => item.value));
  return supported.has(normalized as ConditionOperator)
    ? (normalized as ConditionOperator)
    : "eq";
}

function parseConditionGroup(rawGroup: unknown): ConditionGroup | undefined {
  if (!rawGroup || typeof rawGroup !== "object") return undefined;
  const group = rawGroup as Record<string, unknown>;
  const rawRules = Array.isArray(group.rules)
    ? group.rules
    : Array.isArray(group.conditions)
      ? group.conditions
      : [];

  const rules = rawRules
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    )
    .map<ConditionRule | null>((rule) => {
      const fieldKey =
        typeof rule.fieldKey === "string"
          ? rule.fieldKey.trim()
          : typeof rule.key === "string"
            ? rule.key.trim()
            : "";
      if (!fieldKey) return null;
      const value =
        rule.value === undefined || rule.value === null
          ? undefined
          : String(rule.value);
      return {
        fieldKey,
        operator: normalizeConditionOperator(rule.operator),
        ...(value !== undefined ? { value } : {}),
      };
    })
    .filter((rule): rule is ConditionRule => rule !== null);

  if (rules.length === 0) return undefined;

  const modeValue = String(group.mode ?? "all").toLowerCase();
  return {
    mode: modeValue === "any" ? "any" : "all",
    rules,
  };
}

function deriveStatus(raw: any): "DRAFT" | "PUBLISHED" {
  const status = String(raw?.status ?? "").toUpperCase();
  if (status === "PUBLISHED") return "PUBLISHED";
  return Number(raw?.latestVersion ?? 0) > 0 ? "PUBLISHED" : "DRAFT";
}

function parseSections(rawDraftSchema: any): FormSection[] {
  const sections = Array.isArray(rawDraftSchema?.sections)
    ? rawDraftSchema.sections
    : Array.isArray(rawDraftSchema?.pages)
      ? rawDraftSchema.pages
      : [];

  return sections.map((section: any) => ({
    id: String(section?.id ?? `sec_${Date.now()}`),
    title: String(section?.title ?? "Untitled section"),
    description:
      typeof section?.description === "string" ? section.description : undefined,
    fields: Array.isArray(section?.fields)
      ? section.fields.map((field: any) => {
          const fieldId = String(field?.id ?? `field_${Date.now()}`);
          const key =
            typeof field?.key === "string" && field.key
              ? field.key
              : fieldId;
          const rawValidation = field?.validation ?? {};
          const rawUi = field?.ui ?? {};
          const rawLogic = field?.logic ?? {};
          const validation = {
            min:
              toOptionalNumber(rawValidation?.min) ??
              toOptionalNumber(field?.min),
            max:
              toOptionalNumber(rawValidation?.max) ??
              toOptionalNumber(field?.max),
            pattern:
              typeof rawValidation?.pattern === "string"
                ? rawValidation.pattern
                : typeof field?.pattern === "string"
                  ? field.pattern
                  : undefined,
            allowedTypes:
              toOptionalStringArray(rawValidation?.allowedTypes) ??
              toOptionalStringArray(field?.allowedTypes),
          };

          const file = {
            allowedMimeTypes:
              toOptionalStringArray(rawUi?.allowedMimeTypes) ??
              validation.allowedTypes,
            maxFileSizeMB: toOptionalNumber(rawUi?.maxFileSizeMB),
            maxFiles: toOptionalNumber(rawUi?.maxFiles),
          };

          const showWhen = parseConditionGroup(rawLogic?.showWhen ?? field?.showWhen);
          const requireWhen = parseConditionGroup(
            rawLogic?.requireWhen ?? field?.requireWhen,
          );

          return {
            fieldId,
            key,
            type:
              schemaToUiFieldType[String(field?.type ?? "").toLowerCase()] ??
              "TEXT",
            label: String(field?.label ?? "Field"),
            required: Boolean(rawValidation?.required ?? field?.required),
            placeholder:
              typeof rawUi?.placeholder === "string"
                ? rawUi.placeholder
                : typeof field?.placeholder === "string"
                  ? field.placeholder
                  : undefined,
            description:
              typeof rawUi?.description === "string"
                ? rawUi.description
                : typeof field?.description === "string"
                  ? field.description
                  : undefined,
            options: Array.isArray(rawUi?.options ?? field?.options)
              ? (rawUi?.options ?? field.options)
                  .filter(
                    (o: any) =>
                      typeof o?.label === "string" && typeof o?.value === "string"
                  )
                  .map((o: any) => ({ label: o.label, value: o.value }))
              : undefined,
            validation:
              Object.values(validation).some((v) => v !== undefined)
                ? validation
                : undefined,
            file: Object.values(file).some((v) => v !== undefined) ? file : undefined,
            logic:
              showWhen || requireWhen
                ? {
                    ...(showWhen ? { showWhen } : {}),
                    ...(requireWhen ? { requireWhen } : {}),
                  }
                : undefined,
          };
        })
      : [],
  }));
}

function toDraftSchema(sections: FormSection[]) {
  return {
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description || undefined,
      fields: section.fields.map((field) => {
        const ui: Record<string, unknown> = {};
        if (field.placeholder) ui.placeholder = field.placeholder;
        if (field.description) ui.description = field.description;
        if (field.options && field.options.length > 0) ui.options = field.options;
        if (field.file?.allowedMimeTypes?.length)
          ui.allowedMimeTypes = field.file.allowedMimeTypes;
        if (field.file?.maxFileSizeMB !== undefined)
          ui.maxFileSizeMB = field.file.maxFileSizeMB;
        if (field.file?.maxFiles !== undefined)
          ui.maxFiles = field.file.maxFiles;

        const allowedTypes = mergeStringArrays(
          field.validation?.allowedTypes,
          field.file?.allowedMimeTypes
        );

        const validation: Record<string, unknown> = {};
        if (field.required) validation.required = true;
        if (field.validation?.min !== undefined) validation.min = field.validation.min;
        if (field.validation?.max !== undefined) validation.max = field.validation.max;
        if (field.validation?.pattern) validation.pattern = field.validation.pattern;
        if (allowedTypes && allowedTypes.length > 0)
          validation.allowedTypes = allowedTypes;

        const logic =
          field.logic?.showWhen || field.logic?.requireWhen
            ? {
                ...(field.logic?.showWhen
                  ? {
                      showWhen: {
                        mode: field.logic.showWhen.mode,
                        rules: field.logic.showWhen.rules.map((rule) => ({
                          fieldKey: rule.fieldKey,
                          operator: rule.operator,
                          ...(rule.value !== undefined
                            ? { value: rule.value }
                            : {}),
                        })),
                      },
                    }
                  : {}),
                ...(field.logic?.requireWhen
                  ? {
                      requireWhen: {
                        mode: field.logic.requireWhen.mode,
                        rules: field.logic.requireWhen.rules.map((rule) => ({
                          fieldKey: rule.fieldKey,
                          operator: rule.operator,
                          ...(rule.value !== undefined
                            ? { value: rule.value }
                            : {}),
                        })),
                      },
                    }
                  : {}),
              }
            : undefined;

        return {
          id: field.fieldId,
          key: field.key?.trim() || field.fieldId,
          type: uiToSchemaFieldType[field.type] ?? "text",
          label: field.label,
          validation: Object.keys(validation).length > 0 ? validation : undefined,
          ui: Object.keys(ui).length > 0 ? ui : undefined,
          logic,
        };
      }),
    })),
  };
}

function toFormDef(raw: any): FormDef {
  const sections = parseSections(raw?.draftSchema);
  const fieldCount = sections.reduce((sum, s) => sum + s.fields.length, 0);
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? raw?.name ?? "Untitled Form"),
    status: deriveStatus(raw),
    sectionCount: sections.length,
    fieldCount,
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
  };
}

function toFormDetail(raw: any): FormDetail {
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? raw?.name ?? "Untitled Form"),
    status: deriveStatus(raw),
    sections: parseSections(raw?.draftSchema),
  };
}

function toFormVersion(raw: any): FormVersion {
  return {
    id: String(raw?.id ?? ""),
    versionNumber: Number(raw?.versionNumber ?? raw?.version_number ?? 0),
    publishedAt: String(raw?.publishedAt ?? raw?.published_at ?? new Date().toISOString()),
    publishedBy:
      typeof raw?.publishedBy === "string"
        ? raw.publishedBy
        : typeof raw?.published_by === "string"
          ? raw.published_by
          : undefined,
  };
}

export default function FormsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();

  const [forms, setForms] = useState<FormDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Editor state
  const [editingForm, setEditingForm] = useState<FormDetail | null>(null);
  const [formVersions, setFormVersions] = useState<FormVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [versionDeleteTarget, setVersionDeleteTarget] = useState<FormVersion | null>(null);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [bulkOptionsTarget, setBulkOptionsTarget] = useState<{ sectionId: string; fieldId: string } | null>(null);
  const [bulkOptionsText, setBulkOptionsText] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient<any>(`/events/${eventId}/forms`);
        const rawList: any[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : [];
        setForms(rawList.map(toFormDef));
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [eventId]);

  async function openForm(formId: string) {
    setIsLoadingVersions(true);
    try {
      const [formRes, versionRes] = await Promise.all([
        apiClient<any>(`/events/${eventId}/forms/${formId}`),
        apiClient<any>(`/events/${eventId}/forms/${formId}/versions`),
      ]);
      const formRaw = formRes?.data ?? formRes;
      const rawVersions: any[] = Array.isArray(versionRes?.data)
        ? versionRes.data
        : Array.isArray(versionRes)
          ? versionRes
          : [];
      setEditingForm(toFormDetail(formRaw));
      setFormVersions(rawVersions.map(toFormVersion));
      setCollapsedSections({});
      setCollapsedFields({});
    } catch {
      /* handled */
    } finally {
      setIsLoadingVersions(false);
    }
  }

  async function createForm() {
    try {
      const res = await apiClient<any>(`/events/${eventId}/forms`, {
        method: "POST",
        body: { name: "Untitled Form" },
        csrfToken: csrfToken ?? undefined,
      });
      const data = toFormDetail(res?.data ?? res);
      setEditingForm(data);
      setFormVersions([]);
      setCollapsedSections({});
      setCollapsedFields({});
      setForms((prev) => [...prev, toFormDef(res?.data ?? res)]);
    } catch {
      /* handled */
    }
  }

  async function saveForm() {
    if (!editingForm) return;
    setIsSaving(true);
    try {
      await apiClient(`/events/${eventId}/forms/${editingForm.id}`, {
        method: "PATCH",
        body: {
          name: editingForm.title,
          draftSchema: toDraftSchema(editingForm.sections),
          draftUi: {},
        },
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Form saved as draft!");
      // Update list
      setForms((prev) =>
        prev.map((f) =>
          f.id === editingForm.id
            ? {
                ...f,
                title: editingForm.title,
                sectionCount: editingForm.sections.length,
                fieldCount: editingForm.sections.reduce(
                  (sum, s) => sum + s.fields.length,
                  0
                ),
                updatedAt: new Date().toISOString(),
              }
            : f
        )
      );
    } catch {
      /* handled */
    } finally {
      setIsSaving(false);
    }
  }

  async function publishForm() {
    if (!editingForm) return;
    setIsPublishing(true);
    try {
      const res = await apiClient<any>(`/events/${eventId}/forms/${editingForm.id}/publish`, {
        method: "POST",
        csrfToken: csrfToken ?? undefined,
      });
      const publishedVersion = toFormVersion(res?.data ?? res);
      setFormVersions((prev) => [
        publishedVersion,
        ...prev.filter((version) => version.id !== publishedVersion.id),
      ]);
      toast.success("Form published!");
      setEditingForm((prev) => (prev ? { ...prev, status: "PUBLISHED" } : prev));
      setForms((prev) =>
        prev.map((f) =>
          f.id === editingForm.id ? { ...f, status: "PUBLISHED" } : f
        )
      );
    } catch {
      /* handled */
    } finally {
      setIsPublishing(false);
      setShowPublishConfirm(false);
    }
  }

  async function deleteForm(id: string) {
    try {
      await apiClient(`/events/${eventId}/forms/${id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setForms((prev) => prev.filter((f) => f.id !== id));
      if (editingForm?.id === id) {
        setEditingForm(null);
        setFormVersions([]);
        setCollapsedSections({});
        setCollapsedFields({});
      }
      toast.success("Form deleted");
    } catch {
      /* handled */
    } finally {
      setDeleteTarget(null);
    }
  }

  async function deleteVersion(version: FormVersion) {
    if (!editingForm) return;
    setDeletingVersionId(version.id);
    try {
      await apiClient(`/events/${eventId}/forms/${editingForm.id}/versions/${version.id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      const remainingVersions = formVersions.filter((item) => item.id !== version.id);
      const nextStatus: "DRAFT" | "PUBLISHED" =
        remainingVersions.length > 0 ? "PUBLISHED" : "DRAFT";
      setFormVersions(remainingVersions);
      setEditingForm((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setForms((prev) =>
        prev.map((form) =>
          form.id === editingForm.id ? { ...form, status: nextStatus } : form
        )
      );
      toast.success(`Version ${version.versionNumber} deleted`);
    } catch {
      /* handled */
    } finally {
      setDeletingVersionId(null);
      setVersionDeleteTarget(null);
    }
  }

  // Section / field helpers for the editor
  function addSection() {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      sections: [
        ...editingForm.sections,
        {
          id: `sec_${Date.now()}`,
          title: `Section ${editingForm.sections.length + 1}`,
          fields: [],
        },
      ],
    });
  }

  function addField(sectionId: string) {
    if (!editingForm) return;
    const newFieldId = `field_${Date.now()}`;
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              fields: [
                ...s.fields,
                {
                  fieldId: newFieldId,
                  key: newFieldId,
                  type: "TEXT",
                  label: "New field",
                  required: false,
                },
              ],
            }
          : s
      ),
    });
  }

  function updateField(
    sectionId: string,
    fieldId: string,
    updates: Partial<FormField>
  ) {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              fields: s.fields.map((f) =>
                f.fieldId === fieldId ? { ...f, ...updates } : f
              ),
            }
          : s
      ),
    });
  }

  function removeField(sectionId: string, fieldId: string) {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.map((s) =>
        s.id === sectionId
          ? { ...s, fields: s.fields.filter((f) => f.fieldId !== fieldId) }
          : s
      ),
    });
    setCollapsedFields((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  function removeSection(sectionId: string) {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections.filter((s) => s.id !== sectionId),
    });
    setCollapsedSections((prev) => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });
  }

  function toggleSectionCollapse(sectionId: string) {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  function toggleFieldCollapse(fieldId: string) {
    setCollapsedFields((prev) => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
  }

  function setAllSectionCollapse(collapsed: boolean) {
    if (!editingForm) return;
    const nextState = Object.fromEntries(
      editingForm.sections.map((section) => [section.id, collapsed])
    );
    setCollapsedSections(nextState);
  }

  function setAllFieldCollapse(collapsed: boolean) {
    if (!editingForm) return;
    const nextState = Object.fromEntries(
      editingForm.sections.flatMap((section) =>
        section.fields.map((field) => [field.fieldId, collapsed] as const)
      )
    );
    setCollapsedFields(nextState);
  }

  function updateConditionGroup(
    sectionId: string,
    fieldId: string,
    groupKey: "showWhen" | "requireWhen",
    nextGroup: ConditionGroup | undefined,
  ) {
    if (!editingForm) return;
    const section = editingForm.sections.find((item) => item.id === sectionId);
    const field = section?.fields.find((item) => item.fieldId === fieldId);
    const currentLogic = field?.logic ?? {};
    const nextLogic = {
      ...currentLogic,
      [groupKey]: nextGroup,
    };
    if (!nextLogic.showWhen) delete nextLogic.showWhen;
    if (!nextLogic.requireWhen) delete nextLogic.requireWhen;
    updateField(sectionId, fieldId, {
      logic:
        nextLogic.showWhen || nextLogic.requireWhen ? nextLogic : undefined,
    });
  }

  const allFieldOptions = editingForm
    ? editingForm.sections.flatMap((section) =>
        section.fields.map((field) => ({
          key: field.key?.trim() || field.fieldId,
          label: field.label?.trim() || field.key || field.fieldId,
        })),
      )
    : [];

  // If editing a form, show the editor
  if (editingForm) {
    return (
      <div className="max-w-5xl space-y-6">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingForm(null);
                setFormVersions([]);
                setCollapsedSections({});
                setCollapsedFields({});
              }}
              className="mb-2"
            >
              Back to forms
            </Button>
            <Input
              value={editingForm.title}
              onChange={(e) =>
                setEditingForm({ ...editingForm, title: e.target.value })
              }
              className="text-lg font-bold border-none px-0 focus-visible:ring-0 min-w-0"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant={editingForm.status === "PUBLISHED" ? "default" : "secondary"}>
              {editingForm.status}
            </Badge>
            <Button variant="outline" onClick={saveForm} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileEdit className="mr-1.5 h-4 w-4" />
              )}
              Save draft
            </Button>
            <Button
              onClick={() => setShowPublishConfirm(true)}
              disabled={isPublishing}
            >
              {isPublishing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              {isPublishing
                ? "Publishing..."
                : editingForm.status === "PUBLISHED"
                ? "Publish new version"
                : "Publish"}
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Published versions</p>
              <Badge variant="secondary">{formVersions.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoadingVersions ? (
              <p className="text-sm text-muted-foreground">Loading versions...</p>
            ) : formVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No published versions yet.
              </p>
            ) : (
              formVersions.map((version) => (
                <div
                  key={version.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      Version {version.versionNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Published {new Date(version.publishedAt).toLocaleString("en-GB")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setVersionDeleteTarget(version)}
                    disabled={deletingVersionId === version.id}
                  >
                    {deletingVersionId === version.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Delete version
                  </Button>
                </div>
              ))
            )}
            <p className="text-[11px] text-muted-foreground">
              Only versions not referenced by workflow steps or applications can be
              deleted.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAllSectionCollapse(true)}>
            Collapse sections
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllSectionCollapse(false)}>
            Expand sections
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllFieldCollapse(true)}>
            Collapse questions
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllFieldCollapse(false)}>
            Expand questions
          </Button>
        </div>

        {editingForm.sections.length === 0 ? (
          <EmptyState
            icon={FileEdit}
            title="No sections"
            description="Add a section to start building your form."
            actionLabel="Add section"
            onAction={addSection}
          />
        ) : (
          <Reorder.Group
            axis="y"
            values={editingForm.sections}
            onReorder={(newOrder) =>
              setEditingForm({ ...editingForm, sections: newOrder })
            }
            className="space-y-4"
          >
            {editingForm.sections.map((section) => (
              <Reorder.Item key={section.id} value={section} className="list-none">
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab shrink-0" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => toggleSectionCollapse(section.id)}
                    >
                      {collapsedSections[section.id] ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Input
                      value={section.title}
                      onChange={(e) =>
                        setEditingForm({
                          ...editingForm,
                          sections: editingForm.sections.map((s) =>
                            s.id === section.id
                              ? { ...s, title: e.target.value }
                              : s
                          ),
                        })
                      }
                      className="font-medium flex-1 border-none px-0 focus-visible:ring-0 min-w-0"
                    />
                    <Badge variant="secondary" className="shrink-0">
                      {section.fields.length} questions
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive shrink-0"
                      onClick={() => removeSection(section.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                {!collapsedSections[section.id] && (
                <CardContent className="space-y-3">
                  <Reorder.Group
                    axis="y"
                    values={section.fields}
                    onReorder={(newOrder) => {
                      if (!editingForm) return;
                      setEditingForm({
                        ...editingForm,
                        sections: editingForm.sections.map((s) =>
                          s.id === section.id ? { ...s, fields: newOrder } : s
                        ),
                      });
                    }}
                    className="space-y-3"
                  >
                  {section.fields.map((field) => {
                    const isOptionField =
                      field.type === "SELECT" || field.type === "MULTISELECT";
                    const isTextField =
                      field.type === "TEXT" || field.type === "TEXTAREA";
                    const isNumberField = field.type === "NUMBER";
                    const isFileField = field.type === "FILE";
                    const options = field.options ?? [];

                    return (
                      <Reorder.Item key={field.fieldId} value={field} className="list-none">
                      <div
                        className="rounded-lg border bg-muted/20 p-3 overflow-hidden"
                      >
                        <div className="flex items-start gap-3">
                          <GripVertical className="mt-1 h-5 w-5 shrink-0 cursor-grab text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 text-left"
                              onClick={() => toggleFieldCollapse(field.fieldId)}
                            >
                              {collapsedFields[field.fieldId] ? (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate text-sm font-medium">
                                {field.label || "Untitled question"}
                              </span>
                              <Badge variant="secondary" className="shrink-0">
                                {fieldTypes.find((item) => item.value === field.type)?.label ?? field.type}
                              </Badge>
                              {field.required ? (
                                <Badge variant="outline" className="shrink-0">
                                  Required
                                </Badge>
                              ) : null}
                            </button>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              Key: {field.key || field.fieldId}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive"
                            onClick={() => removeField(section.id, field.fieldId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {!collapsedFields[field.fieldId] && (
                        <div className="mt-3 space-y-3 border-t pt-3">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              value={field.label}
                              onChange={(e) =>
                                updateField(section.id, field.fieldId, {
                                  label: e.target.value,
                                })
                              }
                              className="h-8 text-sm min-w-0"
                              placeholder="Field label"
                            />
                            <Select
                              value={field.type}
                              onValueChange={(v) =>
                                updateField(section.id, field.fieldId, {
                                  type: v,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-full sm:w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {fieldTypes.map((ft) => (
                                  <SelectItem key={ft.value} value={ft.value}>
                                    {ft.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Field key</Label>
                              <Input
                                value={field.key}
                                onChange={(e) =>
                                  updateField(section.id, field.fieldId, {
                                    key: e.target.value,
                                  })
                                }
                                className="h-7 text-xs"
                                placeholder="stable_key"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Placeholder</Label>
                              <Input
                                value={field.placeholder ?? ""}
                                onChange={(e) =>
                                  updateField(section.id, field.fieldId, {
                                    placeholder: e.target.value,
                                  })
                                }
                                className="h-7 text-xs"
                                placeholder="Placeholder text..."
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px]">Help text (Markdown)</Label>
                            <Textarea
                              value={field.description ?? ""}
                              onChange={(e) =>
                                updateField(section.id, field.fieldId, {
                                  description: e.target.value,
                                })
                              }
                              rows={2}
                              className="min-h-[58px] text-xs"
                              placeholder="Supports markdown (links, bold, lists)..."
                            />
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={field.required}
                                onCheckedChange={(v) =>
                                  updateField(section.id, field.fieldId, {
                                    required: v,
                                  })
                                }
                                id={`req_${field.fieldId}`}
                              />
                              <Label
                                htmlFor={`req_${field.fieldId}`}
                                className="text-xs"
                              >
                                Required
                              </Label>
                            </div>
                          </div>

                          <div className="space-y-2 rounded-md border border-dashed p-3">
                            <p className="text-xs font-medium">Conditional logic</p>
                            {(["showWhen", "requireWhen"] as const).map((groupKey) => {
                              const groupLabel =
                                groupKey === "showWhen"
                                  ? "Show field when"
                                  : "Require field when";
                              const group = field.logic?.[groupKey];
                              const fieldKey = field.key?.trim() || field.fieldId;
                              const availableLogicFields = allFieldOptions.filter(
                                (option) => option.key !== fieldKey,
                              );

                              return (
                                <div
                                  key={`${field.fieldId}-${groupKey}`}
                                  className="space-y-2 rounded-md border bg-muted/20 p-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <Label className="text-[11px]">{groupLabel}</Label>
                                    <Switch
                                      checked={Boolean(group)}
                                      disabled={availableLogicFields.length === 0}
                                      onCheckedChange={(checked) => {
                                        if (!checked) {
                                          updateConditionGroup(
                                            section.id,
                                            field.fieldId,
                                            groupKey,
                                            undefined,
                                          );
                                          return;
                                        }
                                        if (availableLogicFields.length === 0) {
                                          toast.error(
                                            "Add at least one other field before enabling conditions",
                                          );
                                          return;
                                        }
                                        updateConditionGroup(section.id, field.fieldId, groupKey, {
                                          mode: "all",
                                          rules: [
                                            {
                                              fieldKey: availableLogicFields[0].key,
                                              operator: "eq",
                                              value: "",
                                            },
                                          ],
                                        });
                                      }}
                                    />
                                  </div>

                                  {group && (
                                    <>
                                      <div className="space-y-1">
                                        <Label className="text-[11px]">Match mode</Label>
                                        <Select
                                          value={group.mode}
                                          onValueChange={(value) =>
                                            updateConditionGroup(section.id, field.fieldId, groupKey, {
                                              ...group,
                                              mode: value === "any" ? "any" : "all",
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-7 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="all">All rules</SelectItem>
                                            <SelectItem value="any">Any rule</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {group.rules.map((rule, ruleIndex) => {
                                        const operatorMeta = conditionOperators.find(
                                          (operator) => operator.value === rule.operator,
                                        );
                                        const needsValue = operatorMeta?.needsValue !== false;
                                        return (
                                          <div
                                            key={`${field.fieldId}-${groupKey}-rule-${ruleIndex}`}
                                            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-background p-2 sm:grid-cols-3"
                                          >
                                            <Select
                                              value={rule.fieldKey}
                                              onValueChange={(value) => {
                                                const nextRules = group.rules.map((entry, index) =>
                                                  index === ruleIndex
                                                    ? { ...entry, fieldKey: value }
                                                    : entry,
                                                );
                                                updateConditionGroup(
                                                  section.id,
                                                  field.fieldId,
                                                  groupKey,
                                                  { ...group, rules: nextRules },
                                                );
                                              }}
                                            >
                                              <SelectTrigger className="h-7 text-xs">
                                                <SelectValue placeholder="Field" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {availableLogicFields.map((option) => (
                                                  <SelectItem key={option.key} value={option.key}>
                                                    {option.label}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            <Select
                                              value={rule.operator}
                                              onValueChange={(value) => {
                                                const normalized =
                                                  normalizeConditionOperator(value);
                                                const nextRules = group.rules.map((entry, index) =>
                                                  index === ruleIndex
                                                    ? {
                                                        ...entry,
                                                        operator: normalized,
                                                        value:
                                                          normalized === "exists" ||
                                                          normalized === "not_exists"
                                                            ? undefined
                                                            : entry.value ?? "",
                                                      }
                                                    : entry,
                                                );
                                                updateConditionGroup(
                                                  section.id,
                                                  field.fieldId,
                                                  groupKey,
                                                  { ...group, rules: nextRules },
                                                );
                                              }}
                                            >
                                              <SelectTrigger className="h-7 text-xs">
                                                <SelectValue placeholder="Operator" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {conditionOperators.map((operator) => (
                                                  <SelectItem
                                                    key={operator.value}
                                                    value={operator.value}
                                                  >
                                                    {operator.label}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            <div className="flex items-center gap-2">
                                              {needsValue ? (
                                                <Input
                                                  value={rule.value ?? ""}
                                                  onChange={(event) => {
                                                    const nextRules = group.rules.map(
                                                      (entry, index) =>
                                                        index === ruleIndex
                                                          ? {
                                                              ...entry,
                                                              value: event.target.value,
                                                            }
                                                          : entry,
                                                    );
                                                    updateConditionGroup(
                                                      section.id,
                                                      field.fieldId,
                                                      groupKey,
                                                      { ...group, rules: nextRules },
                                                    );
                                                  }}
                                                  className="h-7 text-xs"
                                                  placeholder="Value"
                                                />
                                              ) : (
                                                <span className="text-[11px] text-muted-foreground">
                                                  No value needed
                                                </span>
                                              )}
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive"
                                                onClick={() => {
                                                  const nextRules = group.rules.filter(
                                                    (_, index) => index !== ruleIndex,
                                                  );
                                                  updateConditionGroup(
                                                    section.id,
                                                    field.fieldId,
                                                    groupKey,
                                                    nextRules.length > 0
                                                      ? { ...group, rules: nextRules }
                                                      : undefined,
                                                  );
                                                }}
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full border-dashed"
                                        onClick={() => {
                                          if (availableLogicFields.length === 0) return;
                                          updateConditionGroup(section.id, field.fieldId, groupKey, {
                                            ...group,
                                            rules: [
                                              ...group.rules,
                                              {
                                                fieldKey: availableLogicFields[0].key,
                                                operator: "eq",
                                                value: "",
                                              },
                                            ],
                                          });
                                        }}
                                      >
                                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                                        Add rule
                                      </Button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {isOptionField && (
                            <div className="space-y-2">
                              <Label className="text-xs">Options</Label>
                              {options.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">
                                  No options yet.
                                </p>
                              ) : null}
                              {options.map((opt, idx) => (
                                <div
                                  key={`${field.fieldId}_opt_${idx}`}
                                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
                                >
                                  <Input
                                    value={opt.label}
                                    onChange={(e) => {
                                      const next = options.map((o, i) =>
                                        i === idx ? { ...o, label: e.target.value } : o
                                      );
                                      updateField(section.id, field.fieldId, {
                                        options: next,
                                      });
                                    }}
                                    className="h-7 text-xs"
                                    placeholder="Label"
                                  />
                                  <Input
                                    value={opt.value}
                                    onChange={(e) => {
                                      const next = options.map((o, i) =>
                                        i === idx ? { ...o, value: e.target.value } : o
                                      );
                                      updateField(section.id, field.fieldId, {
                                        options: next,
                                      });
                                    }}
                                    className="h-7 text-xs"
                                    placeholder="Value"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => {
                                      const next = options.filter((_, i) => i !== idx);
                                      updateField(section.id, field.fieldId, {
                                        options: next.length > 0 ? next : undefined,
                                      });
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 border-dashed"
                                  onClick={() =>
                                    updateField(section.id, field.fieldId, {
                                      options: [
                                        ...options,
                                        {
                                          label: `Option ${options.length + 1}`,
                                          value: `option_${options.length + 1}`,
                                        },
                                      ],
                                    })
                                  }
                                >
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Add option
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 border-dashed"
                                  onClick={() => {
                                    setBulkOptionsTarget({ sectionId: section.id, fieldId: field.fieldId });
                                    setBulkOptionsText("");
                                  }}
                                >
                                  Bulk add
                                </Button>
                              </div>
                            </div>
                          )}

                          {isTextField && (
                            <div className="space-y-2">
                              <Label className="text-xs">Validation</Label>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Min length</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={field.validation?.min ?? ""}
                                    onChange={(e) =>
                                      updateField(section.id, field.fieldId, {
                                        validation: {
                                          ...field.validation,
                                          min: toOptionalNumber(e.target.value),
                                        },
                                      })
                                    }
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Max length</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={field.validation?.max ?? ""}
                                    onChange={(e) =>
                                      updateField(section.id, field.fieldId, {
                                        validation: {
                                          ...field.validation,
                                          max: toOptionalNumber(e.target.value),
                                        },
                                      })
                                    }
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Pattern</Label>
                                  <Input
                                    value={field.validation?.pattern ?? ""}
                                    onChange={(e) =>
                                      updateField(section.id, field.fieldId, {
                                        validation: {
                                          ...field.validation,
                                          pattern: e.target.value || undefined,
                                        },
                                      })
                                    }
                                    className="h-7 text-xs"
                                    placeholder="Regex"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {isNumberField && (
                            <div className="space-y-2">
                              <Label className="text-xs">Validation</Label>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Min value</Label>
                                  <Input
                                    type="number"
                                    value={field.validation?.min ?? ""}
                                    onChange={(e) =>
                                      updateField(section.id, field.fieldId, {
                                        validation: {
                                          ...field.validation,
                                          min: toOptionalNumber(e.target.value),
                                        },
                                      })
                                    }
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Max value</Label>
                                  <Input
                                    type="number"
                                    value={field.validation?.max ?? ""}
                                    onChange={(e) =>
                                      updateField(section.id, field.fieldId, {
                                        validation: {
                                          ...field.validation,
                                          max: toOptionalNumber(e.target.value),
                                        },
                                      })
                                    }
                                    className="h-7 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {isFileField && (
                            <div className="space-y-2">
                              <Label className="text-xs">File constraints</Label>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Allowed MIME types</Label>
                                  <Input
                                    value={
                                      field.file?.allowedMimeTypes?.join(", ") ?? ""
                                    }
                                    onChange={(e) => {
                                      const raw = e.target.value
                                        .split(",")
                                        .map((entry) => entry.trim())
                                        .filter((entry) => entry.length > 0);
                                      updateField(section.id, field.fieldId, {
                                        file: {
                                          ...field.file,
                                          allowedMimeTypes:
                                            raw.length > 0 ? raw : undefined,
                                        },
                                      });
                                    }}
                                    className="h-7 text-xs"
                                    placeholder="image/png, image/jpeg"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Max size (MB)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={field.file?.maxFileSizeMB ?? ""}
                                    onChange={(e) =>
                                      updateField(section.id, field.fieldId, {
                                        file: {
                                          ...field.file,
                                          maxFileSizeMB: toOptionalNumber(
                                            e.target.value
                                          ),
                                        },
                                      })
                                    }
                                    className="h-7 text-xs"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Max files</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={field.file?.maxFiles ?? ""}
                                    onChange={(e) =>
                                      updateField(section.id, field.fieldId, {
                                        file: {
                                          ...field.file,
                                          maxFiles: toOptionalNumber(e.target.value),
                                        },
                                      })
                                    }
                                    className="h-7 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                      </Reorder.Item>
                    );
                  })}
                  </Reorder.Group>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed"
                    onClick={() => addField(section.id)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add field
                  </Button>
                </CardContent>
                )}
              </Card>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}

        <Button
          variant="outline"
          onClick={addSection}
          className="w-full border-dashed"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add section
        </Button>

        <ConfirmDialog
          open={showPublishConfirm}
          onOpenChange={setShowPublishConfirm}
          title="Publish form?"
          description="Publishing creates a new immutable version. You can still edit the draft afterward."
          confirmLabel="Publish"
          onConfirm={publishForm}
        />

        <ConfirmDialog
          open={!!versionDeleteTarget}
          onOpenChange={(open) => !open && setVersionDeleteTarget(null)}
          title={
            versionDeleteTarget
              ? `Delete version ${versionDeleteTarget.versionNumber}?`
              : "Delete version?"
          }
          description="This only works when the version is not referenced by any workflow step, draft, or submitted application."
          confirmLabel="Delete version"
          onConfirm={() => versionDeleteTarget && deleteVersion(versionDeleteTarget)}
          variant="destructive"
        />

        <Dialog
          open={!!bulkOptionsTarget}
          onOpenChange={(open) => !open && setBulkOptionsTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk add options</DialogTitle>
              <DialogDescription>
                Paste one option per line. Each line becomes both the label and
                value.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={bulkOptionsText}
              onChange={(e) => setBulkOptionsText(e.target.value)}
              rows={10}
              placeholder={"Option A\nOption B\nOption C"}
            />
            <Button
              onClick={() => {
                if (!bulkOptionsTarget || !editingForm) return;
                const lines = bulkOptionsText
                  .split("\n")
                  .map((l) => l.trim())
                  .filter((l) => l.length > 0);
                if (lines.length === 0) {
                  setBulkOptionsTarget(null);
                  return;
                }
                const newOptions = lines.map((line) => ({
                  label: line,
                  value: line
                    .toLowerCase()
                    .replace(/\s+/g, "_")
                    .replace(/[^a-z0-9_-]/g, ""),
                }));
                const { sectionId, fieldId } = bulkOptionsTarget;
                const section = editingForm.sections.find((s) => s.id === sectionId);
                const field = section?.fields.find((f) => f.fieldId === fieldId);
                const existing = field?.options ?? [];
                updateField(sectionId, fieldId, {
                  options: [...existing, ...newOptions],
                });
                setBulkOptionsTarget(null);
              }}
            >
              Add {bulkOptionsText.split("\n").filter((l) => l.trim()).length} options
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
  // Forms list
  return (
    <div className="space-y-6">
      <PageHeader title="Forms" description="Create and manage application forms">
        <Button onClick={createForm}>
          <Plus className="mr-1.5 h-4 w-4" />
          New form
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No forms yet"
          description="Create a form to attach to a workflow step."
          actionLabel="Create form"
          onAction={createForm}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {forms.map((form) => (
            <Card key={form.id} className="cursor-pointer overflow-hidden transition-shadow hover:shadow-soft" onClick={() => openForm(form.id)}>
              <CardContent className="p-4 min-w-0">
                <div className="mb-3 flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{form.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {form.sectionCount} sections - {form.fieldCount} fields
                    </p>
                  </div>
                  <Badge
                    variant={
                      form.status === "PUBLISHED" ? "default" : "secondary"
                    }
                    className="shrink-0"
                  >
                    {form.status === "PUBLISHED" ? (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    ) : (
                      <AlertCircle className="mr-1 h-3 w-3" />
                    )}
                    {form.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    Updated {new Date(form.updatedAt).toLocaleDateString("en-GB")}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(form.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete form?"
        description="This action cannot be undone. Forms with versions linked to workflow steps or any application data cannot be deleted."
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && deleteForm(deleteTarget)}
        variant="destructive"
      />
    </div>
  );
}

