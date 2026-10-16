import type { ReviewContextNote } from '../dtos/reviews.dto';

/**
 * Internal staff notes are stored in `applications.internal_notes` as one note
 * per line, oldest first: `[<ISO timestamp>] <Author>: <content>`.
 *
 * This module is the single parser/writer for that format. The API (append,
 * delete, review-queue context) and the web app (staff application page) both
 * use it, so note ids and parsed fields always agree between server and
 * browser.
 */

// The timestamp never contains `]`, so anchor on the first closing bracket;
// content may contain brackets and colons freely.
const NOTE_LINE_PATTERN = /^\[([^\]]+)\]\s([^:]+):\s(.*)$/;
// Only timestamps the app itself writes (`Date#toISOString`, optionally
// without milliseconds) count. `Date.parse` accepts other shapes differently
// per engine, which would make the browser and the server disagree.
const STRICT_ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const NOTE_ID_PREFIX = 'note-';
const AUTHOR_NAME_MAX_LENGTH = 120;

function parseNoteLine(line: string, index: number): ReviewContextNote | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const id = `${NOTE_ID_PREFIX}${index}`;
  const match = trimmed.match(NOTE_LINE_PATTERN);
  const timestamp =
    match && STRICT_ISO_TIMESTAMP_PATTERN.test(match[1])
      ? Date.parse(match[1])
      : Number.NaN;
  if (match && !Number.isNaN(timestamp)) {
    return {
      id,
      createdAt: new Date(timestamp).toISOString(),
      authorName: match[2].trim(),
      content: match[3].trim(),
    };
  }

  return { id, createdAt: null, authorName: null, content: trimmed };
}

/** Parse the notes blob into entries in line order (oldest first). */
function parseInternalNotesInLineOrder(
  raw: string | null | undefined,
): ReviewContextNote[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) return [];

  const notes: ReviewContextNote[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const note = parseNoteLine(line, index);
    if (note) notes.push(note);
  });
  return notes;
}

/**
 * Parse the notes blob into entries, newest first. Ids are `note-<line index>`
 * (blank lines count). Lines without a strict `[ISO] Author:` prefix are kept
 * verbatim as legacy entries with a null author and timestamp.
 */
export function parseInternalNotes(
  raw: string | null | undefined,
): ReviewContextNote[] {
  return parseInternalNotesInLineOrder(raw).reverse();
}

/** Notes are single-line: collapse every whitespace run (incl. newlines). */
export function normalizeInternalNoteContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

/**
 * Author names must not break the line format: strip brackets, colons and
 * line breaks, collapse whitespace, and cap the length.
 */
export function sanitizeInternalNoteAuthor(
  name: string | null | undefined,
): string {
  const cleaned = (name ?? '')
    .replace(/[[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AUTHOR_NAME_MAX_LENGTH)
    .trim();
  return cleaned || 'Staff';
}

export function formatInternalNoteLine(input: {
  at: Date;
  authorName: string | null | undefined;
  content: string;
}): string {
  return `[${input.at.toISOString()}] ${sanitizeInternalNoteAuthor(
    input.authorName,
  )}: ${normalizeInternalNoteContent(input.content)}`;
}

/** Append a formatted line without rewriting any existing line. */
export function appendInternalNoteLine(
  existing: string | null | undefined,
  line: string,
): string {
  if (typeof existing !== 'string' || existing.trim().length === 0) {
    return line;
  }
  return `${existing.replace(/\s+$/, '')}\n${line}`;
}

/** Two parsed notes are the same note when every visible field matches. */
export function isSameInternalNote(
  a: Pick<ReviewContextNote, 'createdAt' | 'authorName' | 'content'>,
  b: Pick<ReviewContextNote, 'createdAt' | 'authorName' | 'content'>,
): boolean {
  return (
    a.createdAt === b.createdAt &&
    a.authorName === b.authorName &&
    a.content === b.content
  );
}

/** The reference a client sends to delete a note it has seen. */
export function toInternalNoteRef(note: ReviewContextNote): ReviewContextNote {
  return {
    id: note.id,
    createdAt: note.createdAt,
    authorName: note.authorName,
    content: note.content,
  };
}

export interface RemoveInternalNotesResult {
  /** The new blob, or null when no non-blank line is left. */
  next: string | null;
  /** Lines actually removed. */
  removed: number;
  /** Targets that no longer exist (already deleted by someone else). */
  missing: number;
}

/**
 * Remove the notes a client saw, without touching anything else.
 *
 * Ids are line indexes, so they shift when an earlier line is deleted. The id
 * is therefore only a hint: a target matches the line at its id when that
 * line's parsed note is identical, otherwise the first unclaimed line with an
 * identical note. A target with no identical line is counted as `missing`.
 * Each line is claimed at most once, so duplicates are removed one per target;
 * a target repeated verbatim (same id and fields) counts once.
 *
 * Unclaimed lines (legacy text, CRLF endings, blank lines, notes appended
 * after the client loaded the page) are kept byte for byte. When nothing is
 * removed, `next` is `raw` unchanged.
 */
export function removeInternalNotes(
  raw: string | null | undefined,
  targets: ReadonlyArray<ReviewContextNote>,
): RemoveInternalNotesResult {
  const original = typeof raw === 'string' ? raw : null;
  const entries = parseInternalNotesInLineOrder(original);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const claimed = new Set<string>();
  const seenTargets = new Set<string>();
  let missing = 0;

  for (const target of targets) {
    const targetKey = JSON.stringify([
      target.id,
      target.createdAt,
      target.authorName,
      target.content,
    ]);
    if (seenTargets.has(targetKey)) continue;
    seenTargets.add(targetKey);

    let hit = byId.get(target.id);
    if (!hit || claimed.has(hit.id) || !isSameInternalNote(hit, target)) {
      hit = entries.find(
        (entry) => !claimed.has(entry.id) && isSameInternalNote(entry, target),
      );
    }
    if (hit) {
      claimed.add(hit.id);
    } else {
      missing += 1;
    }
  }

  if (claimed.size === 0) {
    return { next: original, removed: 0, missing };
  }

  const removedIndexes = new Set(
    [...claimed].map((id) => Number(id.slice(NOTE_ID_PREFIX.length))),
  );
  const kept = (original ?? '')
    .split('\n')
    .filter((_line, index) => !removedIndexes.has(index))
    .join('\n')
    .replace(/\s+$/, '');

  return {
    next: kept.trim().length > 0 ? kept : null,
    removed: claimed.size,
    missing,
  };
}
