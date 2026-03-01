"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  User,
  GraduationCap,
  Building2,
  Link as LinkIcon,
  Tag,
  StickyNote,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Plus,
  Trash2,
  X,
  MessageSquare,
  Send,
  AlertTriangle,
  RefreshCcw,
  PencilLine,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageHeader,
  StatusBadge,
  StepTimeline,
  CardSkeleton,
  ConfirmDialog,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { useEventBasePath } from "@/hooks/use-event-base-path";
import { toast } from "sonner";
import { renderAnswerValue } from "@/lib/render-answer-value";
import { getRequiredFieldKeySet } from "@/lib/file-answer-utils";
import { FileUpload, type FileUploadValue } from "@/components/forms/FileUpload";
import { FormMarkdown } from "@/components/forms/form-markdown";
import { Permission } from "@event-platform/shared";

interface NoteEntry {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

interface ApplicantProfile {
  fullName?: string;
  phone?: string;
  education?: string;
  institution?: string;
  city?: string;
  country?: string;
  links?: string[];
}

interface ApplicationDetail {
  id: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  applicantCity?: string;
  applicantCountry?: string;
  applicantProfile?: ApplicantProfile;
  status: string;
  decision: string;
  decisionPublished: boolean;
  decisionDraft?: {
    templateId?: string;
    templateName?: string;
    rendered?: {
      subject?: string;
      body?: string;
    };
  } | null;
  tags: string[];
  notes: NoteEntry[];
  steps: Array<{
    id: string;
    title: string;
    status: string;
    submittedAt: string;
    reviewedAt: string;
    reviewerName: string;
    answers: Record<string, unknown>;
    latestSubmissionVersionId: string | null;
    formDefinition: Record<string, unknown> | null;
    fieldDefinitions: StepFieldDefinition[];
    stepIndex: number;
  }>;
  createdAt: string;
}

interface ApplicationMessage {
  id: string;
  messageId: string;
  title: string;
  type: string;
  bodyRich: unknown;
  bodyText: string | null;
  actionButtons: Array<Record<string, unknown>>;
  createdAt: string;
  readAt: string | null;
  senderName: string;
  senderEmail: string | null;
}

interface NeedsInfoRequest {
  id: string;
  stepId: string;
  submissionVersionId: string | null;
  targetFieldIds: string[];
  message: string;
  deadlineAt: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorEmail: string;
  details: string;
  createdAt: string;
  redactionApplied: boolean;
}

interface RequestFieldOption {
  id: string;
  label: string;
  section: string;
  required?: boolean;
  type?: string;
}

interface DecisionTemplate {
  id: string;
  name: string;
  status: "ACCEPTED" | "WAITLISTED" | "REJECTED";
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
}

interface StepFieldOption {
  label: string;
  value: string;
}

interface StepFieldDefinition {
  id: string;
  key: string;
  label: string;
  section: string;
  required?: boolean;
  type?: string;
  options?: StepFieldOption[];
  placeholder?: string;
  description?: string;
  allowedMimeTypes?: string[];
  maxFiles?: number;
  maxFileSizeMB?: number;
}

type FieldEditorKind =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "file"
  | "json";

interface FieldEditTarget {
  stepId: string;
  stepTitle: string;
  versionId: string;
  fieldKey: string;
  fieldLabel: string;
  field: StepFieldDefinition | null;
  currentValue: unknown;
}

function parseInternalNotes(rawNotes: unknown): NoteEntry[] {
  if (typeof rawNotes !== "string" || !rawNotes.trim()) return [];

  const entries = rawNotes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const match = line.match(/^\[(.+)\]\s([^:]+):\s([\s\S]+)$/);
      if (!match) {
        return {
          id: `legacy-${idx}`,
          content: line,
          authorName: "Staff",
          createdAt: new Date().toISOString(),
        };
      }
      const [, createdAt, authorName, content] = match;
      return {
        id: `note-${idx}-${createdAt}`,
        content,
        authorName,
        createdAt,
      };
    });

  return entries.reverse();
}

function serializeInternalNotes(notes: NoteEntry[]): string {
  return [...notes]
    .reverse()
    .map(
      (note) =>
        `[${new Date(note.createdAt).toISOString()}] ${note.authorName}: ${note.content.replace(/\s+/g, " ").trim()}`
    )
    .join("\n");
}

function normalizeApplicantProfile(raw: unknown): ApplicantProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const profile = raw as Record<string, unknown>;
  const rawLinks = profile.links;
  const links = Array.isArray(rawLinks)
    ? rawLinks
        .filter((link): link is string => typeof link === "string")
        .map((link) => link.trim())
        .filter(Boolean)
    : [];

  const normalizeField = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

  return {
    fullName: normalizeField(profile.fullName),
    phone: normalizeField(profile.phone),
    education: normalizeField(profile.education),
    institution: normalizeField(profile.institution),
    city: normalizeField(profile.city),
    country: normalizeField(profile.country),
    links,
  };
}

function parseFormDefinition(definition: unknown): Record<string, unknown> | null {
  if (!definition) return null;
  if (typeof definition === "string") {
    try {
      const parsed = JSON.parse(definition);
      return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof definition === "object") {
    const record = definition as Record<string, unknown>;
    if (record && typeof record.schema === "object" && record.schema) {
      return record.schema as Record<string, unknown>;
    }
    return record;
  }
  return null;
}

function normalizeStepAnswers(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const answers = { ...(value as Record<string, unknown>) };
  const nestedData = answers.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    Object.assign(answers, nestedData as Record<string, unknown>);
  }
  if ("data" in answers && Object.keys(answers).some((key) => key !== "data")) {
    delete answers.data;
  }
  return answers;
}

function getVisibleAnswerEntries(
  answers: Record<string, unknown>
): Array<[string, unknown]> {
  return Object.entries(answers).filter(([key]) => key !== "data");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFieldType(type: unknown): string | undefined {
  if (typeof type !== "string" || type.trim().length === 0) return undefined;
  const normalized = type.trim().toLowerCase();
  if (normalized === "multi_select") return "multiselect";
  if (normalized === "file") return "file_upload";
  return normalized;
}

function inferFieldTypeFromAnswer(value: unknown): string | undefined {
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "text";
  if (Array.isArray(value)) {
    if (
      value.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.fileObjectId === "string" &&
          entry.fileObjectId.trim().length > 0
      )
    ) {
      return "file_upload";
    }
    if (
      value.every((entry) => typeof entry === "string" || entry === null)
    ) {
      return "multiselect";
    }
  }
  if (
    isRecord(value) &&
    typeof value.fileObjectId === "string" &&
    value.fileObjectId.trim().length > 0
  ) {
    return "file_upload";
  }
  return undefined;
}

function normalizeFieldOptions(value: unknown): StepFieldOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .filter(isRecord)
    .map((option) => {
      const label = typeof option.label === "string" ? option.label.trim() : "";
      const optionValue =
        typeof option.value === "string" ? option.value.trim() : "";
      if (!label || !optionValue) return null;
      return { label, value: optionValue };
    })
    .filter((option): option is StepFieldOption => option !== null);
  return options.length > 0 ? options : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFileUploadList(value: unknown): FileUploadValue[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeFileUploadList(entry));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return [{ fileObjectId: trimmed, originalFilename: trimmed, sizeBytes: 0 }];
  }

  if (isRecord(value) && typeof value.fileObjectId === "string") {
    const fileObjectId = value.fileObjectId.trim();
    if (!fileObjectId) return [];
    return [
      {
        fileObjectId,
        originalFilename:
          typeof value.originalFilename === "string" &&
          value.originalFilename.trim().length > 0
            ? value.originalFilename.trim()
            : fileObjectId,
        sizeBytes:
          typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes)
            ? value.sizeBytes
            : 0,
      },
    ];
  }

  return [];
}

function normalizeFileUploadSelection(
  value: unknown,
  multiple: boolean
): FileUploadValue | FileUploadValue[] | null {
  const files = normalizeFileUploadList(value);
  if (files.length === 0) return null;
  if (multiple) return files;
  return files[0] ?? null;
}

function toPatchedFileAnswer(
  value: unknown,
  multiple: boolean
): FileUploadValue | FileUploadValue[] | null {
  const files = normalizeFileUploadList(value);
  if (multiple) return files;
  return files[0] ?? null;
}

