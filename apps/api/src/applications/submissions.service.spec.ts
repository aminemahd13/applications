import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { StepStatus } from '@event-platform/shared';
import {
  ConditionMode,
  ConditionOperator,
  FieldType,
  FormDefinition,
} from '@event-platform/schemas';

function buildFormDefinition(): FormDefinition {
  return {
    sections: [
      {
        id: 'section-1',
        title: 'Experience',
        fields: [
          {
            id: 'field-root',
            key: 'previously_participated_to_MM',
            type: FieldType.SELECT,
            label: 'Previously participated',
          },
          {
            id: 'field-year',
            key: 'previous_participation_year',
            type: FieldType.TEXT,
            label: 'Participation year',
            logic: {
              showWhen: {
                mode: ConditionMode.ALL,
                rules: [
                  {
                    fieldKey: 'previously_participated_to_MM',
                    operator: ConditionOperator.EQ,
                    value: 'yes',
                  },
                ],
              },
            },
          },
          {
            id: 'field-details',
            key: 'previous_participation_details',
            type: FieldType.TEXTAREA,
            label: 'Participation details',
            logic: {
              showWhen: {
                mode: ConditionMode.ALL,
                rules: [
                  {
                    fieldKey: 'previous_participation_year',
                    operator: ConditionOperator.EXISTS,
                  },
                ],
              },
            },
          },
          {
            id: 'field-unrelated',
            key: 'favorite_color',
            type: FieldType.TEXT,
            label: 'Favorite color',
          },
        ],
      },
    ],
  };
}

describe('SubmissionsService targeted needs-info gating', () => {
  function createService() {
    const prisma = {
      needs_info_requests: {
        findMany: jest.fn(),
      },
      step_submission_versions: {
        findFirst: jest.fn(),
      },
    };

    const service = new SubmissionsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, prisma };
  }

  it('allows changes to conditional child fields of targeted fields', async () => {
    const { service, prisma } = createService();

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: ['previously_participated_to_MM'] },
    ]);
    prisma.step_submission_versions.findFirst.mockResolvedValue({
      answers_snapshot: {
        previously_participated_to_MM: 'no',
        previous_participation_year: '',
        previous_participation_details: '',
      },
    });

    await expect(
      (service as any).ensureNeedsInfoTargetFieldEditsAllowed(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        {
          previously_participated_to_MM: 'yes',
          previous_participation_year: '2024',
          previous_participation_details: 'Participated in edition 2024',
        },
        buildFormDefinition(),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects unrelated field edits even when target field and cascade fields are changed', async () => {
    const { service, prisma } = createService();

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: ['previously_participated_to_MM'] },
    ]);
    prisma.step_submission_versions.findFirst.mockResolvedValue({
      answers_snapshot: {
        previously_participated_to_MM: 'no',
        previous_participation_year: '',
        previous_participation_details: '',
        favorite_color: 'red',
      },
    });

    await expect(
      (service as any).ensureNeedsInfoTargetFieldEditsAllowed(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        {
          previously_participated_to_MM: 'yes',
          previous_participation_year: '2024',
          previous_participation_details: 'Participated in edition 2024',
          favorite_color: 'blue',
        },
        buildFormDefinition(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('supports target field ids stored as field.id aliases', async () => {
    const { service, prisma } = createService();

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: ['field-root'] },
    ]);
    prisma.step_submission_versions.findFirst.mockResolvedValue({
      answers_snapshot: {
        previously_participated_to_MM: 'no',
      },
    });

    await expect(
      (service as any).ensureNeedsInfoTargetFieldEditsAllowed(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        {
          previously_participated_to_MM: 'yes',
        },
        buildFormDefinition(),
      ),
    ).resolves.toBeUndefined();
  });

  it('merges with previous answers for targeted needs-info revisions', async () => {
    const { service, prisma } = createService();

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: ['previously_participated_to_MM'] },
    ]);
    prisma.step_submission_versions.findFirst.mockResolvedValue({
      answers_snapshot: {
        previously_participated_to_MM: 'no',
        previous_participation_year: '2022',
        favorite_color: 'red',
      },
    });

    await expect(
      (service as any).mergeAnswersWithPreviousWhenTargetedNeedsInfo(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        {
          previously_participated_to_MM: 'yes',
          previous_participation_year: undefined,
        },
      ),
    ).resolves.toEqual({
      previously_participated_to_MM: 'yes',
      previous_participation_year: '2022',
      favorite_color: 'red',
    });
  });

  it('does not merge with previous answers when requests are not targeted', async () => {
    const { service, prisma } = createService();
    const submittedAnswers = {
      previously_participated_to_MM: 'yes',
    };

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: [] },
    ]);

    await expect(
      (service as any).mergeAnswersWithPreviousWhenTargetedNeedsInfo(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        submittedAnswers,
      ),
    ).resolves.toEqual(submittedAnswers);
    expect(prisma.step_submission_versions.findFirst).not.toHaveBeenCalled();
  });
});

