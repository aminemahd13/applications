import {
  FieldType,
  isFieldRequired,
  isFieldVisible,
  normalizeFormDefinition,
  type FieldDefinition,
} from "@event-platform/schemas";

/**
 * Pure helpers that turn a submitted answers object + the form definition it
 * was submitted against into an ordered, labelled list of entries for display.
 *
 * `entry.key` is always the LITERAL key in the (normalized) answers object.
 * Callers that verify files must pass it as `verification.fieldKey` — never the
 * label or the canonical form key — because the server resolves
 * `effectiveAnswers[fieldKey]`.
 */

export const OTHER_RESPONSES_SECTION = "Other responses";
export const GENERAL_SECTION = "General";

export interface FileAnswerRef {
  fileObjectId: string;
  originalFilename?: string;
  sizeBytes?: number;
}

export interface AnswerEntry {
  /** LITERAL key in the normalized answers — React key + verification.fieldKey. */
  key: string;
  /** Form label; the raw key when the answer is not in the form. */
  label: string;
  /** Form section title, "General" for root fields, OTHER_RESPONSES_SECTION otherwise. */
  sectionTitle: string;
  isInForm: boolean;
  /** Raw value, untouched. */
  value: unknown;
  /** Option labels / "Yes"/"No" / formatted date; null → render `value` as-is. */
  displayValue: string | string[] | null;
  /** Static `required` or a `requireWhen` that evaluates true. */
  isRequired: boolean;
  isFile: boolean;
  fileRefs: FileAnswerRef[];
  /** Value present but `showWhen` evaluates false — keep the entry, render muted. */
  hiddenByLogic: boolean;
}

