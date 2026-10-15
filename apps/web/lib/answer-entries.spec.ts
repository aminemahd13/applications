import {
  OTHER_RESPONSES_SECTION,
  buildOrderedAnswerEntries,
  describeAnswerValue,
  extractFileAnswerRefs,
  formatDateOnly,
  groupAnswerEntriesBySection,
  normalizeAnswersShape,
  parseFormDefinition,
  type AnswerEntry,
} from "./answer-entries";
import { getRequiredFieldKeySet } from "./file-answer-utils";

function keys(entries: AnswerEntry[]): string[] {
  return entries.map((entry) => entry.key);
}

function byKey(entries: AnswerEntry[], key: string): AnswerEntry {
  const entry = entries.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`No entry for key "${key}"`);
  return entry;
}

const PROFILE_FORM = {
  sections: [
    {
      id: "s1",
      title: "Identity",
      fields: [
        { id: "f1", key: "first_name", type: "text", label: "First name" },
        { id: "f2", key: "last_name", type: "text", label: "Last name" },
      ],
    },
    {
      id: "s2",
      title: "School",
      fields: [
        { id: "f3", key: "school", type: "text", label: "School name" },
        {
          id: "f4",
          key: "grade",
          type: "select",
          label: "Grade",
          ui: {
            options: [
              { label: "Grade 10", value: "g10" },
              { label: "Grade 11", value: "g11" },
            ],
          },
        },
      ],
    },
  ],
};