describe('SubmissionsService applicant modification scope behavior', () => {
  function createSaveDraftHarness(params: {
    stepStatus: string;
    allowApplicantModification: boolean;
    modificationScope: 'SUBMITTED_ONLY' | 'SUBMITTED_OR_APPROVED';
  }) {
    const prisma = {
      workflow_steps: {
        findUnique: jest.fn().mockResolvedValue({
          category: 'APPLICATION',
          form_version_id: 'form-1',
          allow_applicant_modification: params.allowApplicantModification,
          modification_scope: params.modificationScope,
        }),
      },
      step_drafts: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'draft-1' }),
      },
      application_step_states: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const stepStateService = {
      getStepState: jest.fn().mockResolvedValue({
        stepId: 'step-1',
        status: params.stepStatus,
        currentDraftId: null,
      }),
    };

    const service = new SubmissionsService(
      prisma as any,
      {} as any,
      stepStateService as any,
      {} as any,
      {} as any,
    );

    return { service, prisma };
  }

  it('denies submitted draft edits when modification toggle is disabled', async () => {
    const { service } = createSaveDraftHarness({
      stepStatus: StepStatus.SUBMITTED,
      allowApplicantModification: false,
      modificationScope: 'SUBMITTED_ONLY',
    });

    await expect(
      service.saveDraft('app-1', 'step-1', { answers: { field: 'value' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows submitted draft edits when scope includes submitted', async () => {
    const { service, prisma } = createSaveDraftHarness({
      stepStatus: StepStatus.SUBMITTED,
      allowApplicantModification: true,
      modificationScope: 'SUBMITTED_ONLY',
    });

    await expect(
      service.saveDraft('app-1', 'step-1', { answers: { field: 'value' } }),
    ).resolves.toEqual({ draftId: 'draft-1' });
    expect(prisma.step_drafts.create).toHaveBeenCalledTimes(1);
  });

  it('denies approved draft edits when scope is submitted only', async () => {
    const { service } = createSaveDraftHarness({
      stepStatus: StepStatus.APPROVED,
      allowApplicantModification: true,
      modificationScope: 'SUBMITTED_ONLY',
    });

    await expect(
      service.saveDraft('app-1', 'step-1', { answers: { field: 'value' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows approved draft edits when scope includes approved', async () => {
    const { service, prisma } = createSaveDraftHarness({
      stepStatus: StepStatus.APPROVED,
      allowApplicantModification: true,
      modificationScope: 'SUBMITTED_OR_APPROVED',
    });

    await expect(
      service.saveDraft('app-1', 'step-1', { answers: { field: 'value' } }),
    ).resolves.toEqual({ draftId: 'draft-1' });
    expect(prisma.step_drafts.create).toHaveBeenCalledTimes(1);
  });

  function createSubmitHarness(params: { reviewRequired: boolean }) {
    const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      step_submission_versions: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'submission-1',
          application_id: 'app-1',
          step_id: 'step-1',
          form_version_id: 'form-1',
          version_number: 1,
          answers_snapshot: { field: 'value' },
          submitted_at: new Date('2026-01-01T10:00:00.000Z'),
          submitted_by: 'user-1',
        }),
      },
      application_step_states: {
        updateMany: updateManyMock,
      },
    };

    const prisma = {
      applications: {
        findUnique: jest.fn().mockResolvedValue({
          event_id: 'event-1',
          applicant_user_id: 'user-1',
        }),
      },
      workflow_steps: {
        findFirst: jest.fn().mockResolvedValue({
          category: 'APPLICATION',
          deadline_at: null,
          form_version_id: 'form-1',
          review_required: params.reviewRequired,
          allow_applicant_modification: true,
          modification_scope: 'SUBMITTED_OR_APPROVED',
        }),
      },
      form_versions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'form-1',
          schema: undefined,
        }),
      },
      needs_info_requests: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      step_submission_versions: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const cls = {
      get: jest.fn((key: string) => (key === 'actorId' ? 'user-1' : undefined)),
    };

    const stepStateService = {
      getStepState: jest.fn().mockResolvedValue({
        stepId: 'step-1',
        status: StepStatus.APPROVED,
        currentDraftId: null,
      }),
      recomputeAllStepStates: jest.fn().mockResolvedValue(undefined),
    };

    const filesService = {
      validateAndCommit: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SubmissionsService(
      prisma as any,
      cls as any,
      stepStateService as any,
      filesService as any,
      {} as any,
    );

    return { service, updateManyMock };
  }

  it('reverts approved step back to submitted on resubmit when review is required', async () => {
    const { service, updateManyMock } = createSubmitHarness({
      reviewRequired: true,
    });

    await service.submit('event-1', 'app-1', 'step-1', {
      answers: { field: 'value' },
    });

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StepStatus.SUBMITTED,
        }),
      }),
    );
  });

  it('keeps approved step approved on resubmit when review is not required', async () => {
    const { service, updateManyMock } = createSubmitHarness({
      reviewRequired: false,
    });

    await service.submit('event-1', 'app-1', 'step-1', {
      answers: { field: 'value' },
    });

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StepStatus.APPROVED,
        }),
      }),
    );
  });
});

