import {
  appendInternalNoteLine,
  formatInternalNoteLine,
  normalizeInternalNoteContent,
  parseInternalNotes,
  removeInternalNotes,
  sanitizeInternalNoteAuthor,
  toInternalNoteRef,
} from '@event-platform/shared';

describe('internal notes (shared util)', () => {
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

    it.each([
      ['a date without a time', '[2026-10-01] A: x'],
      ['a locale-style date', '[Oct 1 2026] A: x'],
      ['a timestamp with an offset instead of Z', '[2026-10-01T09:00:00+01:00] A: x'],
      ['an impossible date', '[2026-13-45T09:00:00.000Z] A: x'],
    ])('treats a line with %s as legacy', (_label, line) => {
      expect(parseInternalNotes(line)).toEqual([
        { id: 'note-0', createdAt: null, authorName: null, content: line },
      ]);
    });

    it('accepts strict ISO timestamps with or without milliseconds', () => {
      expect(
        parseInternalNotes(
          '[2026-10-01T09:00:00Z] A: x\n[2026-10-01T09:00:00.5Z] B: y',
        ),
      ).toEqual([
        {
          id: 'note-1',
          createdAt: '2026-10-01T09:00:00.500Z',
          authorName: 'B',
          content: 'y',
        },
        {
          id: 'note-0',
          createdAt: '2026-10-01T09:00:00.000Z',
          authorName: 'A',
          content: 'x',
        },
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

    it('round-trips content with brackets and colons', () => {
      const line = formatInternalNoteLine({
        at: new Date('2026-10-15T08:00:00.000Z'),
        authorName: '[Grace]: Hopper',
        content: 'see [ref] note: x [y]: z',
      });

      expect(parseInternalNotes(line)).toEqual([
        {
          id: 'note-0',
          createdAt: '2026-10-15T08:00:00.000Z',
          authorName: 'Grace Hopper',
          content: 'see [ref] note: x [y]: z',
        },
      ]);
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

  describe('toInternalNoteRef', () => {
    it('keeps only the fields that identify a note', () => {
      const note = {
        id: 'note-2',
        createdAt: '2026-10-01T09:00:00.000Z',
        authorName: 'Bob',
        content: 'ok',
        extra: 'dropped',
      };
      expect(toInternalNoteRef(note)).toEqual({
        id: 'note-2',
        createdAt: '2026-10-01T09:00:00.000Z',
        authorName: 'Bob',
        content: 'ok',
      });
    });
  });

  describe('removeInternalNotes', () => {
    const A = '[2026-10-01T09:00:00.000Z] Alice: one';
    const B = '[2026-10-02T09:00:00.000Z] Bob: two';
    const C = '[2026-10-03T09:00:00.000Z] Carol: three';

    function noteFor(raw: string, content: string) {
      const note = parseInternalNotes(raw).find((n) => n.content === content);
      if (!note) throw new Error(`no note with content ${content}`);
      return toInternalNoteRef(note);
    }

    it('removes the line whose id and fields match', () => {
      const raw = [A, B, C].join('\n');
      expect(removeInternalNotes(raw, [noteFor(raw, 'two')])).toEqual({
        next: [A, C].join('\n'),
        removed: 1,
        missing: 0,
      });
    });

    it('keeps legacy, CRLF and blank lines byte for byte', () => {
      const raw = `legacy text\r\n${A}\r\n\r\n${B}\r\n${C}`;
      const result = removeInternalNotes(raw, [noteFor(raw, 'two')]);
      expect(result).toEqual({
        next: `legacy text\r\n${A}\r\n\r\n${C}`,
        removed: 1,
        missing: 0,
      });
    });

    it('keeps a note appended after the client loaded the page', () => {
      const seen = [A, B].join('\n');
      const target = noteFor(seen, 'one');
      const now = [A, B, C].join('\n');

      expect(removeInternalNotes(now, [target])).toEqual({
        next: [B, C].join('\n'),
        removed: 1,
        missing: 0,
      });
    });

    it('finds the target after an earlier line was deleted (id shift)', () => {
      const seen = [A, B, C].join('\n');
      const target = noteFor(seen, 'three'); // note-2
      const afterOtherDelete = [B, C].join('\n'); // C is now note-1

      expect(target.id).toBe('note-2');
      expect(removeInternalNotes(afterOtherDelete, [target])).toEqual({
        next: B,
        removed: 1,
        missing: 0,
      });
    });

    it('does not delete the same content written by a different author', () => {
      const seen = '[2026-10-02T08:00:00.000Z] A: ok';
      const target = noteFor(seen, 'ok');
      const raw = '[2026-10-02T08:00:00.000Z] B: ok';

      expect(removeInternalNotes(raw, [target])).toEqual({
        next: raw,
        removed: 0,
        missing: 1,
      });
    });

    it('claims identical lines once each', () => {
      const raw = ['dup', 'dup', 'dup'].join('\n');
      const [first, second] = parseInternalNotes(raw);

      expect(
        removeInternalNotes(raw, [toInternalNoteRef(first), toInternalNoteRef(second)]),
      ).toEqual({ next: 'dup', removed: 2, missing: 0 });
    });

    it('removes only one line when the same target is sent twice', () => {
      const raw = ['dup', 'dup'].join('\n');
      const target = noteFor(raw, 'dup');

      expect(removeInternalNotes(raw, [target, target])).toEqual({
        next: 'dup',
        removed: 1,
        missing: 0,
      });
    });

    it('removes what is left and counts targets deleted meanwhile as missing', () => {
      const seen = [A, B, C].join('\n');
      const targets = parseInternalNotes(seen).map(toInternalNoteRef);
      const afterOtherDelete = [A, C].join('\n');

      expect(removeInternalNotes(afterOtherDelete, targets)).toEqual({
        next: null,
        removed: 2,
        missing: 1,
      });
    });

    it('keeps a note added meanwhile when clearing every note the client saw', () => {
      const seen = [A, B].join('\n');
      const targets = parseInternalNotes(seen).map(toInternalNoteRef);
      const now = [A, B, C].join('\n');

      expect(removeInternalNotes(now, targets)).toEqual({
        next: C,
        removed: 2,
        missing: 0,
      });
    });

    it('returns the original text unchanged when every target is gone', () => {
      const raw = `${A}\r\n${B}\n\n`;
      const gone = toInternalNoteRef({
        id: 'note-0',
        createdAt: '2026-09-01T09:00:00.000Z',
        authorName: 'Zed',
        content: 'deleted earlier',
      });

      expect(removeInternalNotes(raw, [gone])).toEqual({
        next: raw,
        removed: 0,
        missing: 1,
      });
      expect(removeInternalNotes(null, [gone])).toEqual({
        next: null,
        removed: 0,
        missing: 1,
      });
    });

    it('returns null when nothing is left', () => {
      const raw = `${A}\n\n${B}\n`;
      const targets = parseInternalNotes(raw).map(toInternalNoteRef);

      expect(removeInternalNotes(raw, targets)).toEqual({
        next: null,
        removed: 2,
        missing: 0,
      });
    });

    it('strips trailing whitespace like append does', () => {
      const raw = `${A}\n${B}  \n\n${C}\n`;

      expect(removeInternalNotes(raw, [noteFor(raw, 'three')])).toEqual({
        next: A + '\n' + B,
        removed: 1,
        missing: 0,
      });
    });

    it('removes a legacy line the client saw', () => {
      const raw = ['Strong olympiad track.', A].join('\n');

      expect(
        removeInternalNotes(raw, [noteFor(raw, 'Strong olympiad track.')]),
      ).toEqual({ next: A, removed: 1, missing: 0 });
    });
  });
});