describe("answer-entries", () => {
  describe("ordering and labels", () => {
    it("follows form section/field order, not answer insertion order", () => {
      const entries = buildOrderedAnswerEntries(PROFILE_FORM, {
        grade: "g11",
        school: "Lycée",
        last_name: "Doe",
        first_name: "Jane",
      });

      expect(keys(entries)).toEqual(["first_name", "last_name", "school", "grade"]);
      expect(entries.map((entry) => entry.label)).toEqual([
        "First name",
        "Last name",
        "School name",
        "Grade",
      ]);
      expect(entries.map((entry) => entry.sectionTitle)).toEqual([
        "Identity",
        "Identity",
        "School",
        "School",
      ]);
      expect(entries.every((entry) => entry.isInForm)).toBe(true);
    });

    it("puts answer keys missing from the form last, labelled by key, in stored order", () => {
      const entries = buildOrderedAnswerEntries(PROFILE_FORM, {
        zeta: "z",
        first_name: "Jane",
        alpha: "a",
      });

      expect(keys(entries)).toEqual(["first_name", "zeta", "alpha"]);
      const zeta = byKey(entries, "zeta");
      expect(zeta).toMatchObject({
        label: "zeta",
        sectionTitle: OTHER_RESPONSES_SECTION,
        isInForm: false,
        isRequired: false,
        hiddenByLogic: false,
        displayValue: null,
      });
    });

    it("supports legacy `pages` definitions", () => {
      const entries = buildOrderedAnswerEntries(
        {
          pages: [
            {
              title: "Page one",
              fields: [{ id: "q1", key: "q1", type: "text", label: "Question one" }],
            },
          ],
        },
        { q1: "answer" },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        key: "q1",
        label: "Question one",
        sectionTitle: "Page one",
        isInForm: true,
      });
    });

    it("turns root-level `fields` into a General section", () => {
      const entries = buildOrderedAnswerEntries(
        { fields: [{ id: "a", key: "a", type: "text", label: "A field" }] },
        { a: "x" },
      );

      expect(entries[0]).toMatchObject({ key: "a", label: "A field", sectionTitle: "General" });
    });

    it("appends root-level `fields` after the regular sections", () => {
      const entries = buildOrderedAnswerEntries(
        {
          sections: [
            {
              title: "Main",
              fields: [{ id: "m", key: "m", type: "text", label: "Main field" }],
            },
          ],
          fields: [{ id: "r", key: "r", type: "text", label: "Root field" }],
        },
        { r: "root", m: "main" },
      );

      expect(entries.map((entry) => [entry.key, entry.sectionTitle])).toEqual([
        ["m", "Main"],
        ["r", "General"],
      ]);
    });

    it("falls back to the key when a field has no label", () => {
      const entries = buildOrderedAnswerEntries(
        { sections: [{ title: "S", fields: [{ id: "x1", key: "nickname", type: "text" }] }] },
        { nickname: "JJ" },
      );

      expect(entries[0].label).toBe("nickname");
    });
  });

  describe("definition parsing", () => {
    it("parses a `{ schema }` wrapper and a JSON string", () => {
      const wrapped = buildOrderedAnswerEntries({ schema: PROFILE_FORM }, { grade: "g10" });
      const json = buildOrderedAnswerEntries(JSON.stringify(PROFILE_FORM), { grade: "g10" });

      expect(wrapped[0]).toMatchObject({ label: "Grade", displayValue: "Grade 10" });
      expect(json[0]).toMatchObject({ label: "Grade", displayValue: "Grade 10" });
    });

    it.each([
      ["invalid JSON", "{not json"],
      ["null", null],
      ["a number", 42],
      ["an array", [1, 2, 3]],
      ["sections that are not arrays", { sections: "nope" }],
      ["garbage sections", { sections: [null, 7, { fields: [null, "x"] }] }],
    ])("never throws for %s and lists every answer under Other responses", (_, definition) => {
      const entries = buildOrderedAnswerEntries(definition, { a: 1, b: "two" });

      expect(keys(entries)).toEqual(["a", "b"]);
      expect(entries.every((entry) => entry.sectionTitle === OTHER_RESPONSES_SECTION)).toBe(true);
    });

    it("exposes parseFormDefinition with the review page semantics", () => {
      expect(parseFormDefinition(null)).toBeNull();
      expect(parseFormDefinition("")).toBeNull();
      expect(parseFormDefinition("[1]")).toBeNull();
      expect(parseFormDefinition("{bad")).toBeNull();
      expect(parseFormDefinition('{"sections":[]}')).toEqual({ sections: [] });
      expect(parseFormDefinition({ schema: { sections: [] } })).toEqual({ sections: [] });
      expect(parseFormDefinition({ schema: "x", sections: [] })).toEqual({
        schema: "x",
        sections: [],
      });
      expect(parseFormDefinition([])).toBeNull();
    });
  });

  describe("key matching", () => {
    it("matches a field that only has an id", () => {
      const entries = buildOrderedAnswerEntries(
        { sections: [{ title: "S", fields: [{ id: "only_id", type: "text", label: "Only id" }] }] },
        { only_id: "v" },
      );

      expect(entries[0]).toMatchObject({ key: "only_id", label: "Only id", isInForm: true });
    });

    it("matches an answer stored under the field id and keeps that literal key", () => {
      const entries = buildOrderedAnswerEntries(
        {
          sections: [
            { title: "S", fields: [{ id: "uuid-123", key: "passport", type: "text", label: "Passport" }] },
          ],
        },
        { "uuid-123": "AB123" },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ key: "uuid-123", label: "Passport", isInForm: true });
    });

    it("prefers the canonical key over the id alias when both are present", () => {
      const entries = buildOrderedAnswerEntries(
        {
          sections: [
            { title: "S", fields: [{ id: "uuid-1", key: "city", type: "text", label: "City" }] },
          ],
        },
        { "uuid-1": "old", city: "Rabat" },
      );

      expect(byKey(entries, "city")).toMatchObject({ label: "City", isInForm: true });
      expect(byKey(entries, "uuid-1")).toMatchObject({
        label: "uuid-1",
        sectionTitle: OTHER_RESPONSES_SECTION,
      });
    });

    it("trims the form key when matching answers", () => {
      const entries = buildOrderedAnswerEntries(
        { sections: [{ title: "S", fields: [{ id: "x", key: " city ", type: "text", label: "City" }] }] },
        { city: "Fes" },
      );

      expect(entries[0]).toMatchObject({ key: "city", label: "City", isInForm: true });
    });

    it("keeps the first field when keys are duplicated across sections", () => {
      const entries = buildOrderedAnswerEntries(
        {
          sections: [
            { title: "One", fields: [{ id: "a1", key: "dup", type: "text", label: "First" }] },
            { title: "Two", fields: [{ id: "a2", key: "dup", type: "text", label: "Second" }] },
          ],
        },
        { dup: "value" },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ key: "dup", label: "First", sectionTitle: "One" });
    });

    it("treats a duplicated key as required/file when any duplicate field is", () => {
      const entries = buildOrderedAnswerEntries(
        {
          sections: [
            { title: "One", fields: [{ id: "a1", key: "dup", type: "text", label: "First" }] },
            {
              title: "Two",
              fields: [
                {
                  id: "a2",
                  key: "dup",
                  type: "file_upload",
                  label: "Second",
                  validation: { required: true },
                },
              ],
            },
          ],
        },
        { dup: { fileObjectId: "file-1", originalFilename: "id.pdf" } },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        key: "dup",
        label: "First",
        isRequired: true,
        isFile: true,
      });
    });

    it("never lets an id alias take another field's canonical key", () => {
      const entries = buildOrderedAnswerEntries(
        {
          sections: [
            {
              title: "S",
              fields: [
                { id: "city", key: "hometown", type: "text", label: "Hometown" },
                {
                  id: "f2",
                  key: "city",
                  type: "text",
                  label: "Current city",
                  validation: { required: true },
                },
              ],
            },
          ],
        },
        { city: "Rabat" },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        key: "city",
        label: "Current city",
        isRequired: true,
        value: "Rabat",
      });
    });

    it("never emits info_text fields; a stray value under that key goes to Other responses", () => {
      const entries = buildOrderedAnswerEntries(
        {
          sections: [
            {
              title: "S",
              fields: [
                { id: "intro", key: "intro", type: "info_text", label: "Read this" },
                { id: "q", key: "q", type: "text", label: "Question" },
              ],
            },
          ],
        },
        { intro: "stray", q: "answer" },
      );

      expect(keys(entries)).toEqual(["q", "intro"]);
      expect(byKey(entries, "intro")).toMatchObject({
        label: "intro",
        isInForm: false,
        sectionTitle: OTHER_RESPONSES_SECTION,
      });
    });
  });

  describe("display values", () => {
    const optionsForm = {
      sections: [
        {
          title: "Choices",
          fields: [
            {
              id: "track",
              key: "track",
              type: "select",
              label: "Track",
              ui: {
                options: [
                  { label: "Olympiad", value: "oly" },
                  { label: "Research", value: "res" },
                ],
              },
            },
            {
              id: "legacy_select",
              key: "legacy_select",
              type: "select",
              label: "Legacy",
              options: [{ label: "Option A", value: "a" }],
            },
            {
              id: "topics",
              key: "topics",
              type: "multi_select",
              label: "Topics",
              ui: {
                options: [
                  { label: "Algebra", value: "alg" },
                  { label: "Geometry", value: "geo" },
                  { label: "Number theory", value: "nt" },
                ],
              },
            },
            {
              id: "custom",
              key: "custom",
              type: "radio_buttons",
              label: "Custom type",
              ui: { options: [{ label: "Yes please", value: "y" }] },
            },
          ],
        },
      ],
    };

    it("maps a select value to its option label; unknown values stay raw", () => {
      const known = buildOrderedAnswerEntries(optionsForm, { track: "res" });
      const unknown = buildOrderedAnswerEntries(optionsForm, { track: "zzz" });
      const padded = buildOrderedAnswerEntries(optionsForm, { track: " oly " });

      expect(known[0].displayValue).toBe("Research");
      expect(known[0].value).toBe("res");
      expect(unknown[0].displayValue).toBeNull();
      expect(unknown[0].value).toBe("zzz");
      expect(padded[0].displayValue).toBe("Olympiad");
    });

    it("reads options from the legacy root-level `options`", () => {
      const entries = buildOrderedAnswerEntries(optionsForm, { legacy_select: "a" });
      expect(entries[0].displayValue).toBe("Option A");
    });

    it("maps multiselect values to labels in stored order, keeping unknown values raw", () => {
      const entries = buildOrderedAnswerEntries(optionsForm, { topics: ["nt", "mystery", "alg"] });
      expect(entries[0].displayValue).toEqual(["Number theory", "mystery", "Algebra"]);
      expect(entries[0].value).toEqual(["nt", "mystery", "alg"]);
    });

    it("treats an empty multiselect or empty string as having no display value", () => {
      const entries = buildOrderedAnswerEntries(optionsForm, { topics: [], track: "" });
      expect(byKey(entries, "topics").displayValue).toBeNull();
      expect(byKey(entries, "track").displayValue).toBeNull();
    });

    it("maps option labels for unknown/legacy field types that carry options", () => {
      const entries = buildOrderedAnswerEntries(optionsForm, { custom: "y" });
      expect(entries[0].displayValue).toBe("Yes please");
    });

    it("renders checkbox values as Yes/No and maps checkbox arrays through options", () => {
      const form = {
        sections: [
          {
            title: "S",
            fields: [
              { id: "c1", key: "c1", type: "checkbox", label: "Agree" },
              { id: "c2", key: "c2", type: "checkbox", label: "Consent" },
              { id: "c3", key: "c3", type: "checkbox", label: "Newsletter" },
              {
                id: "c4",
                key: "c4",
                type: "checkbox",
                label: "Days",
                ui: {
                  options: [
                    { label: "Monday", value: "mon" },
                    { label: "Tuesday", value: "tue" },
                  ],
                },
              },
            ],
          },
        ],
      };
      const entries = buildOrderedAnswerEntries(form, {
        c1: true,
        c2: false,
        c3: "true",
        c4: ["tue", "mon"],
      });

      expect(byKey(entries, "c1").displayValue).toBe("Yes");
      expect(byKey(entries, "c2").displayValue).toBe("No");
      expect(byKey(entries, "c3").displayValue).toBe("Yes");
      expect(byKey(entries, "c4").displayValue).toEqual(["Tuesday", "Monday"]);
    });

    it("formats YYYY-MM-DD dates without timezone shifts and keeps other strings raw", () => {
      const form = {
        sections: [
          { title: "S", fields: [{ id: "d", key: "dob", type: "date", label: "Date of birth" }] },
        ],
      };

      expect(buildOrderedAnswerEntries(form, { dob: "2004-05-12" })[0].displayValue).toBe(
        "12 May 2004",
      );
      expect(buildOrderedAnswerEntries(form, { dob: "2004-01-01" })[0].displayValue).toBe(
        "1 January 2004",
      );
      expect(buildOrderedAnswerEntries(form, { dob: "next tuesday" })[0].displayValue).toBeNull();
    });

    it("leaves numbers (stored as number or string) untouched", () => {
      const form = {
        sections: [
          { title: "S", fields: [{ id: "n", key: "age", type: "number", label: "Age" }] },
        ],
      };

      expect(buildOrderedAnswerEntries(form, { age: 17 })[0].displayValue).toBeNull();
      expect(buildOrderedAnswerEntries(form, { age: "17" })[0].displayValue).toBeNull();
      expect(buildOrderedAnswerEntries(form, { age: 17 })[0].value).toBe(17);
    });
  });

  describe("files", () => {
    const fileForm = {
      sections: [
        {
          title: "Docs",
          fields: [
            { id: "p", key: "passport", type: "file_upload", label: "Passport" },
            { id: "t", key: "transcripts", type: "file", label: "Transcripts" },
          ],
        },
      ],
    };

    it("flags single and multiple file answers with their refs", () => {
      const entries = buildOrderedAnswerEntries(fileForm, {
        passport: { fileObjectId: "f-1", originalFilename: "passport.pdf", sizeBytes: 1024 },
        transcripts: [
          { fileObjectId: "f-2", originalFilename: "t1.pdf" },
          { fileObjectId: "f-3" },
        ],
      });

      expect(byKey(entries, "passport")).toMatchObject({
        isFile: true,
        displayValue: null,
        fileRefs: [{ fileObjectId: "f-1", originalFilename: "passport.pdf", sizeBytes: 1024 }],
      });
      expect(byKey(entries, "transcripts")).toMatchObject({
        isFile: true,
        displayValue: null,
        fileRefs: [
          { fileObjectId: "f-2", originalFilename: "t1.pdf" },
          { fileObjectId: "f-3" },
        ],
      });
    });

    it("detects file-shaped values that are not in the form", () => {
      const entries = buildOrderedAnswerEntries(fileForm, {
        extra_doc: { fileObjectId: "f-9", originalFilename: "extra.png" },
        note: "plain",
      });

      expect(byKey(entries, "extra_doc")).toMatchObject({
        isInForm: false,
        isFile: true,
        displayValue: null,
        fileRefs: [{ fileObjectId: "f-9", originalFilename: "extra.png" }],
      });
      expect(byKey(entries, "note")).toMatchObject({ isFile: false, fileRefs: [] });
    });

    it("extractFileAnswerRefs handles objects, arrays and ignores everything else", () => {
      expect(extractFileAnswerRefs({ fileObjectId: "a", sizeBytes: 5 })).toEqual([
        { fileObjectId: "a", originalFilename: undefined, sizeBytes: 5 },
      ]);
      expect(
        extractFileAnswerRefs([{ fileObjectId: "a" }, "b", null, { fileObjectId: "  " }, [{ fileObjectId: "c" }]]),
      ).toEqual([
        { fileObjectId: "a", originalFilename: undefined, sizeBytes: undefined },
        { fileObjectId: "c", originalFilename: undefined, sizeBytes: undefined },
      ]);
      expect(extractFileAnswerRefs("123e4567-e89b-12d3-a456-426614174000")).toEqual([]);
      expect(extractFileAnswerRefs({ fileObjectId: 7 })).toEqual([]);
      expect(extractFileAnswerRefs({ fileObjectId: "a", sizeBytes: "5" })[0].sizeBytes).toBeUndefined();
      expect(extractFileAnswerRefs(null)).toEqual([]);
    });
  });

  describe("required and visibility", () => {
    const form = {
      sections: [
        {
          title: "S",
          fields: [
            { id: "a", key: "a", type: "text", label: "A", validation: { required: true } },
            { id: "b", key: "b", type: "text", label: "B", required: true },
            { id: "kind", key: "kind", type: "text", label: "Kind" },
            {
              id: "c",
              key: "c",
              type: "text",
              label: "C",
              logic: {
                requireWhen: { mode: "all", rules: [{ fieldKey: "kind", operator: "eq", value: "school" }] },
              },
            },
            {
              id: "d",
              key: "d",
              type: "text",
              label: "D",
              logic: {
                showWhen: { mode: "all", rules: [{ fieldKey: "kind", operator: "eq", value: "other" }] },
              },
            },
            { id: "e", key: "e", type: "text", label: "E" },
          ],
        },
      ],
    };

    it("derives isRequired from validation.required, legacy required and requireWhen", () => {
      const entries = buildOrderedAnswerEntries(form, {
        a: "1",
        b: "2",
        kind: "school",
        c: "3",
        e: "5",
      });

      expect(byKey(entries, "a").isRequired).toBe(true);
      expect(byKey(entries, "b").isRequired).toBe(true);
      expect(byKey(entries, "c").isRequired).toBe(true);
      expect(byKey(entries, "kind").isRequired).toBe(false);
      expect(byKey(entries, "e").isRequired).toBe(false);

      const requireWhenFalse = buildOrderedAnswerEntries(form, { kind: "other", c: "3" });
      expect(byKey(requireWhenFalse, "c").isRequired).toBe(false);
    });

    it("keeps statically required keys aligned with getRequiredFieldKeySet", () => {
      const entries = buildOrderedAnswerEntries(form, { a: "1", b: "2", kind: "x", e: "5" });
      const requiredKeys = getRequiredFieldKeySet(form);

      for (const entry of entries.filter((candidate) => candidate.isRequired)) {
        expect(requiredKeys.has(entry.key)).toBe(true);
      }
    });

    it("keeps values hidden by showWhen, flagged hiddenByLogic", () => {
      const hidden = buildOrderedAnswerEntries(form, { kind: "school", d: "stale" });
      const shown = buildOrderedAnswerEntries(form, { kind: "other", d: "fresh" });

      expect(byKey(hidden, "d").hiddenByLogic).toBe(true);
      expect(byKey(hidden, "d").value).toBe("stale");
      expect(byKey(shown, "d").hiddenByLogic).toBe(false);
      expect(byKey(shown, "kind").hiddenByLogic).toBe(false);
    });

    it("only emits answered fields", () => {
      const entries = buildOrderedAnswerEntries(form, { e: "only" });
      expect(keys(entries)).toEqual(["e"]);
    });

    it("emits a field whose answer is explicitly null", () => {
      const entries = buildOrderedAnswerEntries(form, { a: null });
      expect(entries[0]).toMatchObject({ key: "a", value: null, displayValue: null });
    });
  });

  describe("answers shape", () => {
    it("unwraps the legacy data wrapper", () => {
      expect(keys(buildOrderedAnswerEntries(null, { data: { a: 1 } }))).toEqual(["a"]);
      expect(keys(buildOrderedAnswerEntries(null, { data: { a: 1 }, b: 2 }))).toEqual(["b", "a"]);
      expect(keys(buildOrderedAnswerEntries(null, { data: "x" }))).toEqual(["data"]);
    });

    it("normalizeAnswersShape matches the API semantics and does not mutate input", () => {
      const input = { data: { a: 1, b: 9 }, b: 2 };
      expect(normalizeAnswersShape(input)).toEqual({ b: 9, a: 1 });
      expect(input).toEqual({ data: { a: 1, b: 9 }, b: 2 });
      expect(normalizeAnswersShape({ data: {} })).toEqual({ data: {} });
      expect(normalizeAnswersShape({ data: [1] })).toEqual({ data: [1] });
      expect(normalizeAnswersShape(null)).toEqual({});
      expect(normalizeAnswersShape([1, 2])).toEqual({});
      expect(normalizeAnswersShape("x")).toEqual({});
    });

    it("returns no entries for empty or invalid answers", () => {
      expect(buildOrderedAnswerEntries(PROFILE_FORM, undefined)).toEqual([]);
      expect(buildOrderedAnswerEntries(PROFILE_FORM, {})).toEqual([]);
    });
  });

  describe("formatDateOnly", () => {
    it("formats valid calendar dates", () => {
      expect(formatDateOnly("2004-05-12")).toBe("12 May 2004");
      expect(formatDateOnly("2000-12-31")).toBe("31 December 2000");
      expect(formatDateOnly("2024-02-29")).toBe("29 February 2024");
      expect(formatDateOnly(" 2005-03-14 ")).toBe("14 March 2005");
    });

    it("rejects invalid or non-date-only strings", () => {
      expect(formatDateOnly("2023-02-29")).toBeNull();
      expect(formatDateOnly("1900-02-29")).toBeNull();
      expect(formatDateOnly("2004-13-01")).toBeNull();
      expect(formatDateOnly("2004-04-31")).toBeNull();
      expect(formatDateOnly("2004-00-10")).toBeNull();
      expect(formatDateOnly("2004-05-12T10:00:00Z")).toBeNull();
      expect(formatDateOnly("12/05/2004")).toBeNull();
      expect(formatDateOnly("")).toBeNull();
    });
  });

  describe("groupAnswerEntriesBySection", () => {
    it("groups consecutive entries by section title in order", () => {
      const entries = buildOrderedAnswerEntries(PROFILE_FORM, {
        extra: "x",
        school: "Lycée",
        first_name: "Jane",
      });
      const groups = groupAnswerEntriesBySection(entries);

      expect(groups.map((group) => [group.title, keys(group.entries)])).toEqual([
        ["Identity", ["first_name"]],
        ["School", ["school"]],
        [OTHER_RESPONSES_SECTION, ["extra"]],
      ]);
    });

    it("returns a single group when there is no form", () => {
      const groups = groupAnswerEntriesBySection(buildOrderedAnswerEntries(null, { a: 1, b: 2 }));
      expect(groups).toHaveLength(1);
      expect(groups[0].title).toBe(OTHER_RESPONSES_SECTION);
    });

    it("returns no groups for no entries", () => {
      expect(groupAnswerEntriesBySection([])).toEqual([]);
    });
  });

  describe("describeAnswerValue", () => {
    const form = {
      sections: [
        {
          title: "S",
          fields: [
            {
              id: "track",
              key: "track",
              type: "select",
              label: "Track",
              ui: { options: [{ label: "Olympiad", value: "oly" }] },
            },
            {
              id: "topics",
              key: "topics",
              type: "multiselect",
              label: "Topics",
              ui: {
                options: [
                  { label: "Algebra", value: "alg" },
                  { label: "Geometry", value: "geo" },
                ],
              },
            },
            { id: "agree", key: "agree", type: "checkbox", label: "Agree" },
            { id: "dob", key: "dob", type: "date", label: "Date of birth" },
            { id: "doc", key: "doc", type: "file_upload", label: "Document" },
            { id: "uuid-x", key: "aliased", type: "select", label: "Aliased", ui: { options: [{ label: "Label X", value: "x" }] } },
          ],
        },
      ],
    };

    it("uses option labels, Yes/No and formatted dates", () => {
      expect(describeAnswerValue(form, "track", "oly")).toBe("Olympiad");
      expect(describeAnswerValue(form, "topics", ["geo", "alg", "zzz"])).toBe(
        "Geometry, Algebra, zzz",
      );
      expect(describeAnswerValue(form, "agree", false)).toBe("No");
      expect(describeAnswerValue(form, "dob", "2004-05-12")).toBe("12 May 2004");
      expect(describeAnswerValue(form, "uuid-x", "x")).toBe("Label X");
    });

    it("summarizes files by name", () => {
      expect(
        describeAnswerValue(form, "doc", [
          { fileObjectId: "f1", originalFilename: "a.pdf" },
          { fileObjectId: "f2" },
        ]),
      ).toBe("a.pdf, file-f2");
    });

    it("describes empty and missing values", () => {
      expect(describeAnswerValue(form, "track", undefined)).toBe("(not answered)");
      expect(describeAnswerValue(form, "track", null)).toBe("(empty)");
      expect(describeAnswerValue(form, "track", "   ")).toBe("(empty)");
      expect(describeAnswerValue(form, "topics", [])).toBe("(empty)");
      expect(describeAnswerValue(form, "other", {})).toBe("(empty)");
    });

    it("falls back to raw text, joined lists and compact JSON", () => {
      expect(describeAnswerValue(form, "track", "unknown")).toBe("unknown");
      expect(describeAnswerValue(null, "free", "hello\nworld")).toBe("hello\nworld");
      expect(describeAnswerValue(null, "n", 42)).toBe("42");
      expect(describeAnswerValue(null, "list", ["a", 1])).toBe("a, 1");
      expect(describeAnswerValue(null, "obj", { a: 1, b: [2] })).toBe('{"a":1,"b":[2]}');
      expect(describeAnswerValue("{bad", "flag", true)).toBe("Yes");
    });
  });
});
