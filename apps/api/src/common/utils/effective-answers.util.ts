import { FieldType, getFormFields } from '@event-platform/schemas';

/**
 * Pure helpers for "effective" submission answers: the submitted snapshot with
 * active staff patches (`admin_change_patches.ops`) applied, plus file-reference
 * extraction. Ported from FilesService (the implementation that honours
 * `replace`, `add` and `remove` ops).
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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(target: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Backward-compat: unwrap legacy answer envelopes shaped as `{ data: {...} }`.
 * Always returns a new object (never the input reference).
 */
export function normalizeAnswersShape(answers: unknown): UnknownRecord {
  if (!isRecord(answers)) return {};

  const normalized: UnknownRecord = { ...answers };
  const nestedData = normalized.data;
  if (isRecord(nestedData)) {
    Object.assign(normalized, nestedData);
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
 * - other ops (`test`, `move`, `copy`) and malformed entries are ignored.
 * `base` is never mutated. `editedKeys` lists every distinct key touched by an
 * applied op, in first-touch order.
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
      if (!key) continue;

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
    const primaryKey = field.key || field.id;
    if (!primaryKey) continue;
    const answerKey =
      !hasOwn(source, primaryKey) && field.id && hasOwn(source, field.id)
        ? field.id
        : primaryKey;
    if (coveredKeys.has(answerKey)) continue;
    coveredKeys.add(answerKey);
    for (const fileObjectId of extractFileObjectIds(source[answerKey])) {
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