function extractStepFieldDefinitions(
  definition?: Record<string, unknown> | null,
  answers?: Record<string, unknown>
): StepFieldDefinition[] {
  const fields: StepFieldDefinition[] = [];
  const seen = new Set<string>();

  const addField = (rawField: unknown, section: string) => {
    const field = isRecord(rawField) ? rawField : {};
    const keyCandidates = [field.key, field.fieldId, field.id]
      .filter((candidate): candidate is string => typeof candidate === "string")
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0);
    const key = keyCandidates[0];
    if (!key || seen.has(key)) return;
    seen.add(key);

    const validation = isRecord(field.validation) ? field.validation : {};
    const ui = isRecord(field.ui) ? field.ui : {};
    const normalizedType = normalizeFieldType(field.type);
    const options = normalizeFieldOptions(ui.options ?? field.options);

    fields.push({
      id:
        typeof field.id === "string" && field.id.trim().length > 0
          ? field.id.trim()
          : key,
      key,
      label:
        typeof field.label === "string" && field.label.trim().length > 0
          ? field.label.trim()
          : key,
      section,
      required:
        typeof validation.required === "boolean"
          ? validation.required
          : typeof field.required === "boolean"
          ? field.required
          : undefined,
      type: normalizedType,
      options,
      placeholder:
        typeof ui.placeholder === "string" && ui.placeholder.trim().length > 0
          ? ui.placeholder.trim()
          : typeof field.placeholder === "string" && field.placeholder.trim().length > 0
          ? field.placeholder.trim()
          : undefined,
      description:
        typeof ui.description === "string" && ui.description.trim().length > 0
          ? ui.description.trim()
          : typeof field.description === "string" && field.description.trim().length > 0
          ? field.description.trim()
          : undefined,
      allowedMimeTypes:
        normalizeStringArray(ui.allowedMimeTypes) ??
        normalizeStringArray(validation.allowedTypes) ??
        normalizeStringArray(field.allowedTypes),
      maxFiles:
        typeof ui.maxFiles === "number" && Number.isFinite(ui.maxFiles)
          ? ui.maxFiles
          : undefined,
      maxFileSizeMB:
        typeof ui.maxFileSizeMB === "number" && Number.isFinite(ui.maxFileSizeMB)
          ? ui.maxFileSizeMB
          : undefined,
    });
  };

  const schema = parseFormDefinition(definition);
  const sectionLike = Array.isArray(schema?.sections)
    ? (schema.sections as unknown[])
    : Array.isArray(schema?.pages)
    ? (schema.pages as unknown[])
    : [];

  sectionLike.forEach((section, index) => {
    const sectionRecord = isRecord(section) ? section : {};
    const sectionTitle =
      typeof sectionRecord.title === "string" &&
      sectionRecord.title.trim().length > 0
        ? sectionRecord.title.trim()
        : `Section ${index + 1}`;
    const sectionFields = Array.isArray(sectionRecord.fields)
      ? sectionRecord.fields
      : [];
    sectionFields.forEach((field) => addField(field, sectionTitle));
  });

  const rootFields = Array.isArray(schema?.fields) ? schema.fields : [];
  rootFields.forEach((field) => addField(field, "General"));

  if (answers) {
    Object.entries(answers)
      .filter(([key]) => key !== "data")
      .forEach(([key, value]) =>
        addField(
          {
            fieldId: key,
            label: key,
            type: inferFieldTypeFromAnswer(value),
          },
          "Response"
        )
      );
  }

  return fields;
}

function extractRequestFields(
  definition?: Record<string, unknown> | null,
  answers?: Record<string, unknown>
): RequestFieldOption[] {
  return extractStepFieldDefinitions(definition, answers).map((field) => ({
    id: field.key,
    label: field.label,
    section: field.section,
    required: field.required,
    type: field.type,
  }));
}

function getFieldEditorKind(
  field: StepFieldDefinition | null,
  currentValue: unknown
): FieldEditorKind {
  const type = normalizeFieldType(field?.type);
  switch (type) {
    case "text":
      return "text";
    case "textarea":
      return "textarea";
    case "number":
      return "number";
    case "email":
      return "email";
    case "date":
      return "date";
    case "select":
      return "select";
    case "multiselect":
      return "multiselect";
    case "checkbox":
      return "checkbox";
    case "file_upload":
      return "file";
    default:
      break;
  }

  if (typeof currentValue === "string") return "text";
  if (typeof currentValue === "number") return "number";
  if (typeof currentValue === "boolean") return "checkbox";
  return "json";
}

function getInitialFieldEditValue(
  field: StepFieldDefinition | null,
  currentValue: unknown
): unknown {
  const editorKind = getFieldEditorKind(field, currentValue);
  switch (editorKind) {
    case "text":
    case "textarea":
    case "email":
    case "date":
    case "select":
      return typeof currentValue === "string" ? currentValue : "";
    case "number":
      if (currentValue === null || currentValue === undefined) return "";
      if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
        return String(currentValue);
      }
      if (typeof currentValue === "string") return currentValue;
      return "";
    case "multiselect":
      if (Array.isArray(currentValue)) {
        return currentValue.filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.trim().length > 0
        );
      }
      return [];
    case "checkbox":
      return currentValue === true;
    case "file": {
      const multiple =
        typeof field?.maxFiles === "number"
          ? field.maxFiles > 1
          : Array.isArray(currentValue);
      return normalizeFileUploadSelection(currentValue, multiple);
    }
    case "json":
    default:
      return formatPatchEditorValue(currentValue);
  }
}

function formatPatchEditorValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null, null, 2);
}

function parsePatchEditorValue(input: string, originalValue: unknown): unknown {
  if (typeof originalValue === "string") return input;
  return JSON.parse(input);
}

function resolveFieldPatchValue(
  target: FieldEditTarget,
  draftValue: unknown
): { value?: unknown; error?: string } {
  const editorKind = getFieldEditorKind(target.field, target.currentValue);

  if (editorKind === "checkbox") {
    return { value: draftValue === true };
  }

  if (editorKind === "multiselect") {
    const values = Array.isArray(draftValue)
      ? Array.from(
          new Set(
            draftValue
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
          )
        )
      : [];
    if (target.field?.options?.length) {
      const allowed = new Set(target.field.options.map((option) => option.value));
      const invalid = values.find((value) => !allowed.has(value));
      if (invalid) return { error: `Invalid option selected: ${invalid}` };
    }
    return { value: values };
  }

  if (editorKind === "number") {
    const raw =
      typeof draftValue === "string"
        ? draftValue.trim()
        : draftValue === null || draftValue === undefined
        ? ""
        : String(draftValue).trim();
    if (raw.length === 0) return { value: null };
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return { error: "Enter a valid number." };
    return { value: parsed };
  }

  if (editorKind === "file") {
    const multiple =
      typeof target.field?.maxFiles === "number"
        ? target.field.maxFiles > 1
        : Array.isArray(target.currentValue);
    return { value: toPatchedFileAnswer(draftValue, multiple) };
  }

  if (editorKind === "json") {
    try {
      const textInput =
        typeof draftValue === "string" ? draftValue : formatPatchEditorValue(draftValue);
      return {
        value: parsePatchEditorValue(textInput, target.currentValue),
      };
    } catch {
      return { error: "Invalid value. Use valid JSON for non-text fields." };
    }
  }

  const nextValue =
    typeof draftValue === "string"
      ? draftValue
      : draftValue === null || draftValue === undefined
      ? ""
      : String(draftValue);
  if (
    editorKind === "select" &&
    target.field?.options?.length &&
    nextValue.length > 0
  ) {
    const allowed = new Set(target.field.options.map((option) => option.value));
    if (!allowed.has(nextValue)) {
      return { error: "Select a valid option." };
    }
  }
  return { value: nextValue };
}

function formatAuditEntity(entityType: string): string {
  const map: Record<string, string> = {
    applications: "Application",
    application_step_states: "Step status",
    step_submission_versions: "Submission",
    needs_info_requests: "Needs info",
    review_records: "Review",
    admin_change_patches: "Patch",
    messages: "Message",
    message_recipients: "Message delivery",
  };
  return map[entityType] ?? entityType;
}

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    upsert: "Upserted",
    createMany: "Bulk created",
    updateMany: "Bulk updated",
    deleteMany: "Bulk deleted",
  };
  return map[action] ?? action;
}

