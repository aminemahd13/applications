import {
  appendInternalNoteLine,
  formatInternalNoteLine,
  normalizeInternalNoteContent,
  parseInternalNotes,
  sanitizeInternalNoteAuthor,
} from './internal-notes.util';

describe('internal-notes.util', () => {
  describe('parseInternalNotes', () => {
    it('returns an empty list for empty input', () => {
      expect(parseInternalNotes(null)).toEqual([]);
      expect(parseInternalNotes(undefined)).toEqual([]);
      expect(parseInternalNotes('   \n  ')).toEqual([]);
    });

    it('parses prefixed lines newest first with stable line ids', () => {
      const raw = [
        '[2026-10-01T09:00:00.000Z] Alice Smith: first note',
        '[2026-10-02T10:30:00.000Z] Bob: second note',
      ].join('\n');

      expect(parseInternalNotes(raw)).toEqual([
        {
          id: 'note-1',
          createdAt: '2026-10-02T10:30:00.000Z',
          authorName: 'Bob',
          content: 'second note',
        },
        {
          id: 'note-0',
          createdAt: '2026-10-01T09:00:00.000Z',
          authorName: 'Alice Smith',
          content: 'first note',
        },
      ]);
    });

    it('keeps brackets and colons inside the note content', () => {
      const [note] = parseInternalNotes(
        '[2026-10-01T09:00:00.000Z] Alice: see [ref] note: x',
      );
      expect(note).toEqual({
        id: 'note-0',
        createdAt: '2026-10-01T09:00:00.000Z',
        authorName: 'Alice',
        content: 'see [ref] note: x',
      });
    });

    it('keeps legacy lines verbatim without inventing a timestamp', () => {
      const raw = [
        'Strong candidate, check transcript',
        '[not-a-date] Alice: hello',
        '',
        '[2026-10-01T09:00:00.000Z] Bob: ok',
      ].join('\n');

      expect(parseInternalNotes(raw)).toEqual([
        {
          id: 'note-3',
          createdAt: '2026-10-01T09:00:00.000Z',
          authorName: 'Bob',
          content: 'ok',
        },
        {
          id: 'note-1',
          createdAt: null,
          authorName: null,
          content: '[not-a-date] Alice: hello',
        },
        {
          id: 'note-0',
          createdAt: null,
          authorName: null,
          content: 'Strong candidate, check transcript',
        },
      ]);
    });

    it('handles CRLF line endings', () => {
      const raw =
        '[2026-10-01T09:00:00.000Z] A: one\r\n[2026-10-02T09:00:00.000Z] B: two';
      expect(parseInternalNotes(raw).map((note) => note.content)).toEqual([
        'two',
        'one',
      ]);
    });
  });

  describe('sanitizeInternalNoteAuthor', () => {
    it('strips characters that would break the line format', () => {
      expect(sanitizeInternalNoteAuthor('Dr: Bob [admin]\nSmith')).toBe(
        'Dr Bob admin Smith',
      );
    });

    it('falls back to Staff when nothing usable remains', () => {
      expect(sanitizeInternalNoteAuthor(null)).toBe('Staff');
      expect(sanitizeInternalNoteAuthor(' : [] ')).toBe('Staff');
    });

    it('caps very long names', () => {
      expect(sanitizeInternalNoteAuthor('a'.repeat(500))).toHaveLength(120);
    });
  });

  describe('normalizeInternalNoteContent', () => {
    it('collapses newlines and whitespace runs', () => {
      expect(normalizeInternalNoteContent('  line one\n\n  line\ttwo  ')).toBe(
        'line one line two',
      );
    });
  });

  describe('formatInternalNoteLine', () => {
    it('produces a line that round-trips through the parser', () => {
      const line = formatInternalNoteLine({
        at: new Date('2026-10-15T08:00:00.000Z'),
        authorName: 'Amine: M',
        content: 'DOB on ID card\ndiffers from profile',
      });

      expect(line).toBe(
        '[2026-10-15T08:00:00.000Z] Amine M: DOB on ID card differs from profile',
      );
      expect(parseInternalNotes(line)).toEqual([
        {
          id: 'note-0',
          createdAt: '2026-10-15T08:00:00.000Z',
          authorName: 'Amine M',
          content: 'DOB on ID card differs from profile',
        },
      ]);
    });

    it('matches the line shape the staff application page parses', () => {
      const line = formatInternalNoteLine({
        at: new Date('2026-10-15T08:00:00.000Z'),
        authorName: 'Alice',
        content: 'hello',
      });
      // Regex used by apps/web/app/(staff)/staff/[eventId]/applications/[applicationId]/page.tsx
      expect(line).toMatch(/^\[(.+)\]\s([^:]+):\s([\s\S]+)$/);
    });
  });

  describe('appendInternalNoteLine', () => {
    it('returns the line alone when there are no notes yet', () => {
      expect(appendInternalNoteLine(null, 'x')).toBe('x');
      expect(appendInternalNoteLine('  ', 'x')).toBe('x');
    });

    it('appends after existing notes without rewriting them', () => {
      expect(appendInternalNoteLine('legacy note\n', 'x')).toBe(
        'legacy note\nx',
      );
    });
  });
});
