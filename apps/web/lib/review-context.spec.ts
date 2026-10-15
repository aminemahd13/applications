import { StepStatus } from "@event-platform/shared";
import type {
  ReviewContextApplicant,
  ReviewContextFile,
  ReviewContextStep,
} from "@event-platform/shared";
import {
  EMPTY_VALUE_PLACEHOLDER,
  LEGACY_NOTE_AUTHOR,
  PREVIEWABLE_MIME_TYPES,
  SIGNED_URL_EXPIRY_SKEW_MS,
  buildApplicantProfileRows,
  buildContextStepRows,
  buildEditedFieldMap,
  contextFileKey,
  describeMimeType,
  formatFileSize,
  formatTimeAgo,
  getFreshSignedUrl,
  getNoteAuthorLabel,
  getPreviewKind,
  getStepStatusBadgeVariant,
  getStepStatusLabel,
  indexContextFiles,
  isSignedUrlFresh,
  parseSignedUrlResponse,
  resolveContextFileMeta,
  signedUrlCacheKey,
  type SignedUrlEntry,
} from "./review-context";

const STEP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STEP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FILE_1 = "11111111-1111-4111-8111-111111111111";
const FILE_2 = "22222222-2222-4222-8222-222222222222";

function applicant(
  overrides: Partial<ReviewContextApplicant> = {},
): ReviewContextApplicant {
  return {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    institution: "University of London",
    city: "London",
    country: "United Kingdom",
    dateOfBirth: "2005-03-14",
    ...overrides,
  };
}

function step(overrides: Partial<ReviewContextStep> = {}): ReviewContextStep {
  return {
    stepId: STEP_A,
    stepIndex: 0,
    title: "Step",
    category: "FORM",
    status: null,
    isQueueItemStep: false,
    submission: null,
    ...overrides,
  };
}

function submission(): NonNullable<ReviewContextStep["submission"]> {
  return {
    submissionVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    versionNumber: 1,
    submittedAt: new Date("2026-05-01T10:00:00Z"),
    formDefinition: null,
    answers: {},
    editedFields: [],
  };
}

function file(overrides: Partial<ReviewContextFile> = {}): ReviewContextFile {
  return {
    fileObjectId: FILE_1,
    stepId: STEP_A,
    fieldKey: "cv",
    originalFilename: "cv.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    ...overrides,
  };
}

describe("getStepStatusLabel", () => {
  it.each([
    [StepStatus.LOCKED, "Locked"],
    [StepStatus.UNLOCKED, "Not submitted"],
    [StepStatus.SUBMITTED, "Submitted"],
    [StepStatus.NEEDS_REVISION, "Revision requested"],
    [StepStatus.APPROVED, "Approved"],
    [StepStatus.REJECTED_FINAL, "Rejected"],
  ])("maps %s to %s", (status, label) => {
    expect(getStepStatusLabel(status, false)).toBe(label);
  });

  it("labels a missing state as Not started", () => {
    expect(getStepStatusLabel(null, false)).toBe("Not started");
    expect(getStepStatusLabel(undefined, false)).toBe("Not started");
    expect(getStepStatusLabel("  ", false)).toBe("Not started");
  });

  it("labels a missing state with a submission as Submitted", () => {
    expect(getStepStatusLabel(null, true)).toBe("Submitted");
  });

  it("labels a staff-reopened step (UNLOCKED with a submission) as Reopened", () => {
    expect(getStepStatusLabel(StepStatus.UNLOCKED, true)).toBe("Reopened");
  });

  it("keeps the mapped label for other statuses with a submission", () => {
    expect(getStepStatusLabel(StepStatus.APPROVED, true)).toBe("Approved");
    expect(getStepStatusLabel(StepStatus.LOCKED, true)).toBe("Locked");
  });

  it("humanizes unknown statuses instead of showing raw codes", () => {
    expect(getStepStatusLabel("UNLOCKED_DRAFT", false)).toBe("Unlocked draft");
  });
});

