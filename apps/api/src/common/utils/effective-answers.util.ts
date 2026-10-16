import {
  FieldType,
  getFormFields,
  isFieldVisible,
} from '@event-platform/schemas';
import type { ReviewContextEditedField } from '@event-platform/shared';

/**
 * Pure helpers for "effective" submission answers: the submitted snapshot with
 * active staff patches (`admin_change_patches.ops`) applied, plus file-reference
 * extraction. Every surface that reads submitted answers (review queue, review
 * panel, approve gate, file verification, exports, list filters, messaging
 * audiences, step deadlines, metrics, admin CSV) must go through
 * `resolveEffectiveAnswers` so staff patches are honoured the same way
 * everywhere: `replace`, `add` and `remove`, with JSON-pointer `~0`/`~1`
 * decoding.
 */

type UnknownRecord = Record<string, unknown>;

export interface FileFieldRef {
  fieldKey: string;
  fileObjectId: string;
}

// Any RFC-4122-shaped id. file_objects.id is a @db.Uuid column, so anything
// else would make an `id IN (...)` lookup throw instead of simply not matching.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Assigning `__proto__` would swap the answers object's prototype (inherited
// values could then be read back as answers). It is never a real field key.
const UNSAFE_ANSWER_KEY = '__proto__';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(target: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function assignOwnEntries(target: UnknownRecord, source: UnknownRecord): void {
  for (const [key, value] of Object.entries(source)) {
    if (key === UNSAFE_ANSWER_KEY) continue;
    target[key] = value;
  }
}

/**
 * Backward-compat: unwrap legacy answer envelopes shaped as `{ data: {...} }`.
 * Nested keys override top-level ones; `data` is dropped when other keys
 * exist. Always returns a new object (never the input reference) and never
 * copies a `__proto__` key.
 */
export function normalizeAnswersShape(answers: unknown): UnknownRecord {
  if (!isRecord(answers)) return {};

  const normalized: UnknownRecord = {};
  assignOwnEntries(normalized, answers);
  const nestedData = normalized.data;
  if (isRecord(nestedData)) {
    assignOwnEntries(normalized, nestedData);
  }
  if (
    'data' in normalized &&
    Object.keys(normalized).some((key) => key !== 'data')
  ) {
    delete normalized.data;
  }
  return normalized;
}

/**
 * Decode a JSON-pointer patch path (`/field~1key`) into the literal answers
 * key (`field/key`). Returns null for non-strings and the root pointer.
 */
export function decodeJsonPointerPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const trimmed = path.replace(/^\//, '');
  if (!trimmed) return null;
  return trimmed
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('/');
}

/**
 * Apply patch op lists (one entry per `admin_change_patches.ops`, in
 * `created_at` ascending order) on top of the base answers.
 * - `replace` / `add` set the key, `remove` deletes it;
 * - other ops (`test`, `move`, `copy`), malformed entries and the
 *   `__proto__` key are ignored.
 * `base` is never mutated. `editedKeys` lists every distinct key touched by an
 * applied op, in first-touch order. The result is NOT re-normalized after
 * patching (a patch writing an object to a key named `data` stays as is).
 */
export function applyPatchOpsToAnswers(
  base: UnknownRecord,
  opsList: unknown[],
): { answers: UnknownRecord; editedKeys: string[] } {
  const answers = normalizeAnswersShape(base);
  const editedKeys: string[] = [];
  const touched = new Set<string>();

  for (const rawOps of Array.isArray(opsList) ? opsList : []) {
    if (!Array.isArray(rawOps)) continue;
    for (const rawOp of rawOps) {
      if (!isRecord(rawOp)) continue;
      const key = decodeJsonPointerPath(rawOp.path);
      if (!key || key === UNSAFE_ANSWER_KEY) continue;

      if (rawOp.op === 'remove') {
        delete answers[key];
      } else if (rawOp.op === 'replace' || rawOp.op === 'add') {
        answers[key] = rawOp.value;
      } else {
        continue;
      }

      if (!touched.has(key)) {
        touched.add(key);
        editedKeys.push(key);
      }
    }
  }

  return { answers, editedKeys };
}

/**
 * Group `admin_change_patches` rows (already ordered by `created_at` asc) into
 * `submission_version_id -> [ops, ops, ...]`, preserving row order.
 */
export function groupPatchOpsByVersionId(
  rows:
    | ReadonlyArray<{ submission_version_id: string; ops: unknown }>
    | null
    | undefined,
): Map<string, unknown[]> {
  const grouped = new Map<string, unknown[]>();
  for (const row of rows ?? []) {
    if (!row || typeof row.submission_version_id !== 'string') continue;
    const list = grouped.get(row.submission_version_id);
    if (list) {
      list.push(row.ops);
    } else {
      grouped.set(row.submission_version_id, [row.ops]);
    }
  }
  return grouped;
}

export interface ResolvedEffectiveAnswers {
  /** Normalized snapshot, without staff patches. */
  original: UnknownRecord;
  /** Normalized snapshot with active staff patches applied. */
  answers: UnknownRecord;
  /**
   * One entry per key touched by a patch, in first-touch order. Carries the
   * submitted value as `originalValue` when the key existed in the snapshot;
   * the property is absent when staff added the field.
   */
  editedFields: ReviewContextEditedField[];
}

/**
 * Effective answers for one submission version: normalize the snapshot, then
 * apply its active patch op lists (`created_at` asc).
 */
export function resolveEffectiveAnswers(
  snapshot: unknown,
  opsList: unknown[] | null | undefined,
): ResolvedEffectiveAnswers {
  const original = normalizeAnswersShape(snapshot);
  const { answers, editedKeys } = applyPatchOpsToAnswers(
    original,
    Array.isArray(opsList) ? opsList : [],
  );
  const editedFields: ReviewContextEditedField[] = editedKeys.map((key) =>
    hasOwn(original, key) ? { key, originalValue: original[key] } : { key },
  );
  return { original, answers, editedFields };
}

/** Own-property read (never an inherited value such as `constructor`). */
export function readAnswerValue(answers: unknown, key: string): unknown {
  if (!isRecord(answers) || !hasOwn(answers, key)) return undefined;
  return answers[key];
}

/**
 * Key a form field's answer is stored under: `field.key || field.id`, falling
 * back to a legacy answer stored under `field.id` when the primary key is
 * absent. Null when the field has neither.
 */
export function resolveFieldAnswerKey(
  answers: unknown,
  field: { key?: string | null; id?: string | null },
): string | null {
  const primaryKey = field.key || field.id;
  if (!primaryKey) return null;
  const source: UnknownRecord = isRecord(answers) ? answers : {};
  if (!hasOwn(source, primaryKey) && field.id && hasOwn(source, field.id)) {
    return field.id;
  }
  return primaryKey;
}

/**
 * File ids referenced by an answer value. Accepts a bare id string, an array,
 * `{ fileObjectId }` and `{ fileObjectIds: [] }`.
 */
export function extractFileObjectIds(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractFileObjectIds(entry));
  }
  if (typeof value === 'string') return [value];
  if (isRecord(value)) {
    if (typeof value.fileObjectId === 'string') return [value.fileObjectId];
    if (Array.isArray(value.fileObjectIds)) {
      return value.fileObjectIds.filter(
        (entry): entry is string => typeof entry === 'string',
      );
    }
  }
  return [];
}

