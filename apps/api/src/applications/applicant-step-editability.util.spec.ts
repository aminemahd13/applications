import {
  canApplicantEditStep,
  normalizeStepModificationScope,
} from './applicant-step-editability.util';

describe('applicant-step-editability util', () => {
  it('normalizes unknown scope to SUBMITTED_ONLY', () => {
    expect(normalizeStepModificationScope(undefined)).toBe('SUBMITTED_ONLY');
    expect(normalizeStepModificationScope('INVALID')).toBe('SUBMITTED_ONLY');
  });

  it('allows submitted edits only when modification is enabled', () => {
    expect(canApplicantEditStep('SUBMITTED', false, 'SUBMITTED_ONLY')).toBe(
      false,
    );
    expect(canApplicantEditStep('SUBMITTED', true, 'SUBMITTED_ONLY')).toBe(
      true,
    );
  });

  it('allows approved edits only for SUBMITTED_OR_APPROVED scope', () => {
    expect(canApplicantEditStep('APPROVED', true, 'SUBMITTED_ONLY')).toBe(
      false,
    );
    expect(
      canApplicantEditStep('APPROVED', true, 'SUBMITTED_OR_APPROVED'),
    ).toBe(true);
  });

  it('keeps unlocked and needs revision editable', () => {
    expect(canApplicantEditStep('UNLOCKED', false, 'SUBMITTED_ONLY')).toBe(
      true,
    );
    expect(canApplicantEditStep('NEEDS_REVISION', false, 'SUBMITTED_ONLY')).toBe(
      true,
    );
  });

  it('keeps locked and rejected final non-editable', () => {
    expect(canApplicantEditStep('LOCKED', true, 'SUBMITTED_OR_APPROVED')).toBe(
      false,
    );
    expect(
      canApplicantEditStep('REJECTED_FINAL', true, 'SUBMITTED_OR_APPROVED'),
    ).toBe(false);
  });
});
