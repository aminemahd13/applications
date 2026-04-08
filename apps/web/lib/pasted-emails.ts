export const MAX_PASTED_EMAILS = 2000;

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_SPLIT_PATTERN = /[\s,;\t\r\n]+/;

export interface ParsedPastedEmails {
  emails: string[];
  duplicateEmails: string[];
  invalidTokens: string[];
  overLimit: boolean;
  truncatedCount: number;
}

function stripWrapping(value: string): string {
  let next = value.trim();
  // Remove wrapping punctuation often introduced by CSV/plain text formatting.
  next = next.replace(/^[<(\[{'"`]+/, "");
  next = next.replace(/[>)}\]'"`]+$/, "");
  next = next.replace(/[.,;:!?]+$/, "");
  if (next.toLowerCase().startsWith("mailto:")) {
    next = next.slice("mailto:".length);
  }
  return next.trim();
}

export function parsePastedEmails(
  input: string,
  options?: { maxEmails?: number },
): ParsedPastedEmails {
  const maxEmails = options?.maxEmails ?? MAX_PASTED_EMAILS;
  const normalizedInput = input.replace(/\u00a0/g, " ").trim();

  if (!normalizedInput) {
    return {
      emails: [],
      duplicateEmails: [],
      invalidTokens: [],
      overLimit: false,
      truncatedCount: 0,
    };
  }

  const emails: string[] = [];
  const duplicateEmails: string[] = [];
  const invalidTokens: string[] = [];
  const seenEmails = new Set<string>();
  const seenDuplicates = new Set<string>();
  const seenInvalidTokens = new Set<string>();
  let overLimit = false;
  let truncatedCount = 0;

  const tokens = normalizedInput
    .split(TOKEN_SPLIT_PATTERN)
    .map((token) => stripWrapping(token))
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    if (!token.includes("@")) continue;

    const normalized = token.toLowerCase();
    if (!SIMPLE_EMAIL_PATTERN.test(normalized)) {
      if (!seenInvalidTokens.has(token)) {
        seenInvalidTokens.add(token);
        invalidTokens.push(token);
      }
      continue;
    }

    if (seenEmails.has(normalized)) {
      if (!seenDuplicates.has(normalized)) {
        seenDuplicates.add(normalized);
        duplicateEmails.push(normalized);
      }
      continue;
    }

    if (emails.length >= maxEmails) {
      overLimit = true;
      truncatedCount += 1;
      continue;
    }

    seenEmails.add(normalized);
    emails.push(normalized);
  }

  return {
    emails,
    duplicateEmails,
    invalidTokens,
    overLimit,
    truncatedCount,
  };
}
