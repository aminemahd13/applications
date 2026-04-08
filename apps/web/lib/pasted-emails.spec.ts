import {
  MAX_PASTED_EMAILS,
  parsePastedEmails,
} from "./pasted-emails";

describe("parsePastedEmails", () => {
  it("parses newline lists and tracks duplicates", () => {
    const parsed = parsePastedEmails(
      "Alice@example.com\nbob@example.com\nALICE@example.com",
    );

    expect(parsed).toEqual({
      emails: ["alice@example.com", "bob@example.com"],
      duplicateEmails: ["alice@example.com"],
      invalidTokens: [],
      overLimit: false,
      truncatedCount: 0,
    });
  });

  it("extracts from csv/tsv style pasted content", () => {
    const parsed = parsePastedEmails(
      'Name,Email\nAlice,alice@example.com\nBob\tbob@example.com\n"Carol",carol@example.com',
    );

    expect(parsed.emails).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
    ]);
    expect(parsed.invalidTokens).toEqual([]);
    expect(parsed.duplicateEmails).toEqual([]);
  });

  it("extracts embedded emails and tracks invalid tokens", () => {
    const parsed = parsePastedEmails(
      "Reach <one@example.com>; second@example.com and mailto:third@example.com bad@@example",
    );

    expect(parsed.emails).toEqual([
      "one@example.com",
      "second@example.com",
      "third@example.com",
    ]);
    expect(parsed.invalidTokens).toEqual(["bad@@example"]);
  });

  it("enforces max email limit and reports truncation", () => {
    const input = Array.from(
      { length: MAX_PASTED_EMAILS + 5 },
      (_, index) => `user${index}@example.com`,
    ).join("\n");

    const parsed = parsePastedEmails(input);

    expect(parsed.emails).toHaveLength(MAX_PASTED_EMAILS);
    expect(parsed.overLimit).toBe(true);
    expect(parsed.truncatedCount).toBe(5);
  });
});