interface IndexedField {
  field: FieldDefinition;
  /** Canonical answer key: `(field.key || field.id).trim()`. */
  fieldKey: string;
  label: string;
  sectionTitle: string;
  /** Later fields sharing `fieldKey` (first wins for label/section). */
  duplicates: FieldDefinition[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function nonEmptyTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Accepts a form schema object, a JSON string, or a `{ schema: {...} }`
 * wrapper (form version rows). Returns null for anything unusable.
 */
export function parseFormDefinition(
  definition: unknown,
): Record<string, unknown> | null {
  if (!definition) return null;
  if (typeof definition === "string") {
    try {
      const parsed = JSON.parse(definition);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!isRecord(definition)) return null;
  if (isRecord(definition.schema)) {
    return definition.schema;
  }
  return definition;
}

/**
 * Same semantics as the API's `normalizeAnswersShape`: unwraps a legacy
 * `{ data: {...} }` wrapper (nested keys override top-level ones) and drops
 * `data` only when other keys exist. Never mutates the input.
 */
export function normalizeAnswersShape(answers: unknown): Record<string, unknown> {
  if (!isRecord(answers)) return {};
  const normalized: UnknownRecord = { ...answers };
  const nestedData = normalized.data;
  if (isRecord(nestedData)) {
    Object.assign(normalized, nestedData);
  }
  if (
    "data" in normalized &&
    Object.keys(normalized).some((key) => key !== "data")
  ) {
    delete normalized.data;
  }
  return normalized;
}

function toFileAnswerRef(value: UnknownRecord): FileAnswerRef | null {
  if (
    typeof value.fileObjectId !== "string" ||
    value.fileObjectId.trim().length === 0
  ) {
    return null;
  }
  return {
    fileObjectId: value.fileObjectId,
    originalFilename:
      typeof value.originalFilename === "string"
        ? value.originalFilename
        : undefined,
    sizeBytes: typeof value.sizeBytes === "number" ? value.sizeBytes : undefined,
  };
}

/**
 * File references stored as `{ fileObjectId, originalFilename?, sizeBytes? }`
 * objects, or (nested) arrays of them. Bare strings are NOT treated as files.
 */
export function extractFileAnswerRefs(value: unknown): FileAnswerRef[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractFileAnswerRefs(item));
  }
  if (isRecord(value)) {
    const ref = toFileAnswerRef(value);
    return ref ? [ref] : [];
  }
  return [];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * "2004-05-12" → "12 May 2004". Parsed manually so the result never shifts
 * with the viewer's timezone. Anything that isn't a real calendar date → null.
 */
export function formatDateOnly(value: string): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Raw sections in the order `normalizeFormDefinition` reads them, with root
 * `fields` appended as a "General" section (legacy flat schemas).
 */
function collectRawSections(schema: UnknownRecord): unknown[] {
  const sections = Array.isArray(schema.sections)
    ? schema.sections
    : Array.isArray(schema.pages)
      ? schema.pages
      : [];
  const rootFields = Array.isArray(schema.fields) ? schema.fields : [];
  if (rootFields.length === 0) return sections;
  return [
    ...sections,
    { id: "general", title: GENERAL_SECTION, fields: rootFields },
  ];
}

function buildFieldIndex(formDefinition: unknown): IndexedField[] {
  const schema = parseFormDefinition(formDefinition);
  if (!schema) return [];

  const rawSections = collectRawSections(schema);
  let normalizedSections: ReturnType<typeof normalizeFormDefinition>["sections"];
  try {
    normalizedSections = normalizeFormDefinition({ sections: rawSections })
      .sections;
  } catch {
    return [];
  }

  const index: IndexedField[] = [];
  const byFieldKey = new Map<string, IndexedField>();

  normalizedSections.forEach((section, sectionIndex) => {
    // normalizeFormDefinition maps sections and fields 1:1 by position, so the
    // raw objects can be read alongside (normalized labels default to "Field N").
    const rawSection = rawSections[sectionIndex];
    const rawFields =
      isRecord(rawSection) && Array.isArray(rawSection.fields)
        ? rawSection.fields
        : [];
    const sectionTitle =
      nonEmptyTrimmed(section.title) ?? `Section ${sectionIndex + 1}`;

    section.fields.forEach((field, fieldIndex) => {
      if (field.type === FieldType.INFO_TEXT) return;
      const fieldKey = (field.key || field.id).trim();
      if (!fieldKey) return;
      const existing = byFieldKey.get(fieldKey);
      if (existing) {
        existing.duplicates.push(field);
        return;
      }

      const rawField = rawFields[fieldIndex];
      const label =
        (isRecord(rawField) ? nonEmptyTrimmed(rawField.label) : null) ??
        fieldKey;

      const indexed: IndexedField = {
        field,
        fieldKey,
        label,
        sectionTitle,
        duplicates: [],
      };
      byFieldKey.set(fieldKey, indexed);
      index.push(indexed);
    });
  });

  return index;
}

function uniqueNonEmpty(candidates: string[]): string[] {
  return candidates.filter(
    (candidate, position) =>
      candidate.length > 0 && candidates.indexOf(candidate) === position,
  );
}

/** Keys the field's answer is canonically stored under. */
function canonicalKeyCandidates(indexed: IndexedField): string[] {
  return uniqueNonEmpty([indexed.fieldKey, indexed.field.key]);
}

/** Legacy alias: answers stored under the field id instead of its key. */
function aliasKeyCandidates(indexed: IndexedField): string[] {
  return uniqueNonEmpty([indexed.field.id.trim(), indexed.field.id]);
}

/** Keys an answer may be stored under, most canonical first. */
function answerKeyCandidates(indexed: IndexedField): string[] {
  return uniqueNonEmpty([
    ...canonicalKeyCandidates(indexed),
    ...aliasKeyCandidates(indexed),
  ]);
}

function findIndexedField(
  index: IndexedField[],
  key: string,
): IndexedField | null {
  return (
    index.find((indexed) => indexed.fieldKey === key) ??
    index.find((indexed) => answerKeyCandidates(indexed).includes(key)) ??
    null
  );
}

function mapOptionValue(
  options: Array<{ label: string; value: string }>,
  raw: string,
): string | null {
  const exact = options.find((option) => option.value === raw);
  if (exact) return exact.label;
  const trimmed = raw.trim();
  const loose = options.find((option) => option.value.trim() === trimmed);
  return loose ? loose.label : null;
}

function isEmptyValue(value: unknown): boolean {
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function computeDisplayValue(
  field: FieldDefinition | null,
  value: unknown,
  isFile: boolean,
): string | string[] | null {
  if (isFile || value === null || value === undefined || isEmptyValue(value)) {
    return null;
  }

  const options = field?.ui?.options ?? [];
  const isCheckbox = field?.type === FieldType.CHECKBOX;

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return options.length > 0 ? mapOptionValue(options, String(value)) : null;
  }

  if (typeof value === "string") {
    if (options.length > 0) {
      const label = mapOptionValue(options, value);
      if (label !== null) return label;
    }
    if (isCheckbox) {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return "Yes";
      if (normalized === "false") return "No";
    }
    if (field?.type === FieldType.DATE) {
      return formatDateOnly(value);
    }
    return null;
  }

  if (Array.isArray(value) && options.length > 0) {
    if (!value.every((item) => typeof item === "string" || typeof item === "number")) {
      return null;
    }
    return value.map((item) => {
      const raw = String(item);
      return mapOptionValue(options, raw) ?? raw;
    });
  }

  return null;
}

function buildEntry(
  key: string,
  value: unknown,
  indexed: IndexedField | null,
  answers: UnknownRecord,
): AnswerEntry {
  const field = indexed?.field ?? null;
  // Duplicate keys share one answer: any of those fields makes it required/a file.
  const keyFields = indexed ? [indexed.field, ...indexed.duplicates] : [];
  const fileRefs = extractFileAnswerRefs(value);
  const isFile =
    keyFields.some((keyField) => keyField.type === FieldType.FILE_UPLOAD) ||
    fileRefs.length > 0;

  return {
    key,
    label: indexed?.label ?? key,
    sectionTitle: indexed?.sectionTitle ?? OTHER_RESPONSES_SECTION,
    isInForm: indexed !== null,
    value,
    displayValue: computeDisplayValue(field, value, isFile),
    isRequired: keyFields.some((keyField) => isFieldRequired(keyField, answers)),
    isFile,
    fileRefs,
    hiddenByLogic: field ? !isFieldVisible(field, answers) : false,
  };
}

/**
 * Answered fields in form order (sections → fields, info_text skipped), then
 * any answer keys the form doesn't know about, in their stored order, under
 * OTHER_RESPONSES_SECTION. Unanswered form fields are not emitted.
 */
export function buildOrderedAnswerEntries(
  formDefinition: unknown,
  answers: unknown,
): AnswerEntry[] {
  const normalizedAnswers = normalizeAnswersShape(answers);
  const index = buildFieldIndex(formDefinition);
  const consumed = new Set<string>();
  const matchedKeys: Array<string | undefined> = new Array(index.length);
  const isAvailable = (candidate: string) =>
    !consumed.has(candidate) && hasOwn(normalizedAnswers, candidate);

  // Pass 1: canonical keys. Pass 2: id aliases, never taking a key that is
  // another field's canonical key (an id may equal a different field's key).
  const canonicalKeys = new Set(index.flatMap(canonicalKeyCandidates));
  index.forEach((indexed, position) => {
    const matched = canonicalKeyCandidates(indexed).find(isAvailable);
    if (matched === undefined) return;
    consumed.add(matched);
    matchedKeys[position] = matched;
  });
  index.forEach((indexed, position) => {
    if (matchedKeys[position] !== undefined) return;
    const matched = aliasKeyCandidates(indexed).find(
      (candidate) => !canonicalKeys.has(candidate) && isAvailable(candidate),
    );
    if (matched === undefined) return;
    consumed.add(matched);
    matchedKeys[position] = matched;
  });

  const entries: AnswerEntry[] = [];
  index.forEach((indexed, position) => {
    const matchedKey = matchedKeys[position];
    if (matchedKey === undefined) return;
    entries.push(
      buildEntry(
        matchedKey,
        normalizedAnswers[matchedKey],
        indexed,
        normalizedAnswers,
      ),
    );
  });

  for (const key of Object.keys(normalizedAnswers)) {
    if (consumed.has(key)) continue;
    entries.push(buildEntry(key, normalizedAnswers[key], null, normalizedAnswers));
  }

  return entries;
}

/**
 * Groups consecutive entries that share a section title, preserving order.
 * (`buildOrderedAnswerEntries` already emits entries section by section.)
 */
export function groupAnswerEntriesBySection(
  entries: AnswerEntry[],
): Array<{ title: string; entries: AnswerEntry[] }> {
  const groups: Array<{ title: string; entries: AnswerEntry[] }> = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.title === entry.sectionTitle) {
      last.entries.push(entry);
    } else {
      groups.push({ title: entry.sectionTitle, entries: [entry] });
    }
  }
  return groups;
}

function stringifyCompact(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Plain-text summary of one answer value (tooltips such as
 * "Edited by staff — originally: …"). Uses the same label mapping as the
 * entries; files → file names; empty → "(empty)"; undefined → "(not answered)".
 */
export function describeAnswerValue(
  formDefinition: unknown,
  key: string,
  value: unknown,
): string {
  if (value === undefined) return "(not answered)";
  if (value === null) return "(empty)";
  if (typeof value === "string" && value.trim().length === 0) return "(empty)";
  if (Array.isArray(value) && value.length === 0) return "(empty)";
  if (isRecord(value) && Object.keys(value).length === 0) return "(empty)";

  const indexed = findIndexedField(buildFieldIndex(formDefinition), key);
  const entry = buildEntry(key, value, indexed, {});

  if (entry.fileRefs.length > 0) {
    return entry.fileRefs
      .map((ref) => ref.originalFilename || `file-${ref.fileObjectId}`)
      .join(", ");
  }
  if (typeof entry.displayValue === "string") return entry.displayValue;
  if (Array.isArray(entry.displayValue)) return entry.displayValue.join(", ");

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    )
  ) {
    return value.map((item) => String(item)).join(", ");
  }
  return stringifyCompact(value);
}
