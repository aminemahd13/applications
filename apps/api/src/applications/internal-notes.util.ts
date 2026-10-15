import type { ReviewContextNote } from '@event-platform/shared';

/**
 * Internal staff notes are stored in `applications.internal_notes` as one note
 * per line, oldest first: `[<ISO timestamp>] <Author>: <content>`.
 * The staff application page parses the same format client-side, so keep the
 * line shape compatible with it.
 */

// The timestamp never contains `]`, so anchor on the first closing bracket;
// content may contain brackets and colons freely.
const NOTE_LINE_PATTERN = /^\[([^\]]+)\]\s([^:]+):\s(.*)$/;
const AUTHOR_NAME_MAX_LENGTH = 120;

/**
 * Parse the notes blob into entries, newest first. Lines without the
 * `[ISO] Author:` prefix are kept verbatim as legacy entries.
 */
export function parseInternalNotes(
  raw: string | null | undefined,
): ReviewContextNote[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) return [];

  const notes: ReviewContextNote[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const match = trimmed.match(NOTE_LINE_PATTERN);
    const timestamp = match ? Date.parse(match[1]) : Number.NaN;
    if (match && !Number.isNaN(timestamp)) {
      notes.push({
        id: `note-${index}`,
        createdAt: new Date(timestamp).toISOString(),
        authorName: match[2].trim(),
        content: match[3].trim(),
      });
      return;
    }

    notes.push({
      id: `note-${index}`,
      createdAt: null,
      authorName: null,
      content: trimmed,
    });
  });

  return notes.reverse();
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