describe('SubmissionsService staff draft save with best-effort submit', () => {
  function createStaffDraftHarness(params?: {
    state?: {
      status: string;
      currentDraftId: string | null;
      latestSubmissionVersionId: string | null;
    };
    formSchema?: FormDefinition | undefined;
    transactionError?: Error | null;
  }) {
    const stepState =
      params?.state ?? {
        status: StepStatus.UNLOCKED,
        currentDraftId: null,
        latestSubmissionVersionId: null,
      };

    const tx = {
      step_submission_versions: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'submission-1',
          application_id: 'app-1',
          step_id: 'step-1',
          form_version_id: 'form-1',
          version_number: 1,
          answers_snapshot: { field: 'value' },
          submitted_at: new Date('2026-01-01T10:00:00.000Z'),
          submitted_by: 'staff-1',
        }),
      },
      application_step_states: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const prisma = {
      applications: {
        findFirst: jest.fn().mockResolvedValue({ id: 'app-1' }),
        findUnique: jest.fn().mockResolvedValue({
          event_id: 'event-1',
          applicant_user_id: 'applicant-1',
        }),
      },
      workflow_steps: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'step-1',
          category: 'APPLICATION',
          deadline_at: null,
          form_version_id: 'form-1',
          review_required: true,
          allow_applicant_modification: false,
          modification_scope: 'SUBMITTED_ONLY',
        }),
      },
      step_drafts: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'draft-1' }),
        update: jest.fn(),
      },
      application_step_states: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      form_versions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'form-1',
          schema: params?.formSchema,
        }),
      },
      needs_info_requests: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (params?.transactionError) {
          throw params.transactionError;
        }
        return cb(tx);
      }),
    };

    const cls = {
      get: jest.fn((key: string) =>
        key === 'actorId' ? 'staff-1' : undefined,
      ),
    };

    const stepStateService = {
      getStepState: jest.fn().mockResolvedValue(stepState),
      recomputeAllStepStates: jest.fn().mockResolvedValue(undefined),
    };

    const filesService = {
      validateAndCommit: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SubmissionsService(
      prisma as any,
      cls as any,
      stepStateService as any,
      filesService as any,
      {} as any,
    );

    return { service, prisma, tx, stepStateService };
  }

  it('returns SUBMITTED for draft-only step when auto-submit succeeds', async () => {
    const { service, tx } = createStaffDraftHarness({
      formSchema: undefined,
    });

    const result = await service.saveDraftAsStaff('event-1', 'app-1', 'step-1', {
      answers: { field: 'value' },
    });

    expect(result.mode).toBe('SUBMITTED');
    expect(result.draftId).toBe('draft-1');
    expect(result.submission?.submittedBy).toBe('staff-1');
    expect(tx.step_submission_versions.create).toHaveBeenCalledTimes(1);
  });

  it('returns DRAFT_SAVED when auto-submit fails validation', async () => {
    const { service, prisma, tx } = createStaffDraftHarness({
      formSchema: {
        sections: [
          {
            id: 'sec-1',
            title: 'Info',
            fields: [
              {
                id: 'info-1',
                key: 'info_1',
                type: FieldType.INFO_TEXT,
                label: 'Read this',
              },
            ],
          },
        ],
      },
    });

    const result = await service.saveDraftAsStaff('event-1', 'app-1', 'step-1', {
      answers: { field: 'value' },
    });

    expect(result).toEqual({ mode: 'DRAFT_SAVED', draftId: 'draft-1' });
    expect(tx.step_submission_versions.create).not.toHaveBeenCalled();
    expect(prisma.step_drafts.create).toHaveBeenCalledTimes(1);
  });

  it('returns DRAFT_SAVED without auto-submit when latest submission exists', async () => {
    const { service, prisma } = createStaffDraftHarness({
      state: {
        status: StepStatus.SUBMITTED,
        currentDraftId: null,
        latestSubmissionVersionId: 'submission-existing',
      },
    });

    const result = await service.saveDraftAsStaff('event-1', 'app-1', 'step-1', {
      answers: { field: 'value' },
    });

    expect(result).toEqual({ mode: 'DRAFT_SAVED', draftId: 'draft-1' });
    expect(prisma.applications.findUnique).not.toHaveBeenCalled();
  });

  it('rethrows unexpected submit errors after draft save', async () => {
    const { service, prisma } = createStaffDraftHarness({
      transactionError: new Error('db failure'),
    });

    await expect(
      service.saveDraftAsStaff('event-1', 'app-1', 'step-1', {
        answers: { field: 'value' },
      }),
    ).rejects.toThrow('db failure');
    expect(prisma.step_drafts.create).toHaveBeenCalledTimes(1);
  });
});
