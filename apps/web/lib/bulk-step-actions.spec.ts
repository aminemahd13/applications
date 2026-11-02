import { BULK_STEP_ACTIONS } from "@event-platform/shared";
import {
  BULK_STEP_ACTION_OPTIONS,
  addBulkStepActionChunk,
  allowedBulkStepActions,
  bulkStepActionWarning,
  emptyBulkStepActionSummary,
  groupBulkOutcomes,
  revisionDeadlineToIso,
} from "./bulk-step-actions";

describe("bulk step action options", () => {
  it("offers every action the API accepts, exactly once", () => {
    expect(BULK_STEP_ACTION_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...BULK_STEP_ACTIONS].sort(),
    );
  });

  it("gives reviewers approve only, override holders open/lock, and organizers everything", () => {
    expect(
      allowedBulkStepActions({ canReview: false, canOverride: true }).map((o) => o.value),
    ).toEqual(["UNLOCK", "LOCK"]);
    expect(
      allowedBulkStepActions({ canReview: true, canOverride: false }).map((o) => o.value),
    ).toEqual(["APPROVE"]);
    expect(allowedBulkStepActions({ canReview: true, canOverride: true })).toHaveLength(8);
    expect(allowedBulkStepActions({ canReview: false, canOverride: false })).toEqual([]);
  });
});

describe("addBulkStepActionChunk", () => {
  it("sums counts and collects details across chunks", () => {
    const summary = emptyBulkStepActionSummary();
    addBulkStepActionChunk(summary, {
      data: {
        updated: 2,
        skipped: 1,
        skippedDetails: [{ applicationId: "a", reason: "Already approved" }],
        notes: [{ applicationId: "b", note: "Attendance kept" }],
      },
    });
    addBulkStepActionChunk(summary, {
      data: { updated: 1, skipped: 1, skippedDetails: [{ applicationId: "c", reason: "Already approved" }] },
    });

    expect(summary).toEqual({
      updated: 3,
      skipped: 2,
      skippedDetails: [
        { applicationId: "a", reason: "Already approved" },
        { applicationId: "c", reason: "Already approved" },
      ],
      notes: [{ applicationId: "b", note: "Attendance kept" }],
    });
  });

  it("tolerates an older API result without details, and junk", () => {
    const summary = emptyBulkStepActionSummary();
    addBulkStepActionChunk(summary, { data: { updated: 1, skipped: 0 } });
    addBulkStepActionChunk(summary, null);
    addBulkStepActionChunk(summary, { data: { skippedDetails: [{ reason: "no id" }, null] } });
    expect(summary).toEqual({ updated: 1, skipped: 0, skippedDetails: [], notes: [] });
  });
});

describe("groupBulkOutcomes", () => {
  it("groups by message, largest group first", () => {
    expect(
      groupBulkOutcomes([
        { applicationId: "a", message: "Nothing submitted yet" },
        { applicationId: "b", message: "Already approved" },
        { applicationId: "c", message: "Already approved" },
      ]),
    ).toEqual([
      { message: "Already approved", applicationIds: ["b", "c"] },
      { message: "Nothing submitted yet", applicationIds: ["a"] },
    ]);
  });
});

describe("revisionDeadlineToIso", () => {
  it("reads the input as local time", () => {
    expect(revisionDeadlineToIso("2026-12-01T23:59")).toBe(
      new Date(2026, 11, 1, 23, 59).toISOString(),
    );
  });

  it("returns undefined for empty or invalid values", () => {
    expect(revisionDeadlineToIso("")).toBeUndefined();
    expect(revisionDeadlineToIso("not a date")).toBeUndefined();
  });
});

describe("bulkStepActionWarning", () => {
  const application = { id: "s1", stepIndex: 0, category: "APPLICATION", reviewRequired: true };
  const confirmation = { id: "s2", stepIndex: 1, category: "CONFIRMATION", reviewRequired: false };
  const feedback = { id: "s3", stepIndex: 2, category: "APPLICATION", reviewRequired: false };
  const steps = [application, confirmation, feedback];

  it("explains tickets on the confirmation step", () => {
    expect(bulkStepActionWarning("APPROVE", confirmation, steps)).toMatch(/issues check-in tickets/);
    expect(bulkStepActionWarning("REJECT", confirmation, steps)).toMatch(/cancels check-in tickets/);
    for (const action of ["UNAPPROVE", "LOCK", "UNLOCK", "SUBMITTED", "REQUEST_REVISION"] as const) {
      expect(bulkStepActionWarning(action, confirmation, steps)).toMatch(/cancels their check-in ticket/);
    }
  });

  it("warns that rejecting an earlier step cancels tickets, and un-rejecting gives them back", () => {
    expect(bulkStepActionWarning("REJECT", application, steps)).toMatch(/before the attendance confirmation/);
    expect(bulkStepActionWarning("UNREJECT", application, steps)).toMatch(/new check-in ticket/);
    expect(bulkStepActionWarning("APPROVE", application, steps)).toBeNull();
  });

  it("explains steps without review", () => {
    expect(bulkStepActionWarning("SUBMITTED", feedback, steps)).toMatch(/will be skipped/);
    expect(bulkStepActionWarning("UNAPPROVE", feedback, steps)).toMatch(/open for editing/);
    expect(bulkStepActionWarning("LOCK", feedback, steps)).toBeNull();
  });

  it("has nothing to say without a step", () => {
    expect(bulkStepActionWarning("REJECT", undefined, steps)).toBeNull();
  });
});
