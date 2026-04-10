import { CreateWorkflowStepSchema } from '@event-platform/shared';

describe('Workflow step DTO schema', () => {
  it('applies defaults for revision and applicant modification settings', () => {
    const parsed = CreateWorkflowStepSchema.parse({
      title: 'Profile',
    });

    expect(parsed.allowNextStepsWhileRevising).toBe(true);
    expect(parsed.revisionDeadlineAt).toBeUndefined();
    expect(parsed.allowApplicantModification).toBe(false);
    expect(parsed.modificationScope).toBe('SUBMITTED_ONLY');
  });

  it('rejects invalid modification scope values', () => {
    expect(() =>
      CreateWorkflowStepSchema.parse({
        title: 'Profile',
        modificationScope: 'APPROVED_ONLY',
      }),
    ).toThrow();
  });
});