describe("getStepStatusBadgeVariant", () => {
  it("uses tonal variants for meaningful states", () => {
    expect(getStepStatusBadgeVariant(StepStatus.APPROVED, true)).toBe("success");
    expect(getStepStatusBadgeVariant(StepStatus.SUBMITTED, true)).toBe("info");
    expect(getStepStatusBadgeVariant(StepStatus.NEEDS_REVISION, true)).toBe(
      "warning",
    );
    expect(getStepStatusBadgeVariant(StepStatus.REJECTED_FINAL, true)).toBe(
      "destructive",
    );
  });

  it("uses outline for locked, unlocked, unknown and not-started states", () => {
    expect(getStepStatusBadgeVariant(StepStatus.LOCKED, false)).toBe("outline");
    expect(getStepStatusBadgeVariant(StepStatus.UNLOCKED, false)).toBe("outline");
    expect(getStepStatusBadgeVariant("SOMETHING_ELSE", false)).toBe("outline");
    expect(getStepStatusBadgeVariant(null, false)).toBe("outline");
  });

  it("treats a missing state with a submission like Submitted", () => {
    expect(getStepStatusBadgeVariant(null, true)).toBe("info");
  });
});

describe("buildContextStepRows", () => {
  it("keeps API order, numbers from 1 and classifies each step", () => {
    const rows = buildContextStepRows([
      step({ stepId: "s1", stepIndex: 0, status: StepStatus.APPROVED, submission: submission() }),
      step({ stepId: "s2", stepIndex: 1, status: StepStatus.SUBMITTED, isQueueItemStep: true, submission: submission() }),
      step({ stepId: "s3", stepIndex: 2, status: StepStatus.LOCKED }),
      step({ stepId: "s4", stepIndex: 3, status: null }),
    ]);

    expect(rows.map((row) => row.step.stepId)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(rows.map((row) => row.number)).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.kind)).toEqual([
      "submitted",
      "under-review",
      "not-submitted",
      "not-submitted",
    ]);
    expect(rows.map((row) => row.statusLabel)).toEqual([
      "Approved",
      "Submitted",
      "Locked",
      "Not started",
    ]);
  });

  it("marks the queue-item step as under review even without a submission", () => {
    const [row] = buildContextStepRows([step({ isQueueItemStep: true })]);
    expect(row.kind).toBe("under-review");
  });

  it("returns an empty list for missing steps", () => {
    expect(buildContextStepRows(undefined)).toEqual([]);
    expect(buildContextStepRows(null)).toEqual([]);
  });
});

describe("buildEditedFieldMap", () => {
  it("maps keys to original values, undefined when staff added the field", () => {
    const map = buildEditedFieldMap([
      { key: "city", originalValue: "Rabat" },
      { key: "added" },
      { key: "city", originalValue: "ignored duplicate" },
    ]);
    expect(Array.from(map.keys())).toEqual(["city", "added"]);
    expect(map.get("city")).toBe("Rabat");
    expect(map.has("added")).toBe(true);
    expect(map.get("added")).toBeUndefined();
  });

  it("handles missing input", () => {
    expect(buildEditedFieldMap(undefined).size).toBe(0);
  });
});

