import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import {
  FileVerificationStatus,
  Permission,
  ReviewOutcome,
} from '@event-platform/shared';
import { ReviewsService } from './reviews.service';
import { FilesService } from './files.service';
import { FormsService } from '../workflow/forms.service';

describe('ReviewsService getNeedsInfo access', () => {
  const EVENT_ID = 'event-1';
  const APPLICATION_ID = 'app-1';

  function createService(options: { permissions: string[]; actorId: string }) {
    const prisma = {
      applications: {
        findFirst: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ id: APPLICATION_ID, applicant_user_id: 'owner' }),
      },
      needs_info_requests: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      },
    };
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'permissions') return options.permissions;
        if (key === 'actorId') return options.actorId;
        return undefined;
      }),
    };
    const service = new ReviewsService(
      prisma as any,
      cls as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  }

  it('allows staff with read_full', async () => {
    const { service, prisma } = createService({
      permissions: [
        Permission.EVENT_APPLICATION_READ_BASIC,
        Permission.EVENT_APPLICATION_READ_FULL,
      ],
      actorId: 'reviewer',
    });

    await expect(service.getNeedsInfo(EVENT_ID, APPLICATION_ID)).resolves.toEqual(
      [],
    );
    expect(prisma.needs_info_requests.findMany).toHaveBeenCalledTimes(1);
  });

  it('allows the applicant who owns the application', async () => {
    const { service } = createService({
      permissions: [Permission.SELF_APPLICATION_READ],
      actorId: 'owner',
    });

    await expect(service.getNeedsInfo(EVENT_ID, APPLICATION_ID)).resolves.toEqual(
      [],
    );
  });

  it('rejects an applicant reading someone else application', async () => {
    const { service } = createService({
      permissions: [Permission.SELF_APPLICATION_READ],
      actorId: 'someone-else',
    });

    await expect(
      service.getNeedsInfo(EVENT_ID, APPLICATION_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ReviewsService approve gate', () => {
  const EVENT_ID = 'event-1';
  const APPLICATION_ID = 'app-1';
  const STEP_ID = 'step-1';
  const VERSION_ID = 'version-1';
  const FILE_ORIGINAL = '11111111-1111-4111-8111-111111111111';
  const FILE_REPLACEMENT = '22222222-2222-4222-8222-222222222222';

  const SCHEMA = {
    sections: [
      {
        id: 'sec-1',
        title: 'Documents',
        fields: [
          {
            id: 'f-resume',
            key: 'resume',
            type: 'file_upload',
            label: 'Resume',
            validation: { required: true },
          },
          {
            id: 'f-portfolio',
            key: 'portfolio',
            type: 'file_upload',
            label: 'Portfolio',
          },
          { id: 'f-name', key: 'name', type: 'text', label: 'Name' },
        ],
      },
    ],
  };

  type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
  const asyncMock = (value?: unknown): AsyncMock =>
    jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(value);

  function createService(params: {
    answersSnapshot: unknown;
    patches?: unknown[][];
    verified?: Array<{ fieldId: string; fileObjectId: string }>;
  }) {
    const version = {
      id: VERSION_ID,
      application_id: APPLICATION_ID,
      step_id: STEP_ID,
      form_version_id: 'form-version-1',
      version_number: 1,
      answers_snapshot: params.answersSnapshot,
    };
    const prisma = {
      applications: { findFirst: asyncMock({ id: APPLICATION_ID }) },
      workflow_steps: {
        findFirst: asyncMock({
          id: STEP_ID,
          category: 'APPLICATION',
          reject_behavior: 'RESUBMIT_ALLOWED',
          revision_deadline_at: null,
        }),
      },
      step_submission_versions: { findFirst: asyncMock(version) },
      review_records: {
        findFirst: asyncMock(null),
        create: jest
          .fn<(...args: any[]) => Promise<any>>()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ ...data, created_at: new Date() }),
          ),
      },
      admin_change_patches: {
        findMany: asyncMock(
          (params.patches ?? []).map((ops) => ({
            submission_version_id: VERSION_ID,
            ops,
          })),
        ),
      },
      form_versions: { findUnique: asyncMock({ schema: SCHEMA }) },
      field_verifications: {
        findMany: asyncMock(
          (params.verified ?? []).map((ref, index) => ({
            id: `verification-${index}`,
            submission_version_id: VERSION_ID,
            field_id: ref.fieldId,
            file_object_id: ref.fileObjectId,
            status: FileVerificationStatus.VERIFIED,
          })),
        ),
      },
      needs_info_requests: { updateMany: asyncMock({ count: 0 }) },
    };
    const cls = { get: jest.fn(() => 'reviewer-1') };
    const stepStateService = { markApproved: asyncMock(undefined) };
    const reviewerAssignmentService = {
      assertQueueAccessForReview: asyncMock(undefined),
      markQueueItemCompleted: asyncMock(undefined),
    };
    const filesService = new FilesService(prisma as any, cls as any, {} as any);
    const formsService = new FormsService(prisma as any, cls as any);
    const getRequiredFileGate = jest.spyOn(formsService, 'getRequiredFileGate');
    const service = new ReviewsService(
      prisma as any,
      cls as any,
      stepStateService as any,
      {} as any,
      filesService,
      formsService,
      reviewerAssignmentService as any,
    );
    return { service, prisma, stepStateService, getRequiredFileGate };
  }

  function approve(service: ReviewsService) {
    return service.createReview(EVENT_ID, APPLICATION_ID, STEP_ID, VERSION_ID, {
      outcome: ReviewOutcome.APPROVE,
    } as any);
  }

  const replacePatch = [
    [
      {
        op: 'replace',
        path: '/resume',
        value: { fileObjectId: FILE_REPLACEMENT, originalFilename: 'new.pdf' },
      },
    ],
  ];

  it('approves when the staff replacement file is verified', async () => {
    const { service, stepStateService, getRequiredFileGate } = createService({
      answersSnapshot: { resume: { fileObjectId: FILE_ORIGINAL } },
      patches: replacePatch,
      verified: [{ fieldId: 'resume', fileObjectId: FILE_REPLACEMENT }],
    });

    await expect(approve(service)).resolves.toMatchObject({
      outcome: ReviewOutcome.APPROVE,
    });
    expect(stepStateService.markApproved).toHaveBeenCalledWith(
      APPLICATION_ID,
      STEP_ID,
    );
    // The gate reads the EFFECTIVE answers, with the normalized original.
    expect(getRequiredFileGate).toHaveBeenCalledWith(
      'form-version-1',
      {
        resume: { fileObjectId: FILE_REPLACEMENT, originalFilename: 'new.pdf' },
      },
      { resume: { fileObjectId: FILE_ORIGINAL } },
    );
  });

  const REVIEWED_AT = new Date('2026-10-20T10:00:00.000Z');

  it('allows a new review when staff put the reviewed step back to "Submitted"', async () => {
    const { service, prisma, stepStateService } = createService({
      answersSnapshot: { resume: { fileObjectId: FILE_ORIGINAL } },
      patches: replacePatch,
      verified: [{ fieldId: 'resume', fileObjectId: FILE_REPLACEMENT }],
    });
    prisma.review_records.findFirst.mockResolvedValue({
      id: 'earlier-review',
      created_at: REVIEWED_AT,
    });
    (prisma as any).application_step_states = {
      findFirst: asyncMock({
        status: 'SUBMITTED',
        last_activity_at: new Date('2026-10-21T09:00:00.000Z'),
      }),
    };

    await expect(approve(service)).resolves.toMatchObject({
      outcome: ReviewOutcome.APPROVE,
    });
    expect(stepStateService.markApproved).toHaveBeenCalledWith(
      APPLICATION_ID,
      STEP_ID,
    );
  });

  it.each([
    ['the step is no longer awaiting review', 'APPROVED', '2026-10-21T09:00:00.000Z'],
    // A double-submitted review: the step is still SUBMITTED, but has not
    // changed since the first review was recorded.
    ['the step was not reopened since that review', 'SUBMITTED', '2026-10-19T08:00:00.000Z'],
  ])('refuses a second review when %s', async (_label, status, lastActivity) => {
    const { service, prisma } = createService({
      answersSnapshot: { resume: { fileObjectId: FILE_ORIGINAL } },
      patches: replacePatch,
      verified: [{ fieldId: 'resume', fileObjectId: FILE_REPLACEMENT }],
    });
    prisma.review_records.findFirst.mockResolvedValue({
      id: 'earlier-review',
      created_at: REVIEWED_AT,
    });
    (prisma as any).application_step_states = {
      findFirst: asyncMock({ status, last_activity_at: new Date(lastActivity) }),
    };

    await expect(approve(service)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REVIEW_ALREADY_COMPLETED' }),
    });
    expect(prisma.review_records.create).not.toHaveBeenCalled();
  });

  it('refuses approval when only the replaced original file was verified', async () => {
    const { service, prisma, stepStateService } = createService({
      answersSnapshot: { resume: { fileObjectId: FILE_ORIGINAL } },
      patches: replacePatch,
      verified: [{ fieldId: 'resume', fileObjectId: FILE_ORIGINAL }],
    });

    await expect(approve(service)).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        code: 'REQUIRED_FILES_NOT_VERIFIED',
        message: expect.stringContaining('must be verified'),
      }),
    });
    expect(prisma.review_records.create).not.toHaveBeenCalled();
    expect(stepStateService.markApproved).not.toHaveBeenCalled();
  });

  it('enforces required files stored under a legacy { data } snapshot', async () => {
    const unverified = createService({
      answersSnapshot: { data: { resume: { fileObjectId: FILE_ORIGINAL } } },
    });
    await expect(approve(unverified.service)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const verified = createService({
      answersSnapshot: { data: { resume: { fileObjectId: FILE_ORIGINAL } } },
      verified: [{ fieldId: 'resume', fileObjectId: FILE_ORIGINAL }],
    });
    await expect(approve(verified.service)).resolves.toMatchObject({
      outcome: ReviewOutcome.APPROVE,
    });
  });

  it('enforces a required file added by staff to an empty field', async () => {
    const { service } = createService({
      answersSnapshot: { name: 'Ada' },
      patches: [
        [{ op: 'add', path: '/resume', value: { fileObjectId: FILE_REPLACEMENT } }],
      ],
    });

    await expect(approve(service)).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code: 'REQUIRED_FILES_NOT_VERIFIED' }),
    });
  });

  it('refuses approval when staff removed a required file, naming the field', async () => {
    const { service, prisma, stepStateService } = createService({
      answersSnapshot: { resume: { fileObjectId: FILE_ORIGINAL } },
      patches: [[{ op: 'remove', path: '/resume' }]],
      // A verification of the removed file must not unlock approval.
      verified: [{ fieldId: 'resume', fileObjectId: FILE_ORIGINAL }],
    });

    const error = await approve(service).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      code: 'REQUIRED_FILE_REMOVED_BY_STAFF',
      message:
        'Required file removed by staff — upload a replacement before approving: Resume (resume).',
      fieldKeys: ['resume'],
    });
    expect(prisma.field_verifications.findMany).not.toHaveBeenCalled();
    expect(prisma.review_records.create).not.toHaveBeenCalled();
    expect(stepStateService.markApproved).not.toHaveBeenCalled();
  });

  it('treats a replace with an empty value like a removal', async () => {
    const { service } = createService({
      answersSnapshot: { resume: [{ fileObjectId: FILE_ORIGINAL }] },
      patches: [[{ op: 'replace', path: '/resume', value: [] }]],
    });

    await expect(approve(service)).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        code: 'REQUIRED_FILE_REMOVED_BY_STAFF',
        fieldKeys: ['resume'],
      }),
    });
  });

  it('allows approval when an optional file was removed by staff', async () => {
    const { service } = createService({
      answersSnapshot: {
        resume: { fileObjectId: FILE_ORIGINAL },
        portfolio: { fileObjectId: FILE_REPLACEMENT },
      },
      patches: [[{ op: 'remove', path: '/portfolio' }]],
      verified: [{ fieldId: 'resume', fileObjectId: FILE_ORIGINAL }],
    });

    await expect(approve(service)).resolves.toMatchObject({
      outcome: ReviewOutcome.APPROVE,
    });
  });

  it('allows approval when a required file field was already empty when submitted', async () => {
    const { service } = createService({ answersSnapshot: { name: 'Ada' } });

    await expect(approve(service)).resolves.toMatchObject({
      outcome: ReviewOutcome.APPROVE,
    });
  });

  it('does not run the file gate for reject outcomes', async () => {
    const { service, getRequiredFileGate } = createService({
      answersSnapshot: { resume: { fileObjectId: FILE_ORIGINAL } },
      patches: [[{ op: 'remove', path: '/resume' }]],
    });
    const stepStateService = (service as any).stepStateService;
    stepStateService.markNeedsRevision = asyncMock(undefined);

    await expect(
      service.createReview(EVENT_ID, APPLICATION_ID, STEP_ID, VERSION_ID, {
        outcome: ReviewOutcome.REJECT,
      } as any),
    ).resolves.toMatchObject({ outcome: ReviewOutcome.REJECT });
    expect(getRequiredFileGate).not.toHaveBeenCalled();
  });
});