function getMessageBody(message: ApplicationMessage): string {
  if (typeof message.bodyText === "string" && message.bodyText.trim().length > 0) {
    return message.bodyText;
  }
  if (typeof message.bodyRich === "string") return message.bodyRich;
  if (message.bodyRich && typeof message.bodyRich === "object") {
    return JSON.stringify(message.bodyRich, null, 2);
  }
  return "";
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const appId = params.applicationId as string;
  const basePath = useEventBasePath();
  const { csrfToken, user } = useAuth();
  const { hasPermission } = usePermissions(eventId);

  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Decision state
  const [draftDecision, setDraftDecision] = useState<string>("");
  const [decisionTemplates, setDecisionTemplates] = useState<DecisionTemplate[]>([]);
  const [selectedDecisionTemplateId, setSelectedDecisionTemplateId] =
    useState<string>("__none__");
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  // Tags state
  const [newTag, setNewTag] = useState("");
  const [isUpdatingTags, setIsUpdatingTags] = useState(false);

  // Notes state
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [isClearingNotes, setIsClearingNotes] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingApplication, setIsDeletingApplication] = useState(false);

  // Messages state
  const [messages, setMessages] = useState<ApplicationMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showComposeMessage, setShowComposeMessage] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAction, setComposeAction] = useState<"NONE" | "APPLICATION" | "STEP" | "LINK">(
    "APPLICATION"
  );
  const [composeActionLabel, setComposeActionLabel] = useState("View application");
  const [composeActionStepId, setComposeActionStepId] = useState("");
  const [composeActionUrl, setComposeActionUrl] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Needs-info state
  const [needsInfoRequests, setNeedsInfoRequests] = useState<NeedsInfoRequest[]>([]);
  const [isLoadingNeedsInfo, setIsLoadingNeedsInfo] = useState(false);
  const [showRequestInfo, setShowRequestInfo] = useState(false);
  const [requestStepId, setRequestStepId] = useState<string>("");
  const [requestFieldIds, setRequestFieldIds] = useState<string[]>([]);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestDeadline, setRequestDeadline] = useState("");
  const [requestNotifyApplicant, setRequestNotifyApplicant] = useState(true);
  const [requestSendEmail, setRequestSendEmail] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Audit state
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditFilter, setAuditFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");

  // Patch-edit state
  const [fieldEditTarget, setFieldEditTarget] = useState<FieldEditTarget | null>(null);
  const [fieldEditValue, setFieldEditValue] = useState<unknown>("");
  const [fieldEditReason, setFieldEditReason] = useState("");
  const [fieldEditAcknowledge, setFieldEditAcknowledge] = useState(false);
  const [isApplyingFieldPatch, setIsApplyingFieldPatch] = useState(false);

  const canSendMessages = hasPermission(Permission.EVENT_MESSAGES_SEND);
  const canReadMessages = hasPermission(Permission.EVENT_MESSAGES_READ);
  const canReviewSteps = hasPermission(Permission.EVENT_STEP_REVIEW);
  const canViewAudit = hasPermission(Permission.EVENT_APPLICATION_READ_BASIC);
  const canDraftDecision = hasPermission(Permission.EVENT_DECISION_DRAFT);
  const canPublishDecision = hasPermission(Permission.EVENT_DECISION_PUBLISH);
  const canManageDecisions = canDraftDecision || canPublishDecision;
  const canManageTags = hasPermission(Permission.EVENT_APPLICATION_TAGS_MANAGE);
  const canManageNotes = hasPermission(Permission.EVENT_APPLICATION_NOTES_MANAGE);
  const canPatchSteps = hasPermission(Permission.EVENT_STEP_PATCH);
  const canDeleteApplication = hasPermission(Permission.EVENT_APPLICATION_DELETE);
  const canDeleteNeedsInfo = canDeleteApplication;

  const loadApplication = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await apiClient<
        Record<string, unknown> | { data: Record<string, unknown> }
      >(`/events/${eventId}/applications/${appId}`);
      const raw: any =
        res && typeof res === "object" && "data" in res ? (res as any).data : res;

      // Normalise API ApplicationDetail -> frontend shape
      const applicantProfile = normalizeApplicantProfile(
        raw?.applicantProfile ?? raw?.applicant_profile
      );
      const detail: ApplicationDetail = {
        id: raw.id,
        applicantUserId: raw.applicantUserId ?? raw.applicant_user_id,
        applicantName:
          raw.applicantName ??
          applicantProfile?.fullName ??
          raw.applicantEmail ??
          "Unknown",
        applicantEmail: raw.applicantEmail ?? "",
        applicantPhone: applicantProfile?.phone ?? raw.applicantPhone,
        applicantCity: applicantProfile?.city ?? raw.applicantCity,
        applicantCountry: applicantProfile?.country ?? raw.applicantCountry,
        applicantProfile: applicantProfile ?? undefined,
        status: raw.derivedStatus ?? raw.status ?? "UNKNOWN",
        decision: raw.decisionStatus ?? raw.decision,
        decisionPublished: raw.decisionPublishedAt != null,
        decisionDraft:
          raw.decisionDraft && typeof raw.decisionDraft === "object"
            ? (raw.decisionDraft as ApplicationDetail["decisionDraft"])
            : raw.decision_draft && typeof raw.decision_draft === "object"
              ? (raw.decision_draft as ApplicationDetail["decisionDraft"])
              : null,
        tags: raw.tags ?? [],
        notes: parseInternalNotes(raw.internalNotes),
        steps: (raw.stepStates ?? raw.steps ?? []).map((s: any) => {
          const answers = normalizeStepAnswers(s.answers) ?? {};
          const formDefinition = parseFormDefinition(
            s.formDefinition ?? s.form_definition ?? null
          );
          return {
            id: s.stepId ?? s.id,
            title: s.stepTitle ?? s.title ?? "Step",
            status: s.status,
            submittedAt: s.lastActivityAt ?? s.submittedAt,
            reviewedAt: s.reviewedAt,
            reviewerName: s.reviewerName,
            answers,
            latestSubmissionVersionId:
              s.latestSubmissionVersionId ?? s.latest_submission_version_id ?? null,
            formDefinition,
            fieldDefinitions: extractStepFieldDefinitions(formDefinition, answers),
            stepIndex: s.stepIndex ?? s.step_index,
          };
        }),
        createdAt: raw.createdAt ?? new Date().toISOString(),
      };
      setApp(detail);
      if (detail.decision) setDraftDecision(detail.decision);
      setSelectedDecisionTemplateId(detail.decisionDraft?.templateId ?? "__none__");
      if (detail.steps.length > 0) {
        setComposeActionStepId((current) => current || detail.steps[0].id);
      }
    } catch {
      /* handled */
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [eventId, appId]);

  const loadDecisionTemplates = useCallback(async () => {
    if (!canManageDecisions) return;
    try {
      const res = await apiClient<{ data?: DecisionTemplate[] }>(
        `/events/${eventId}/decision-templates`,
      );
      const items = Array.isArray(res?.data)
        ? res.data.filter((template) => template.isActive)
        : [];
      setDecisionTemplates(items);
    } catch {
      /* handled */
    }
  }, [canManageDecisions, eventId]);

  useEffect(() => {
    loadApplication();
    loadDecisionTemplates();
  }, [loadApplication, loadDecisionTemplates]);

  const loadMessages = useCallback(async () => {
    if (!canReadMessages) return;
    setIsLoadingMessages(true);
    try {
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/messages`
      );
      const list: ApplicationMessage[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : [];
      setMessages(list);
    } catch {
      /* handled */
    } finally {
      setIsLoadingMessages(false);
    }
  }, [canReadMessages, eventId, appId]);

  const loadNeedsInfo = useCallback(async () => {
    setIsLoadingNeedsInfo(true);
    try {
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/needs-info`
      );
      const list: NeedsInfoRequest[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : [];
      setNeedsInfoRequests(list);
    } catch {
      /* handled */
    } finally {
      setIsLoadingNeedsInfo(false);
    }
  }, [eventId, appId]);

  const loadAudit = useCallback(async () => {
    if (!canViewAudit) return;
    setIsLoadingAudit(true);
    try {
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/audit?limit=200`
      );
      const list: AuditEntry[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : [];
      setAuditEntries(list);
    } catch {
      /* handled */
    } finally {
      setIsLoadingAudit(false);
    }
  }, [canViewAudit, eventId, appId]);

  useEffect(() => {
    loadMessages();
    loadNeedsInfo();
    loadAudit();
  }, [loadMessages, loadNeedsInfo, loadAudit]);

  useEffect(() => {
    if (!showRequestInfo) return;
    setRequestFieldIds([]);
  }, [requestStepId, showRequestInfo]);

  const decisionTemplatesForDraftStatus = useMemo<DecisionTemplate[]>(() => {
    const normalized = String(draftDecision ?? "").toUpperCase();
    if (
      normalized !== "ACCEPTED" &&
      normalized !== "WAITLISTED" &&
      normalized !== "REJECTED"
    ) {
      return [] as DecisionTemplate[];
    }
    return decisionTemplates.filter(
      (template: DecisionTemplate) => template.status === normalized,
    );
  }, [decisionTemplates, draftDecision]);

  useEffect(() => {
    if (selectedDecisionTemplateId === "__none__") return;
    const exists = decisionTemplatesForDraftStatus.some(
      (template: DecisionTemplate) => template.id === selectedDecisionTemplateId,
    );
    if (!exists) {
      setSelectedDecisionTemplateId("__none__");
    }
  }, [decisionTemplatesForDraftStatus, selectedDecisionTemplateId]);

  async function saveDecision() {
    if (!canManageDecisions) {
      toast.error("You do not have permission to update decisions.");
      return;
    }
    if (!draftDecision) {
      toast.error("Select a decision first.");
      return;
    }
    const templateId =
      selectedDecisionTemplateId === "__none__"
        ? null
        : selectedDecisionTemplateId;
    if (templateId) {
      const selectedTemplate = decisionTemplates.find(
        (template) => template.id === templateId,
      );
      if (!selectedTemplate) {
        toast.error("Selected template is not available");
        return;
      }
      if (selectedTemplate.status !== draftDecision) {
        toast.error("Template status must match the selected decision");
        return;
      }
    }
    try {
      await apiClient(`/events/${eventId}/applications/${appId}/decision`, {
        method: "PATCH",
        body: { status: draftDecision, draft: true, templateId },
        csrfToken: csrfToken ?? undefined,
      });
      await loadApplication(true);
      toast.success("Decision saved as draft");
    } catch {
      /* handled */
    }
  }

  async function unpublishDecision() {
    if (!canManageDecisions) {
      toast.error("You do not have permission to update decisions.");
      return;
    }
    if (!app) return;
    setIsUnpublishing(true);
    try {
      const status = draftDecision || app.decision || "";
      if (!status) return;
      await apiClient(`/events/${eventId}/applications/${appId}/decision`, {
        method: "PATCH",
        body: { status, draft: true },
        csrfToken: csrfToken ?? undefined,
      });
      setApp((prev) =>
        prev ? { ...prev, decisionPublished: false, decision: status } : prev
      );
      toast.success("Decision unpublished");
    } catch {
      /* handled */
    } finally {
      setIsUnpublishing(false);
    }
  }

  async function publishDecision() {
    if (!canPublishDecision) {
      toast.error("You do not have permission to publish decisions.");
      return;
    }
    setIsPublishing(true);
    try {
      await apiClient(
        `/events/${eventId}/applications/decisions/publish`,
        {
          method: "POST",
          body: { applicationIds: [appId] },
          csrfToken: csrfToken ?? undefined,
        }
      );
      setApp((prev) =>
        prev ? { ...prev, decisionPublished: true } : prev
      );
      toast.success("Decision published to applicant!");
    } catch {
      /* handled */
    } finally {
      setIsPublishing(false);
      setShowPublishConfirm(false);
    }
  }

  async function addTag() {
    if (!canManageTags) {
      toast.error("You do not have permission to edit tags.");
      return;
    }
    if (!app || !newTag.trim()) return;

    const normalizedTag = newTag.trim();
    if (app.tags.includes(normalizedTag)) {
      setNewTag("");
      return;
    }

    setIsUpdatingTags(true);
    try {
      const nextTags = [...app.tags, normalizedTag];
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/tags`,
        {
          method: "PATCH",
          body: { tags: nextTags },
          csrfToken: csrfToken ?? undefined,
        }
      );
      const updated = res?.data ?? res;
      setApp((prev) =>
        prev
          ? {
              ...prev,
              tags: Array.isArray(updated?.tags) ? updated.tags : nextTags,
            }
          : prev
      );
      setNewTag("");
      toast.success("Tag added");
    } catch {
      /* handled */
    } finally {
      setIsUpdatingTags(false);
    }
  }

  async function removeTag(tag: string) {
    if (!canManageTags) {
      toast.error("You do not have permission to edit tags.");
      return;
    }
    if (!app) return;

    setIsUpdatingTags(true);
    try {
      const nextTags = app.tags.filter((t) => t !== tag);
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/tags`,
        {
          method: "PATCH",
          body: { tags: nextTags },
          csrfToken: csrfToken ?? undefined,
        }
      );
      const updated = res?.data ?? res;
      setApp((prev) =>
        prev
          ? {
              ...prev,
              tags: Array.isArray(updated?.tags) ? updated.tags : nextTags,
            }
          : prev
      );
      toast.success("Tag removed");
    } catch {
      /* handled */
    } finally {
      setIsUpdatingTags(false);
    }
  }

  async function addNote() {
    if (!canManageNotes) {
      toast.error("You do not have permission to edit notes.");
      return;
    }
    if (!app || !newNote.trim()) return;
    setIsAddingNote(true);
    try {
      const authorName =
        user?.fullName?.trim() ||
        user?.email?.trim() ||
        "Staff";
      const note: NoteEntry = {
        id: String(Date.now()),
        content: newNote.trim(),
        authorName,
        createdAt: new Date().toISOString(),
      };
      const nextNotes = [note, ...app.notes];
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/internal-notes`,
        {
          method: "PATCH",
          body: { internalNotes: serializeInternalNotes(nextNotes) },
          csrfToken: csrfToken ?? undefined,
        }
      );
      const updated = res?.data ?? res;
      setApp((prev) =>
        prev
          ? {
              ...prev,
              notes:
                updated &&
                typeof updated === "object" &&
                "internalNotes" in updated
                  ? parseInternalNotes(updated.internalNotes)
                  : nextNotes,
            }
          : prev
      );
      setNewNote("");
      toast.success("Note added");
    } catch {
      /* handled */
    } finally {
      setIsAddingNote(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!canManageNotes) {
      toast.error("You do not have permission to edit notes.");
      return;
    }
    if (!app) return;
    setDeletingNoteId(noteId);
    try {
      const nextNotes = app.notes.filter((note) => note.id !== noteId);
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/internal-notes`,
        {
          method: "PATCH",
          body: {
            internalNotes:
              nextNotes.length > 0 ? serializeInternalNotes(nextNotes) : null,
          },
          csrfToken: csrfToken ?? undefined,
        }
      );
      const updated = res?.data ?? res;
      setApp((prev) =>
        prev
          ? {
              ...prev,
              notes:
                updated &&
                typeof updated === "object" &&
                "internalNotes" in updated
                  ? parseInternalNotes(updated.internalNotes)
                  : nextNotes,
            }
          : prev
      );
      toast.success("Note deleted");
    } catch {
      /* handled */
    } finally {
      setDeletingNoteId(null);
    }
  }

  async function clearNotes() {
    if (!canManageNotes) {
      toast.error("You do not have permission to edit notes.");
      return;
    }
    if (!app || app.notes.length === 0) return;
    setIsClearingNotes(true);
    try {
      const res = await apiClient<any>(
        `/events/${eventId}/applications/${appId}/internal-notes`,
        {
          method: "PATCH",
          body: { internalNotes: null },
          csrfToken: csrfToken ?? undefined,
        }
      );
      const updated = res?.data ?? res;
      setApp((prev) =>
        prev
          ? {
              ...prev,
              notes:
                updated &&
                typeof updated === "object" &&
                "internalNotes" in updated
                  ? parseInternalNotes(updated.internalNotes)
                  : [],
            }
          : prev
      );
      toast.success("All notes cleared");
    } catch {
      /* handled */
    } finally {
      setIsClearingNotes(false);
    }
  }

  function openRequestInfo(stepId: string) {
    const fallbackStepId = stepId ?? app?.steps?.[0]?.id ?? "";
    setRequestStepId(fallbackStepId);
    setRequestFieldIds([]);
    setRequestMessage("");
    setRequestDeadline("");
    setRequestNotifyApplicant(canSendMessages);
    setRequestSendEmail(false);
    setShowRequestInfo(true);
  }

  async function sendApplicationMessage() {
    if (!app) return;
    if (!canSendMessages) {
      toast.error("You do not have permission to send messages.");
      return;
    }
    if (!composeSubject.trim() || !composeBody.trim()) {
      toast.error("Subject and message are required.");
      return;
    }
    setIsSendingMessage(true);
    try {
      const payload: Record<string, unknown> = {
        title: composeSubject.trim(),
        bodyRich: composeBody.trim(),
        bodyText: composeBody.trim(),
        sendEmail: composeSendEmail,
      };

      const actionButtons: Array<Record<string, unknown>> = [];
      if (composeAction === "APPLICATION") {
        actionButtons.push({
          kind: "OPEN_APPLICATION",
          eventId,
          label: composeActionLabel.trim() || "View application",
        });
      } else if (composeAction === "STEP") {
        if (!composeActionStepId) {
          toast.error("Select a step to link.");
          return;
        }
        actionButtons.push({
          kind: "OPEN_STEP",
          eventId,
          stepId: composeActionStepId,
          label: composeActionLabel.trim() || "Open step",
        });
      } else if (composeAction === "LINK") {
        if (!composeActionUrl.trim().startsWith("https://")) {
          toast.error("External links must start with https://");
          return;
        }
        actionButtons.push({
          kind: "EXTERNAL_LINK",
          url: composeActionUrl.trim(),
          label: composeActionLabel.trim() || "Open link",
        });
      }

      if (actionButtons.length > 0) payload.actionButtons = actionButtons;
      if (app.applicantUserId) {
        payload.explicitUserIds = [app.applicantUserId];
      } else {
        payload.recipientFilter = { applicationIds: [app.id] };
      }

      await apiClient(`/events/${eventId}/messages`, {
        method: "POST",
        body: payload,
        csrfToken: csrfToken ?? undefined,
      });

      toast.success("Message sent");
      setShowComposeMessage(false);
      setComposeSubject("");
      setComposeBody("");
      setComposeSendEmail(false);
      setComposeAction("APPLICATION");
      setComposeActionLabel("View application");
      setComposeActionUrl("");
      await loadMessages();
      await loadAudit();
    } catch {
      /* handled */
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function submitRequestInfo() {
    if (!app) return;
    if (!canReviewSteps) {
      toast.error("You do not have permission to request revisions.");
      return;
    }

    const step = app.steps.find((s) => s.id === requestStepId);
    if (!step) {
      toast.error("Select a step to request revisions.");
      return;
    }
    if (!step.latestSubmissionVersionId) {
      toast.error("No submission version found for this step.");
      return;
    }

    setIsSubmittingRequest(true);
    try {
      await apiClient(
        `/events/${eventId}/applications/${appId}/steps/${step.id}/versions/${step.latestSubmissionVersionId}/reviews`,
        {
          method: "POST",
          body: {
            outcome: "REQUEST_INFO",
            messageToApplicant: requestMessage.trim() || undefined,
            targetFieldIds: requestFieldIds.length > 0 ? requestFieldIds : undefined,
            deadline: requestDeadline || undefined,
          },
          csrfToken: csrfToken ?? undefined,
        }
      );

      if (requestNotifyApplicant && canSendMessages && app.applicantUserId) {
        const fallbackMessage =
          requestMessage.trim() ||
          `Please review and update the requested fields for ${step.title}.`;
        try {
          await apiClient(`/events/${eventId}/messages`, {
            method: "POST",
            body: {
              title: `Revision requested: ${step.title}`,
              bodyRich: fallbackMessage,
              bodyText: fallbackMessage,
              actionButtons: [
                {
                  kind: "OPEN_STEP",
                  eventId,
                  stepId: step.id,
                  label: "Update step",
                },
              ],
              explicitUserIds: [app.applicantUserId],
              sendEmail: requestSendEmail,
            },
            csrfToken: csrfToken ?? undefined,
          });
        } catch {
          toast.error("Revision requested, but message failed to send.");
        }
      }

      toast.success("Revision requested");
      setShowRequestInfo(false);
      await loadApplication(true);
      await loadNeedsInfo();
      await loadAudit();
    } catch {
      /* handled */
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function deleteNeedsInfo(needsInfoId: string) {
    if (!canDeleteNeedsInfo) return;
    if (!window.confirm("Delete this needs-info request?")) {
      return;
    }
    try {
      await apiClient(`/events/${eventId}/needs-info/${needsInfoId}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Needs-info request deleted");
      await loadNeedsInfo();
      await loadAudit();
    } catch {
      /* handled */
    }
  }

  function openFieldPatchEditor(
    step: ApplicationDetail["steps"][number],
    fieldKey: string,
    currentValue: unknown
  ) {
    if (!step.latestSubmissionVersionId) return;
    const field = step.fieldDefinitions.find((entry) => entry.key === fieldKey) ?? null;
    const fieldLabel = field?.label ?? fieldKey;
    setFieldEditTarget({
      stepId: step.id,
      stepTitle: step.title,
      versionId: step.latestSubmissionVersionId,
      fieldKey,
      fieldLabel,
      field,
      currentValue,
    });
    setFieldEditValue(getInitialFieldEditValue(field, currentValue));
    setFieldEditReason(`Updated "${fieldLabel}" in ${step.title}`);
    setFieldEditAcknowledge(false);
  }

  function closeFieldPatchEditor() {
    if (isApplyingFieldPatch) return;
    setFieldEditTarget(null);
    setFieldEditValue("");
    setFieldEditReason("");
    setFieldEditAcknowledge(false);
  }

  async function applyFieldPatch() {
    if (!fieldEditTarget) return;
    if (!canPatchSteps) {
      toast.error("You do not have permission to modify application answers.");
      return;
    }
    if (!fieldEditAcknowledge) {
      toast.error("Acknowledge the warning before applying this edit.");
      return;
    }
    if (!fieldEditReason.trim()) {
      toast.error("Provide an internal reason for this edit.");
      return;
    }

    const { value: nextValue, error } = resolveFieldPatchValue(
      fieldEditTarget,
      fieldEditValue
    );
    if (error) {
      toast.error(error);
      return;
    }
    if (typeof nextValue === "undefined") {
      toast.error("Set a value before applying this patch.");
      return;
    }

    setIsApplyingFieldPatch(true);
    try {
      await apiClient(
        `/events/${eventId}/applications/${appId}/steps/${fieldEditTarget.stepId}/versions/${fieldEditTarget.versionId}/patches`,
        {
          method: "POST",
          body: {
            ops: [
              {
                op: "replace",
                path: `/${escapeJsonPointerSegment(fieldEditTarget.fieldKey)}`,
                value: nextValue,
              },
            ],
            reason: fieldEditReason.trim(),
            visibility: "INTERNAL_ONLY",
          },
          csrfToken: csrfToken ?? undefined,
        }
      );
      toast.success("Application field updated and logged in audit.");
      setFieldEditTarget(null);
      setFieldEditValue("");
      setFieldEditReason("");
      setFieldEditAcknowledge(false);
      await loadApplication(true);
      await loadAudit();
    } catch {
      toast.error("Could not update this field");
    } finally {
      setIsApplyingFieldPatch(false);
    }
  }

  async function deleteApplication() {
    if (!canDeleteApplication) {
      toast.error("You do not have permission to delete applications.");
      return;
    }
    setIsDeletingApplication(true);
    try {
      await apiClient(`/events/${eventId}/applications/${appId}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Application deleted");
      router.push(`${basePath}/applications`);
    } catch {
      toast.error("Could not delete application");
    } finally {
      setIsDeletingApplication(false);
      setShowDeleteConfirm(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2"><CardSkeleton /></div>
          <CardSkeleton />
        </div>
      </div>
    );
  }
  if (!app) return null;

  const requestStep =
    app.steps.find((step) => step.id === requestStepId) ?? null;
  const requestFieldOptions = requestStep
    ? extractRequestFields(requestStep.formDefinition, requestStep.answers)
    : [];
  const fieldEditKind = fieldEditTarget
    ? getFieldEditorKind(fieldEditTarget.field, fieldEditTarget.currentValue)
    : null;
  const fieldEditFileMultiple =
    fieldEditKind === "file" &&
    (typeof fieldEditTarget?.field?.maxFiles === "number"
      ? fieldEditTarget.field.maxFiles > 1
      : Array.isArray(fieldEditTarget?.currentValue));
  const fieldEditFileValue =
    fieldEditKind === "file"
      ? normalizeFileUploadSelection(fieldEditValue, fieldEditFileMultiple)
      : null;
  const fieldEditOptions = fieldEditTarget?.field?.options ?? [];

  const openNeedsInfo = needsInfoRequests.filter((req) => req.status === "OPEN");
  const stepTitleById = new Map(app.steps.map((step) => [step.id, step.title]));
  const needsInfoByStep = new Map<string, NeedsInfoRequest[]>();
  needsInfoRequests.forEach((req) => {
    const list = needsInfoByStep.get(req.stepId) ?? [];
    list.push(req);
    needsInfoByStep.set(req.stepId, list);
  });

  const auditEntityOptions = Array.from(
    new Set(auditEntries.map((entry) => entry.entityType))
  );
  const filteredAuditEntries = auditEntries.filter((entry) => {
    if (auditFilter !== "all" && entry.entityType !== auditFilter) return false;
    if (!auditSearch.trim()) return true;
    const search = auditSearch.toLowerCase();
    return (
      entry.action.toLowerCase().includes(search) ||
      entry.entityType.toLowerCase().includes(search) ||
      entry.entityId.toLowerCase().includes(search) ||
      (entry.actorName ?? "").toLowerCase().includes(search) ||
      (entry.actorEmail ?? "").toLowerCase().includes(search) ||
      (entry.details ?? "").toLowerCase().includes(search)
    );
  });

  const normalizedStatus = String(app.status ?? "").toUpperCase();
  const normalizedDecision = String(app.decision ?? "").toUpperCase();

  const canonical = (value: string) => {
    const v = String(value || "").toUpperCase();
    if (v.startsWith("DECISION_ACCEPTED")) return "ACCEPTED";
    if (v.startsWith("DECISION_WAITLISTED")) return "WAITLISTED";
    if (v.startsWith("DECISION_REJECTED")) return "REJECTED";
    if (v === "BLOCKED_REJECTED" || v === "REJECTED_FINAL") return "REJECTED";
    if (v.startsWith("WAITING_FOR_REVIEW") || v.startsWith("WAITING_FOR_APPLICANT")) return "PENDING";
    if (v.startsWith("REVISION_REQUIRED")) return "REVISION_REQUIRED";
    if (v === "ALL_REQUIRED_STEPS_APPROVED") return "APPROVED";
    return v;
  };

  const canonicalStatus = canonical(normalizedStatus);
  const canonicalDecision = canonical(normalizedDecision);

  const showDecisionBadge =
    Boolean(app.decision) &&
    canonicalDecision !== "NONE" &&
    canonicalDecision !== canonicalStatus;

  const showDraftDecisionBadge =
    Boolean(app.decision) && !app.decisionPublished && canonicalDecision !== "NONE";

  const profileFullName = app.applicantProfile?.fullName;
  const displayFullName =
    profileFullName ??
    (app.applicantName && app.applicantName !== app.applicantEmail
      ? app.applicantName
      : undefined);
  const profilePhone = app.applicantProfile?.phone ?? app.applicantPhone;
  const profileEducation = app.applicantProfile?.education;
  const profileInstitution = app.applicantProfile?.institution;
  const profileCity = app.applicantProfile?.city ?? app.applicantCity;
  const profileCountry = app.applicantProfile?.country ?? app.applicantCountry;
  const profileLocation = [profileCity, profileCountry]
    .filter(Boolean)
    .join(", ");
  const profileLinks = Array.from(
    new Set(
      (app.applicantProfile?.links ?? [])
        .filter((link): link is string => typeof link === "string")
        .map((link) => link.trim())
        .filter(Boolean)
    )
  );
  const profileItems = [
    { key: "fullName", label: "Full name", icon: User, value: displayFullName },
    { key: "email", label: "Email", icon: Mail, value: app.applicantEmail },
    { key: "phone", label: "Phone", icon: Phone, value: profilePhone },
    { key: "education", label: "Education", icon: GraduationCap, value: profileEducation },
    { key: "institution", label: "Institution", icon: Building2, value: profileInstitution },
    { key: "location", label: "Location", icon: MapPin, value: profileLocation },
    {
      key: "applied",
      label: "Applied",
      icon: Calendar,
      value: new Date(app.createdAt).toLocaleDateString("en-GB"),
    },
  ];

  const timelineSteps = app.steps.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    subtitle: s.reviewedAt
      ? `Reviewed by ${s.reviewerName} on ${new Date(s.reviewedAt).toLocaleDateString("en-GB")}`
      : s.submittedAt
      ? `Submitted ${new Date(s.submittedAt).toLocaleDateString("en-GB")}`
      : undefined,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader title={app.applicantName}>
          <StatusBadge status={app.status} />
          {showDraftDecisionBadge && (
            <Badge variant="outline" className="text-warning border-warning/30">
              Draft decision
            </Badge>
          )}
          {showDecisionBadge && <StatusBadge status={app.decision!} />}
          {canDeleteApplication && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeletingApplication}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {isDeletingApplication ? "Deleting..." : "Delete application"}
            </Button>
          )}
        </PageHeader>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="steps">Steps</TabsTrigger>
              <TabsTrigger value="decisions">Decision</TabsTrigger>
              <TabsTrigger value="messages">
                Messages
                {messages.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1">
                    {messages.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="audit">
                Audit
                {auditEntries.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1">
                    {auditEntries.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Applicant Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {profileItems.map(({ key, label, icon: Icon, value }) => {
                      const hasValue = Boolean(value && String(value).trim().length > 0);
                      return (
                        <div
                          key={key}
                          className="flex items-start gap-2 text-muted-foreground"
                        >
                          <Icon className="h-3.5 w-3.5 mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                              {label}
                            </p>
                            <p className={`text-sm ${hasValue ? "" : "text-muted-foreground/60"}`}>
                              {hasValue ? value : "â€”"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-start gap-2 text-muted-foreground sm:col-span-2">
                      <LinkIcon className="h-3.5 w-3.5 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                          Links
                        </p>
                        {profileLinks.length > 0 ? (
                          <div className="space-y-1">
                            {profileLinks.map((link, index) => {
                              const href =
                                link.startsWith("http://") ||
                                link.startsWith("https://")
                                  ? link
                                  : `https://${link}`;
                              return (
                                <a
                                  key={`${link}-${index}`}
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary hover:underline break-all"
                                >
                                  {link}
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground/60">â€”</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <StepTimeline steps={timelineSteps} />
            </TabsContent>

            {/* Steps */}
            <TabsContent value="steps" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Needs info requests
                    </CardTitle>
                    <Badge variant={openNeedsInfo.length > 0 ? "default" : "secondary"}>
                      {openNeedsInfo.length} open
                    </Badge>
                  </div>
                  <CardDescription>
                    Track revision requests and outstanding fields.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingNeedsInfo ? (
                    <p className="text-sm text-muted-foreground">Loading requests...</p>
                  ) : needsInfoRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No revision requests for this application yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {needsInfoRequests.map((req) => (
                        <div
                          key={req.id}
                          className="rounded-lg border border-muted/40 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {stepTitleById.get(req.stepId) ?? "Step"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Created {new Date(req.createdAt).toLocaleString("en-GB")}
                              </p>
                            </div>
                            <Badge variant={req.status === "OPEN" ? "default" : "secondary"}>
                              {req.status}
                            </Badge>
                          </div>
                          {req.deadlineAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Deadline {new Date(req.deadlineAt).toLocaleDateString("en-GB")}
                            </p>
                          )}
                          {req.targetFieldIds.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Fields: {req.targetFieldIds.join(", ")}
                            </p>
                          )}
                          {req.message && (
                            <p className="text-sm mt-2 whitespace-pre-wrap">{req.message}</p>
                          )}
                          {canDeleteNeedsInfo && (
                            <div className="mt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteNeedsInfo(req.id)}
                              >
                                Delete request
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {app.steps.map((step) => {
                const stepNeedsInfo = needsInfoByStep.get(step.id) ?? [];
                const requiredFieldKeys = getRequiredFieldKeySet(step.formDefinition);
                const fieldDefinitionByKey = new Map(
                  step.fieldDefinitions.map((field) => [field.key, field])
                );
                return (
                  <Card key={step.id}>
                    <CardHeader>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <CardTitle className="text-base">{step.title}</CardTitle>
                          {stepNeedsInfo.some((r) => r.status === "OPEN") && (
                            <Badge variant="outline" className="text-warning border-warning/40">
                              Needs info
                            </Badge>
                          )}
                        </div>
                        <StatusBadge status={step.status} className="self-start shrink-0" />
                      </div>
                      {step.submittedAt && (
                        <p className="text-xs text-muted-foreground">
                          Last activity {new Date(step.submittedAt).toLocaleString("en-GB")}
                        </p>
                      )}
                    </CardHeader>
                    {step.answers && getVisibleAnswerEntries(step.answers).length > 0 && (
                      <CardContent>
                        <div className="space-y-3">
                          {getVisibleAnswerEntries(step.answers).map(([key, val]) => {
                            const fieldDefinition = fieldDefinitionByKey.get(key);
                            const fieldLabel = fieldDefinition?.label ?? key;
                            const isRequired = requiredFieldKeys.has(key);
                            return (
                              <div key={key} className="text-sm">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider flex items-center gap-2">
                                    <span>{fieldLabel}</span>
                                    {fieldLabel !== key && (
                                      <span className="text-[10px] normal-case tracking-normal text-muted-foreground/70">
                                        ({key})
                                      </span>
                                    )}
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
                                  {canPatchSteps && step.latestSubmissionVersionId && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[11px]"
                                      onClick={() =>
                                        openFieldPatchEditor(step, key, val)
                                      }
                                    >
                                      <PencilLine className="mr-1 h-3 w-3" />
                                      Edit field
                                    </Button>
                                  )}
                                </div>
                                <div>
                                  {renderAnswerValue(val, {
                                    eventId,
                                    verification: canReviewSteps && step.latestSubmissionVersionId
                                      ? {
                                          applicationId: appId,
                                          stepId: step.id,
                                          submissionVersionId: step.latestSubmissionVersionId,
                                          fieldKey: key,
                                        }
                                      : undefined,
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    )}
                    <CardFooter className="border-t flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                      <span className="text-xs text-muted-foreground">
                        {step.latestSubmissionVersionId
                          ? "Ready for review actions"
                          : "No submission yet"}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRequestInfo(step.id)}
                        disabled={!canReviewSteps || !step.latestSubmissionVersionId}
                      >
                        <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                        Request info
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </TabsContent>

            {/* Decision */}
            <TabsContent value="decisions" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Decision</CardTitle>
                  <CardDescription>
                    Draft a decision, then publish to notify the applicant.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select
                    value={draftDecision}
                    onValueChange={(value) => {
                      setDraftDecision(value);
                    }}
                    disabled={!canManageDecisions}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select decision..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACCEPTED">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          Accept
                        </span>
                      </SelectItem>
                      <SelectItem value="WAITLISTED">
                        <span className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-warning" />
                          Waitlist
                        </span>
                      </SelectItem>
                      <SelectItem value="REJECTED">
                        <span className="flex items-center gap-2">
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                          Reject
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="space-y-2">
                    <Label>Decision template</Label>
                    <Select
                      value={selectedDecisionTemplateId}
                      onValueChange={setSelectedDecisionTemplateId}
                      disabled={!canManageDecisions || !draftDecision}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select template (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {decisionTemplatesForDraftStatus.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {draftDecision && decisionTemplatesForDraftStatus.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No active templates for this decision status.
                      </p>
                    )}
                  </div>

                  {app.decisionDraft?.rendered && (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
                      <p className="text-xs font-medium">
                        Current rendered template draft
                      </p>
                      {app.decisionDraft.templateName && (
                        <p className="text-xs text-muted-foreground">
                          Template: {app.decisionDraft.templateName}
                        </p>
                      )}
                      {app.decisionDraft.rendered.subject && (
                        <p className="text-sm font-medium">
                          {app.decisionDraft.rendered.subject}
                        </p>
                      )}
                      {app.decisionDraft.rendered.body && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {app.decisionDraft.rendered.body}
                        </p>
                      )}
                    </div>
                  )}

                  {!canManageDecisions && (
                    <p className="text-xs text-muted-foreground">
                      You do not have permission to update decisions for this event.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={saveDecision}
                      disabled={!canManageDecisions}
                    >
                      Save draft
                    </Button>
                    {app.decisionPublished && (
                      <Button
                        variant="outline"
                        onClick={unpublishDecision}
                        disabled={!canManageDecisions || isUnpublishing}
                      >
                        {isUnpublishing ? "Unpublishing..." : "Unpublish"}
                      </Button>
                    )}
                    <Button
                      onClick={() => setShowPublishConfirm(true)}
                      disabled={
                        !canPublishDecision ||
                        !draftDecision ||
                        app.decisionPublished ||
                        isPublishing
                      }
                    >
                      {isPublishing ? "Publishing..." : app.decisionPublished ? "Published" : "Publish decision"}
                    </Button>
                  </div>

                  {app.decisionPublished && (
                    <Badge variant="outline" className="text-success border-success/30">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Decision published to applicant
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Messages */}
            <TabsContent value="messages" className="space-y-4 mt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Applicant messages</h3>
                  <p className="text-xs text-muted-foreground">
                    Send direct messages and track what the applicant received.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMessages}
                    disabled={isLoadingMessages || !canReadMessages}
                  >
                    <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowComposeMessage(true)}
                    disabled={!canSendMessages}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                    New message
                  </Button>
                </div>
              </div>

              {!canReadMessages ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    You do not have permission to read messages for this event.
                  </CardContent>
                </Card>
              ) : isLoadingMessages ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    Loading messages...
                  </CardContent>
                </Card>
              ) : messages.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    No messages sent to this applicant yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <Card key={msg.id}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{msg.title}</p>
                            <p className="text-xs text-muted-foreground">
                              From {msg.senderName ?? "Staff"}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(msg.createdAt).toLocaleString("en-GB")}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="secondary">{msg.type}</Badge>
                          <Badge variant={msg.readAt ? "default" : "outline"}>
                            {msg.readAt ? "Read" : "Unread"}
                          </Badge>
                        </div>
                        {getMessageBody(msg) && (
                          <p className="text-sm whitespace-pre-wrap">
                            {getMessageBody(msg)}
                          </p>
                        )}
                        {msg.actionButtons && msg.actionButtons.length > 0 && (
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {msg.actionButtons.map((btn, index) => (
                              <Badge key={index} variant="outline">
                                {(btn as any).label ?? (btn as any).kind ?? "Action"}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Audit log */}
            <TabsContent value="audit" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Audit log</CardTitle>
                      <CardDescription>
                        Track activity across decisions, steps, and reviews.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={auditFilter} onValueChange={setAuditFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Filter entity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All entities</SelectItem>
                          {auditEntityOptions.map((entity) => (
                            <SelectItem key={entity} value={entity}>
                              {formatAuditEntity(entity)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        placeholder="Search audit log..."
                        className="w-[220px]"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadAudit}
                        disabled={isLoadingAudit || !canViewAudit}
                      >
                        <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!canViewAudit ? (
                    <p className="text-sm text-muted-foreground">
                      You do not have permission to view the audit log.
                    </p>
                  ) : isLoadingAudit ? (
                    <p className="text-sm text-muted-foreground">Loading audit log...</p>
                  ) : filteredAuditEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No audit entries found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAuditEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleString("en-GB")}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium">
                                {entry.actorName ?? "System"}
                              </div>
                              <div className="text-muted-foreground">
                                {entry.actorEmail ?? "system"}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatAuditAction(entry.action)}
                              {entry.redactionApplied && (
                                <Badge variant="outline" className="ml-2">
                                  Redacted
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatAuditEntity(entry.entityType)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {entry.details ?? "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {app.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="group">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      disabled={!canManageTags || isUpdatingTags}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {!canManageTags && (
                <p className="text-xs text-muted-foreground">
                  You do not have permission to edit tags.
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add tag..."
                  className="h-8 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  disabled={!canManageTags || isUpdatingTags}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addTag}
                  className="h-8"
                  disabled={!canManageTags || isUpdatingTags}
                >
                  {isUpdatingTags ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Internal Notes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <StickyNote className="h-3.5 w-3.5" />
                  Internal Notes
                </CardTitle>
                {app.notes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearNotes}
                    disabled={!canManageNotes || isClearingNotes}
                    className="h-7 px-2 text-xs"
                  >
                    {isClearingNotes ? "Clearing..." : "Clear all"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!canManageNotes && (
                <p className="text-xs text-muted-foreground">
                  You do not have permission to edit internal notes.
                </p>
              )}
              <div className="space-y-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={3}
                  className="text-xs"
                  disabled={!canManageNotes}
                />
                <Button
                  size="sm"
                  onClick={addNote}
                  disabled={!canManageNotes || isAddingNote || !newNote.trim()}
                  className="w-full"
                >
                  {isAddingNote ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-3 w-3" />
                  )}
                  Add note
                </Button>
              </div>
              <Separator />
              <ScrollArea className="max-h-64">
                <div className="space-y-3">
                  {app.notes.map((note) => (
                    <div key={note.id} className="text-xs">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="font-medium">{note.authorName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {new Date(note.createdAt).toLocaleDateString("en-GB")}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteNote(note.id)}
                            disabled={!canManageNotes || deletingNoteId === note.id}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Delete note"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-muted-foreground">{note.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showComposeMessage} onOpenChange={setShowComposeMessage}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send message</DialogTitle>
            <DialogDescription>
              Send a direct message to the applicant with an optional action button.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Subject</Label>
              <Input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Message</Label>
              <Textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Write your message..."
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Action button</Label>
              <Select
                value={composeAction}
                onValueChange={(value) =>
                  setComposeAction(value as "NONE" | "APPLICATION" | "STEP" | "LINK")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No action</SelectItem>
                  <SelectItem value="APPLICATION">Open application</SelectItem>
                  <SelectItem value="STEP">Open specific step</SelectItem>
                  <SelectItem value="LINK">External link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {composeAction !== "NONE" && (
              <div className="space-y-2">
                <Label className="text-sm">Action label</Label>
                <Input
                  value={composeActionLabel}
                  onChange={(e) => setComposeActionLabel(e.target.value)}
                  placeholder="Button label..."
                />
              </div>
            )}
            {composeAction === "STEP" && (
              <div className="space-y-2">
                <Label className="text-sm">Step</Label>
                <Select
                  value={composeActionStepId}
                  onValueChange={setComposeActionStepId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select step" />
                  </SelectTrigger>
                  <SelectContent>
                    {app.steps.map((step) => (
                      <SelectItem key={step.id} value={step.id}>
                        {step.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {composeAction === "LINK" && (
              <div className="space-y-2">
                <Label className="text-sm">External URL (https://)</Label>
                <Input
                  value={composeActionUrl}
                  onChange={(e) => setComposeActionUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Send email</Label>
                <p className="text-xs text-muted-foreground">
                  Also deliver this message by email.
                </p>
              </div>
              <Switch
                checked={composeSendEmail}
                onCheckedChange={(checked) => setComposeSendEmail(Boolean(checked))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComposeMessage(false)}>
              Cancel
            </Button>
            <Button onClick={sendApplicationMessage} disabled={isSendingMessage}>
              {isSendingMessage ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRequestInfo} onOpenChange={setShowRequestInfo}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Request more information</DialogTitle>
            <DialogDescription>
              Select the fields that need revision and add a message for the applicant.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Step</Label>
              <Select value={requestStepId} onValueChange={setRequestStepId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select step" />
                </SelectTrigger>
                <SelectContent>
                  {app.steps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      {step.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm">Fields to update</Label>
                {requestFieldOptions.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRequestFieldIds(requestFieldOptions.map((f) => f.id))
                      }
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRequestFieldIds([])}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto overflow-x-hidden rounded-lg border border-muted/40 p-3">
                {requestFieldOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No field metadata available. You can still request a general revision.
                  </p>
                ) : (
                  requestFieldOptions.map((field) => (
                    <label
                      key={field.id}
                      className="flex min-w-0 items-start gap-2 text-sm"
                    >
                      <Checkbox
                        className="shrink-0"
                        checked={requestFieldIds.includes(field.id)}
                        onCheckedChange={(checked) => {
                          const isChecked = Boolean(checked);
                          setRequestFieldIds((prev) =>
                            isChecked
                              ? [...prev, field.id]
                              : prev.filter((id) => id !== field.id)
                          );
                        }}
                      />
                      <span className="min-w-0 break-words">
                        {field.label}
                        {field.section && (
                          <span className="block break-words text-xs text-muted-foreground">
                            {field.section}
                          </span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to request a full step revision.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Message to applicant</Label>
              <Textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="Explain what needs to be updated..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Deadline (optional)</Label>
              <Input
                type="date"
                value={requestDeadline}
                onChange={(e) => setRequestDeadline(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-sm">Notify applicant</Label>
                <p className="text-xs text-muted-foreground break-words">
                  Send an inbox message with a direct link to the step.
                </p>
              </div>
              <Switch
                className="shrink-0"
                checked={requestNotifyApplicant}
                onCheckedChange={(checked) => setRequestNotifyApplicant(Boolean(checked))}
                disabled={!canSendMessages}
              />
            </div>

            {requestNotifyApplicant && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm">Also send email</Label>
                  <p className="text-xs text-muted-foreground break-words">
                    Deliver the revision request via email.
                  </p>
                </div>
                <Switch
                  className="shrink-0"
                  checked={requestSendEmail}
                  onCheckedChange={(checked) => setRequestSendEmail(Boolean(checked))}
                  disabled={!canSendMessages}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestInfo(false)}>
              Cancel
            </Button>
            <Button onClick={submitRequestInfo} disabled={isSubmittingRequest}>
              {isSubmittingRequest && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Request info
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(fieldEditTarget)}
        onOpenChange={(open) => {
          if (!open) closeFieldPatchEditor();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit application field</DialogTitle>
            <DialogDescription>
              Make a staff-side correction to this answer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Step:</span>{" "}
                {fieldEditTarget?.stepTitle ?? "-"}
              </p>
              <p>
                <span className="font-medium text-foreground">Field:</span>{" "}
                {fieldEditTarget?.fieldLabel ?? fieldEditTarget?.fieldKey ?? "-"}
                {fieldEditTarget?.fieldLabel &&
                  fieldEditTarget.fieldLabel !== fieldEditTarget.fieldKey && (
                    <span className="ml-1 text-muted-foreground/70">
                      ({fieldEditTarget.fieldKey})
                    </span>
                  )}
              </p>
            </div>
            <Alert className="border-warning/40 bg-warning/5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This directly changes what staff sees for the applicant response.
                The action is internal and logged in the audit trail.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label className="text-sm">Current value</Label>
              <div className="rounded-md border border-muted/40 bg-muted/20 p-2 text-sm">
                {fieldEditTarget
                  ? renderAnswerValue(fieldEditTarget.currentValue, { eventId })
                  : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">New value</Label>
              {(fieldEditKind === "text" || fieldEditKind === "email" || fieldEditKind === "date") && (
                <Input
                  type={fieldEditKind === "email" ? "email" : fieldEditKind === "date" ? "date" : "text"}
                  value={typeof fieldEditValue === "string" ? fieldEditValue : ""}
                  onChange={(event) => setFieldEditValue(event.target.value)}
                  placeholder={fieldEditTarget?.field?.placeholder ?? ""}
                />
              )}
              {fieldEditKind === "textarea" && (
                <Textarea
                  value={typeof fieldEditValue === "string" ? fieldEditValue : ""}
                  onChange={(event) => setFieldEditValue(event.target.value)}
                  rows={6}
                />
              )}
              {fieldEditKind === "number" && (
                <Input
                  type="number"
                  value={typeof fieldEditValue === "string" ? fieldEditValue : ""}
                  onChange={(event) => setFieldEditValue(event.target.value)}
                />
              )}
              {fieldEditKind === "checkbox" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={fieldEditValue === true}
                    onCheckedChange={(checked) => setFieldEditValue(Boolean(checked))}
                  />
                  <span>Checked</span>
                </label>
              )}
              {fieldEditKind === "select" &&
                (fieldEditOptions.length > 0 ? (
                  <Select
                    value={typeof fieldEditValue === "string" ? fieldEditValue : ""}
                    onValueChange={(value) => setFieldEditValue(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldEditOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={typeof fieldEditValue === "string" ? fieldEditValue : ""}
                    onChange={(event) => setFieldEditValue(event.target.value)}
                  />
                ))}
              {fieldEditKind === "multiselect" &&
                (fieldEditOptions.length > 0 ? (
                  <div className="space-y-2 rounded-md border border-muted/40 p-3">
                    {fieldEditOptions.map((option) => {
                      const selected = Array.isArray(fieldEditValue)
                        ? fieldEditValue.includes(option.value)
                        : false;
                      return (
                        <label key={option.value} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => {
                              const current = Array.isArray(fieldEditValue)
                                ? fieldEditValue.filter(
                                    (value): value is string => typeof value === "string"
                                  )
                                : [];
                              const next = checked
                                ? Array.from(new Set([...current, option.value]))
                                : current.filter((value) => value !== option.value);
                              setFieldEditValue(next);
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <Textarea
                    value={
                      Array.isArray(fieldEditValue)
                        ? fieldEditValue
                            .filter((value): value is string => typeof value === "string")
                            .join("\n")
                        : ""
                    }
                    onChange={(event) =>
                      setFieldEditValue(
                        event.target.value
                          .split("\n")
                          .map((value) => value.trim())
                          .filter((value) => value.length > 0)
                      )
                    }
                    rows={4}
                    placeholder="One value per line"
                  />
                ))}
              {fieldEditKind === "file" && (
                <div className="space-y-2">
                  <FileUpload
                    value={fieldEditFileValue}
                    onChange={(next) => setFieldEditValue(next)}
                    eventId={eventId}
                    applicationId={appId}
                    stepId={fieldEditTarget?.stepId}
                    fieldId={fieldEditTarget?.fieldKey}
                    accept={fieldEditTarget?.field?.allowedMimeTypes?.join(",")}
                    multiple={fieldEditFileMultiple}
                    maxFiles={
                      typeof fieldEditTarget?.field?.maxFiles === "number"
                        ? fieldEditTarget.field.maxFiles
                        : undefined
                    }
                    maxFileSizeMB={
                      typeof fieldEditTarget?.field?.maxFileSizeMB === "number"
                        ? fieldEditTarget.field.maxFileSizeMB
                        : undefined
                    }
                  />
                  {fieldEditTarget?.field?.description && (
                    <FormMarkdown
                      content={fieldEditTarget.field.description}
                      className="text-xs text-muted-foreground [&_p]:my-0"
                    />
                  )}
                </div>
              )}
              {fieldEditKind === "json" && (
                <>
                  <Textarea
                    value={typeof fieldEditValue === "string" ? fieldEditValue : ""}
                    onChange={(event) => setFieldEditValue(event.target.value)}
                    rows={8}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter valid JSON (for example numbers, booleans, arrays, or objects).
                  </p>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Reason (internal)</Label>
              <Input
                value={fieldEditReason}
                onChange={(event) => setFieldEditReason(event.target.value)}
                placeholder="Describe why this field is being edited..."
              />
              <p className="text-xs text-muted-foreground">
                This reason is recorded for audit visibility.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={fieldEditAcknowledge}
                onCheckedChange={(checked) => setFieldEditAcknowledge(Boolean(checked))}
              />
              <span>
                I understand this edit is sensitive and will be audited.
              </span>
            </label>
            {fieldEditTarget?.field?.required && (
              <p className="text-xs text-muted-foreground">
                This is a required field in the form definition.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeFieldPatchEditor}
              disabled={isApplyingFieldPatch}
            >
              Cancel
            </Button>
            <Button
              onClick={applyFieldPatch}
              disabled={
                isApplyingFieldPatch ||
                !fieldEditAcknowledge ||
                fieldEditReason.trim().length === 0
              }
            >
              {isApplyingFieldPatch && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Apply patch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete this application?"
        description="This will permanently remove the application and all related submissions, reviews, and notes."
        confirmLabel={isDeletingApplication ? "Deleting..." : "Delete application"}
        onConfirm={deleteApplication}
        variant="destructive"
      />

      <ConfirmDialog
        open={showPublishConfirm}
        onOpenChange={setShowPublishConfirm}
        title="Publish decision..."
        description="The applicant will be notified of this decision immediately. This action cannot be undone."
        confirmLabel="Publish"
        onConfirm={publishDecision}
        variant="destructive"
      />
    </motion.div>
  );
}