describe("buildApplicantProfileRows", () => {
  it("returns the seven reviewer-visible rows in order", () => {
    const rows = buildApplicantProfileRows(applicant());
    expect(rows.map((row) => row.label)).toEqual([
      "First name",
      "Last name",
      "Email",
      "Institution",
      "City",
      "Country",
      "Date of birth",
    ]);
    expect(rows.map((row) => row.value)).toEqual([
      "Ada",
      "Lovelace",
      "ada@example.com",
      "University of London",
      "London",
      "United Kingdom",
      "14 March 2005",
    ]);
    expect(rows.every((row) => !row.isEmpty)).toBe(true);
  });

  it("shows the legacy full name as one Name row when first/last are missing", () => {
    const rows = buildApplicantProfileRows(
      applicant({ firstName: null, lastName: null, fullName: "Youssef Amrani" }),
    );
    expect(rows.slice(0, 2).map((row) => [row.key, row.label, row.value])).toEqual([
      ["fullName", "Name", "Youssef Amrani"],
      ["email", "Email", "ada@example.com"],
    ]);
  });

  it("keeps first/last rows (with placeholders) when only one part is known", () => {
    const rows = buildApplicantProfileRows(
      applicant({ firstName: "Ada", lastName: null, fullName: "Ada" }),
    );
    expect(rows.slice(0, 2).map((row) => [row.label, row.value, row.isEmpty])).toEqual([
      ["First name", "Ada", false],
      ["Last name", "—", true],
    ]);
  });

  it("never includes phone, education or links even if present", () => {
    const rows = buildApplicantProfileRows({
      ...applicant(),
      phone: "+212600000000",
      education: "Bachelor",
      links: ["https://example.com"],
    } as ReviewContextApplicant);
    const labels = rows.map((row) => row.label.toLowerCase());
    expect(labels).not.toEqual(expect.arrayContaining(["phone"]));
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.value)).not.toContain("+212600000000");
  });

  it("renders null and blank values as an em dash", () => {
    const rows = buildApplicantProfileRows(
      applicant({
        firstName: null,
        lastName: "  ",
        fullName: null,
        institution: null,
        city: null,
        country: null,
        dateOfBirth: null,
      }),
    );
    const empty = rows.filter((row) => row.isEmpty).map((row) => row.key);
    expect(empty).toEqual([
      "firstName",
      "lastName",
      "institution",
      "city",
      "country",
      "dateOfBirth",
    ]);
    expect(rows.find((row) => row.key === "dateOfBirth")?.value).toBe(
      EMPTY_VALUE_PLACEHOLDER,
    );
  });

  it("keeps a malformed date of birth as-is", () => {
    const rows = buildApplicantProfileRows(applicant({ dateOfBirth: "14/03/2005" }));
    expect(rows.find((row) => row.key === "dateOfBirth")?.value).toBe("14/03/2005");
  });

  it("returns em dashes for a missing applicant", () => {
    const rows = buildApplicantProfileRows(null);
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => row.isEmpty)).toBe(true);
  });
});

describe("getPreviewKind", () => {
  it("previews exactly the allow-listed types", () => {
    expect(getPreviewKind("image/png")).toBe("image");
    expect(getPreviewKind("image/jpeg")).toBe("image");
    expect(getPreviewKind("image/webp")).toBe("image");
    expect(getPreviewKind("image/gif")).toBe("image");
    expect(getPreviewKind("application/pdf")).toBe("pdf");
    expect(PREVIEWABLE_MIME_TYPES).toHaveLength(5);
  });

  it("tolerates case and surrounding whitespace", () => {
    expect(getPreviewKind(" Application/PDF ")).toBe("pdf");
  });

  it.each([
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "text/xml",
    "application/xml",
    "text/plain",
    "text/javascript",
    "image/heic",
    "image/tiff",
    "application/octet-stream",
    "image/png; charset=utf-8",
    "image/",
    "",
  ])("never previews %p", (mime) => {
    expect(getPreviewKind(mime)).toBeNull();
  });

  it("never previews without a MIME type", () => {
    expect(getPreviewKind(null)).toBeNull();
    expect(getPreviewKind(undefined)).toBeNull();
  });
});

describe("describeMimeType", () => {
  it("labels common types and passes others through", () => {
    expect(describeMimeType("application/pdf")).toBe("PDF");
    expect(describeMimeType("image/jpeg")).toBe("JPEG image");
    expect(describeMimeType("application/zip")).toBe("application/zip");
    expect(describeMimeType(null)).toBeNull();
    expect(describeMimeType("  ")).toBeNull();
  });
});

