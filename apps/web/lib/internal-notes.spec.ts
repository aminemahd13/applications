import { describeNoteDeletion, notesFromResponse } from "./internal-notes";

describe("internal-notes helpers", () => {
  describe("describeNoteDeletion", () => {
    it("confirms a single deleted note", () => {
      expect(
        describeNoteDeletion({ mode: "single", removed: 1, missing: 0, remaining: 3 }),
      ).toEqual({ kind: "success", message: "Note deleted" });
    });

    it("reports a note someone else already removed as info, not an error", () => {
      expect(
        describeNoteDeletion({ mode: "single", removed: 0, missing: 1, remaining: 2 }),
      ).toEqual({ kind: "info", message: "That note was already removed" });
    });

    it("counts cleared notes", () => {
      expect(
        describeNoteDeletion({ mode: "clear", removed: 1, missing: 0, remaining: 0 }),
      ).toEqual({ kind: "success", message: "Cleared 1 note" });
      expect(
        describeNoteDeletion({ mode: "clear", removed: 4, missing: 1, remaining: 0 }),
      ).toEqual({ kind: "success", message: "Cleared 4 notes" });
    });

    it("mentions notes added since the page loaded that were kept", () => {
      expect(
        describeNoteDeletion({ mode: "clear", removed: 3, missing: 0, remaining: 1 }),
      ).toEqual({
        kind: "success",
        message: "Cleared 3 notes. 1 note added since you loaded the page was kept",
      });
      expect(
        describeNoteDeletion({ mode: "clear", removed: 2, missing: 0, remaining: 2 }),
      ).toEqual({
        kind: "success",
        message: "Cleared 2 notes. 2 notes added since you loaded the page were kept",
      });
    });

    it("reports a clear where every note was already removed as info", () => {
      expect(
        describeNoteDeletion({ mode: "clear", removed: 0, missing: 2, remaining: 0 }),
      ).toEqual({ kind: "info", message: "These notes were already removed" });
      expect(
        describeNoteDeletion({ mode: "clear", removed: 0, missing: 2, remaining: 1 }),
      ).toEqual({
        kind: "info",
        message:
          "These notes were already removed. 1 note added since you loaded the page was kept",
      });
    });

    it("handles an empty clear defensively", () => {
      expect(
        describeNoteDeletion({ mode: "clear", removed: 0, missing: 0, remaining: 0 }),
      ).toEqual({ kind: "info", message: "No notes to clear" });
    });
  });

  describe("notesFromResponse", () => {
    const note = {
      id: "note-0",
      createdAt: "2026-10-15T09:30:00.000Z",
      authorName: "Ada",
      content: "ok",
    };

    it("returns the notes array from a { data: { notes } } response", () => {
      expect(notesFromResponse({ data: { notes: [note], removed: 1, missing: 0 } })).toEqual([
        note,
      ]);
      expect(notesFromResponse({ data: { notes: [] } })).toEqual([]);
    });

    it("returns null for responses without a notes array", () => {
      expect(notesFromResponse(undefined)).toBeNull();
      expect(notesFromResponse(null)).toBeNull();
      expect(notesFromResponse({})).toBeNull();
      expect(notesFromResponse({ data: null })).toBeNull();
      expect(notesFromResponse({ data: { notes: "x" } })).toBeNull();
      expect(notesFromResponse({ notes: [note] })).toBeNull();
    });
  });
});