/**
 * Only unambiguous file shapes: `{ fileObjectId: string }` or an array of
 * them. Bare strings are NOT treated as files (they may be any uuid answer).
 */
function extractExplicitFileObjectIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractExplicitFileObjectIds(entry));
  }
  if (isRecord(value) && typeof value.fileObjectId === 'string') {
    return [value.fileObjectId];
  }
  return [];
}

/**
 * Collect `{ fieldKey, fileObjectId }` refs from answers:
 * 1. every FILE_UPLOAD field of the form (key = `field.key || field.id`,
 *    falling back to an answer stored under `field.id`), any supported shape;
 * 2. remaining answer keys, explicit `{ fileObjectId }` shapes only.
 * Ids that are not uuid-shaped are skipped; refs are de-duplicated by
 * fileObjectId (first wins). A malformed schema only disables step 1.
 */
export function collectFileFieldRefs(
  formSchema: unknown,
  answers: UnknownRecord,
): FileFieldRef[] {
  const source: UnknownRecord = isRecord(answers) ? answers : {};
  const refs: FileFieldRef[] = [];
  const seenFileIds = new Set<string>();
  const coveredKeys = new Set<string>();

  const push = (fieldKey: string, fileObjectId: string) => {
    if (!UUID_PATTERN.test(fileObjectId)) return;
    if (seenFileIds.has(fileObjectId)) return;
    seenFileIds.add(fileObjectId);
    refs.push({ fieldKey, fileObjectId });
  };

  let fields: ReturnType<typeof getFormFields> = [];
  try {
    fields = getFormFields(formSchema);
  } catch {
    fields = [];
  }

  for (const field of fields) {
    if (field.type !== FieldType.FILE_UPLOAD) continue;
    const answerKey = resolveFieldAnswerKey(source, field);
    if (!answerKey) continue;
    if (coveredKeys.has(answerKey)) continue;
    coveredKeys.add(answerKey);
    for (const fileObjectId of extractFileObjectIds(
      readAnswerValue(source, answerKey),
    )) {
      push(answerKey, fileObjectId);
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (coveredKeys.has(key)) continue;
    for (const fileObjectId of extractExplicitFileObjectIds(value)) {
      push(key, fileObjectId);
    }
  }

  return refs;
}

export interface RequiredFileRef {
  /** Canonical field key (`field.key || field.id`) — what verifications store. */
  fieldId: string;
  fileObjectId: string;
}

export interface RemovedRequiredFileField {
  /** Canonical field key (`field.key || field.id`). */
  key: string;
  label: string;
}

export interface RequiredFileGate {
  /** Every file in a required file_upload field of the effective answers. */
  refs: RequiredFileRef[];
  /**
   * Required file_upload fields that held files when submitted but hold none
   * after staff patches (removed or replaced with an empty value), while still
   * visible under the effective answers. Approval must be refused until a
   * replacement is uploaded.
   */
  removedFields: RemovedRequiredFileField[];
}

/**
 * Approve-gate inputs for a submission: which files must be VERIFIED (read
 * from the EFFECTIVE answers, keyed by the canonical field key that
 * `FilesService.verifyField` stores) and which required file fields staff
 * emptied. "Required" is the static `validation.required` flag; a field that
 * was already empty in the submitted snapshot is never reported as removed.
 * Throws when the schema cannot be parsed (the gate must not be skipped).
 */
export function resolveRequiredFileGate(
  formSchema: unknown,
  effectiveAnswers: unknown,
  originalAnswers?: unknown,
): RequiredFileGate {
  const effective = normalizeAnswersShape(effectiveAnswers);
  const original =
    originalAnswers === undefined
      ? null
      : normalizeAnswersShape(originalAnswers);
  const refs: RequiredFileRef[] = [];
  const removedFields: RemovedRequiredFileField[] = [];
  const seenKeys = new Set<string>();

  for (const field of getFormFields(formSchema)) {
    if (field.type !== FieldType.FILE_UPLOAD || !field.validation?.required) {
      continue;
    }
    const canonicalKey = field.key || field.id;
    if (!canonicalKey || seenKeys.has(canonicalKey)) continue;
    seenKeys.add(canonicalKey);

    const effectiveKey = resolveFieldAnswerKey(effective, field);
    const fileIds = effectiveKey
      ? extractFileObjectIds(readAnswerValue(effective, effectiveKey))
      : [];
    for (const fileObjectId of fileIds) {
      refs.push({ fieldId: canonicalKey, fileObjectId });
    }

    if (fileIds.length > 0 || !original) continue;
    const originalKey = resolveFieldAnswerKey(original, field);
    const originalFileIds = originalKey
      ? extractFileObjectIds(readAnswerValue(original, originalKey))
      : [];
    if (originalFileIds.length === 0) continue;
    if (!isFieldVisible(field, effective)) continue;
    removedFields.push({
      key: canonicalKey,
      label:
        (typeof field.label === 'string' && field.label.trim()) ||
        canonicalKey,
    });
  }

  return { refs, removedFields };
}