describe("formatFileSize", () => {
  it("formats bytes like the existing file links", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1023)).toBe("1023 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("returns null for unusable sizes", () => {
    expect(formatFileSize(null)).toBeNull();
    expect(formatFileSize(undefined)).toBeNull();
    expect(formatFileSize(-1)).toBeNull();
    expect(formatFileSize(Number.NaN)).toBeNull();
  });
});

describe("indexContextFiles / resolveContextFileMeta", () => {
  it("indexes by step + id and by id, first occurrence wins", () => {
    const first = file();
    const sameIdOtherStep = file({ stepId: STEP_B, originalFilename: "copy.pdf" });
    const index = indexContextFiles([first, sameIdOtherStep, file()]);

    expect(index.get(contextFileKey(STEP_A, FILE_1))).toBe(first);
    expect(index.get(contextFileKey(STEP_B, FILE_1))).toBe(sameIdOtherStep);
    expect(index.get(FILE_1)).toBe(first);
  });

  it("prefers the step-scoped record", () => {
    const index = indexContextFiles([
      file(),
      file({ stepId: STEP_B, originalFilename: "step-b.pdf" }),
    ]);
    const meta = resolveContextFileMeta(index, STEP_B, { fileObjectId: FILE_1 });
    expect(meta.filename).toBe("step-b.pdf");
  });

  it("falls back to the id-only record from another step", () => {
    const index = indexContextFiles([file({ stepId: STEP_B, mimeType: "image/png" })]);
    const meta = resolveContextFileMeta(index, STEP_A, { fileObjectId: FILE_1 });
    expect(meta).toEqual({
      fileObjectId: FILE_1,
      filename: "cv.pdf",
      sizeBytes: 2048,
      mimeType: "image/png",
      isKnown: true,
    });
  });

  it("falls back to the answer value when the server has no metadata", () => {
    const index = indexContextFiles([]);
    const meta = resolveContextFileMeta(index, STEP_A, {
      fileObjectId: FILE_2,
      originalFilename: "photo.svg",
      sizeBytes: 10,
    });
    expect(meta).toEqual({
      fileObjectId: FILE_2,
      filename: "photo.svg",
      sizeBytes: 10,
      mimeType: null,
      isKnown: false,
    });
    expect(getPreviewKind(meta.mimeType)).toBeNull();
  });

  it("uses a placeholder name when nothing is known", () => {
    const meta = resolveContextFileMeta(new Map(), STEP_A, { fileObjectId: FILE_2 });
    expect(meta.filename).toBe(`file-${FILE_2}`);
    expect(meta.sizeBytes).toBeNull();
  });

  it("skips malformed entries and handles missing input", () => {
    expect(indexContextFiles(undefined).size).toBe(0);
    expect(
      indexContextFiles([null as unknown as ReviewContextFile, file()]).size,
    ).toBe(2);
  });
});

describe("signed URL cache helpers", () => {
  const now = Date.parse("2026-05-01T10:00:00Z");

  it("isSignedUrlFresh honours the default 60s skew", () => {
    expect(SIGNED_URL_EXPIRY_SKEW_MS).toBe(60_000);
    expect(isSignedUrlFresh(new Date(now + 3600_000).toISOString(), now)).toBe(true);
    expect(isSignedUrlFresh(now + 61_000, now)).toBe(true);
    expect(isSignedUrlFresh(now + 60_000, now)).toBe(false);
    expect(isSignedUrlFresh(now + 30_000, now)).toBe(false);
    expect(isSignedUrlFresh(now - 1, now)).toBe(false);
  });

  it("accepts a custom skew and Date values", () => {
    expect(isSignedUrlFresh(new Date(now + 5_000), now, 1_000)).toBe(true);
    expect(isSignedUrlFresh(new Date(now + 5_000), now, 10_000)).toBe(false);
  });

  it("treats missing or invalid expiry as stale", () => {
    expect(isSignedUrlFresh(null, now)).toBe(false);
    expect(isSignedUrlFresh(undefined, now)).toBe(false);
    expect(isSignedUrlFresh("", now)).toBe(false);
    expect(isSignedUrlFresh("not a date", now)).toBe(false);
  });

  it("getFreshSignedUrl returns fresh entries and evicts stale ones", () => {
    const cache = new Map<string, SignedUrlEntry>();
    const freshKey = signedUrlCacheKey("event", FILE_1);
    const staleKey = signedUrlCacheKey("event", FILE_2);
    cache.set(freshKey, { url: "https://s/fresh", expiresAt: now + 600_000 });
    cache.set(staleKey, { url: "https://s/stale", expiresAt: now + 10_000 });

    expect(getFreshSignedUrl(cache, freshKey, now)).toBe("https://s/fresh");
    expect(getFreshSignedUrl(cache, staleKey, now)).toBeNull();
    expect(cache.has(staleKey)).toBe(false);
    expect(getFreshSignedUrl(cache, "missing", now)).toBeNull();
  });

  it("scopes cache keys by event", () => {
    expect(signedUrlCacheKey("e1", FILE_1)).not.toBe(signedUrlCacheKey("e2", FILE_1));
  });

  it("parseSignedUrlResponse reads the unwrapped and wrapped shapes", () => {
    expect(
      parseSignedUrlResponse({ url: "https://s/a", expiresAt: "2026-05-01T11:00:00.000Z" }),
    ).toEqual({ url: "https://s/a", expiresAt: "2026-05-01T11:00:00.000Z" });
    expect(
      parseSignedUrlResponse({ data: { url: "https://s/b", expiresAt: 123 } }),
    ).toEqual({ url: "https://s/b", expiresAt: 123 });
  });

  it("parseSignedUrlResponse rejects responses without a URL", () => {
    expect(parseSignedUrlResponse(null)).toBeNull();
    expect(parseSignedUrlResponse({})).toBeNull();
    expect(parseSignedUrlResponse({ url: "" })).toBeNull();
    expect(parseSignedUrlResponse({ url: "https://s/c" })).toEqual({
      url: "https://s/c",
      expiresAt: "",
    });
  });
});

describe("formatTimeAgo", () => {
  const now = Date.parse("2026-05-20T12:00:00Z");

  it("formats recent timestamps relative to now", () => {
    expect(formatTimeAgo("2026-05-20T11:59:30Z", now)).toBe("just now");
    expect(formatTimeAgo("2026-05-20T11:55:00Z", now)).toBe("5m ago");
    expect(formatTimeAgo("2026-05-20T09:00:00Z", now)).toBe("3h ago");
    expect(formatTimeAgo("2026-05-18T12:00:00Z", now)).toBe("2d ago");
  });

  it("treats future timestamps as just now", () => {
    expect(formatTimeAgo("2026-05-20T12:05:00Z", now)).toBe("just now");
  });

  it("switches to a date after a week", () => {
    expect(formatTimeAgo("2026-05-01T12:00:00Z", now)).toMatch(/2026/);
    expect(formatTimeAgo("2026-05-01T12:00:00Z", now)).not.toMatch(/ago/);
  });

  it("returns an empty string for invalid input", () => {
    expect(formatTimeAgo(null, now)).toBe("");
    expect(formatTimeAgo("nope", now)).toBe("");
  });
});

describe("getNoteAuthorLabel", () => {
  it("falls back to Legacy note for lines without an author", () => {
    expect(getNoteAuthorLabel({ authorName: "Ada Lovelace" })).toBe("Ada Lovelace");
    expect(getNoteAuthorLabel({ authorName: null })).toBe(LEGACY_NOTE_AUTHOR);
    expect(getNoteAuthorLabel({ authorName: "  " })).toBe(LEGACY_NOTE_AUTHOR);
  });
});
