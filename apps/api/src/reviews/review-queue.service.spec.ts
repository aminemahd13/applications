import { Permission, StepStatus } from '@event-platform/shared';
import { ReviewQueueService } from './review-queue.service';

function buildQueueItem(params?: {
  id?: string;
  queueMode?: 'direct' | 'shared';
  assignedReviewerId?: string | null;
  updatedAt?: string;
  stepId?: string;
  submissionVersionId?: string;
  revisionCycleCount?: number;
  hasOpenNeedsInfo?: boolean;
}) {
  const stepId = params?.stepId ?? 'step-1';
  const updatedAt = new Date(params?.updatedAt ?? '2026-03-09T10:00:00.000Z');
  const submissionVersionId = params?.submissionVersionId ?? 'version-1';
  const queueMode = params?.queueMode ?? 'shared';
  const assignedReviewerId = params?.assignedReviewerId ?? null;
  const revisionCycleCount = params?.revisionCycleCount ?? 0;

  return {
    id: params?.id ?? 'queue-1',
    updated_at: updatedAt,
    queue_mode: queueMode,
    assignment_expires_at: null,
    assigned_reviewer_id: assignedReviewerId,
    users_review_queue_items_assigned_reviewer_idTousers:
      assignedReviewerId
        ? {
            email: 'reviewer@example.com',
            applicant_profiles: { full_name: 'Reviewer Name' },
          }
        : null,
    application_id: 'app-1',
    step_id: stepId,
    submission_version_id: submissionVersionId,
    applications: {
      id: 'app-1',
      tags: ['vip'],
      users_applications_applicant_user_idTousers: {
        email: 'applicant@example.com',
        applicant_profiles: { full_name: 'Applicant Name' },
      },
      application_step_states: [
        {
          step_id: stepId,
          status: StepStatus.SUBMITTED,
          latest_submission_version_id: submissionVersionId,
          last_activity_at: updatedAt,
          revision_cycle_count: revisionCycleCount,
        },
      ],
      needs_info_requests: params?.hasOpenNeedsInfo
        ? [{ step_id: stepId }]
        : [],
    },
    workflow_steps: {
      id: stepId,
      title: 'Review Step',
      step_index: 1,
    },
    step_submission_versions: {
      id: submissionVersionId,
      form_version_id: 'form-version-1',
      answers_snapshot: { answer: 'value' },
      version_number: 2,
      submitted_at: updatedAt,
    },
  };
}

describe('ReviewQueueService', () => {
  let service: ReviewQueueService;
  let mockPrisma: any;
  let mockCls: any;
  let mockReviewerAssignmentService: any;

  beforeEach(() => {
    mockPrisma = {
      workflow_steps: {
        findMany: jest.fn().mockResolvedValue([{ id: 'step-1' }]),
      },
      review_queue_items: {
        findMany: jest.fn().mockResolvedValue([buildQueueItem()]),
        count: jest.fn(),
      },
      form_versions: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'form-version-1', schema: { fields: [] } }]),
      },
      review_queue_saved_views: {
        findMany: jest.fn(),
      },
      applications: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    mockCls = {
      get: jest.fn((key: string) => {
        if (key === 'actorId') return 'reviewer-1';
        if (key === 'permissions') return [Permission.EVENT_APPLICATION_LIST];
        if (key === 'isGlobalAdmin') return false;
        return undefined;
      }),
    };

    mockReviewerAssignmentService = {
      syncOpenQueueItemsForEvent: jest.fn().mockResolvedValue({ created: 0, completed: 0 }),
      releaseExpiredDirectAssignments: jest.fn().mockResolvedValue({ released: 0 }),
      listEligibleReviewers: jest.fn().mockResolvedValue([]),
    };

    service = new ReviewQueueService(
      mockPrisma,
      mockCls,
      mockReviewerAssignmentService,
    );
  });

  it('restricts non-organizer queue visibility to mine + shared', async () => {
    await service.getQueue('event-1', { limit: 20 } as any);

    const findManyArg = mockPrisma.review_queue_items.findMany.mock.calls[0][0];
    expect(findManyArg.where).toMatchObject({
      event_id: 'event-1',
      completed_at: null,
      OR: [
        {
          queue_mode: 'direct',
          assigned_reviewer_id: 'reviewer-1',
        },
        {
          queue_mode: 'shared',
        },
      ],
    });
  });

  it('allows organizer to query full queue when assignedTo is omitted', async () => {
    mockCls.get = jest.fn((key: string) => {
      if (key === 'actorId') return 'organizer-1';
      if (key === 'permissions') return [Permission.EVENT_UPDATE];
      if (key === 'isGlobalAdmin') return false;
      return undefined;
    });

    await service.getQueue('event-1', { limit: 20 } as any);

    const findManyArg = mockPrisma.review_queue_items.findMany.mock.calls[0][0];
    expect(findManyArg.where.OR).toBeUndefined();
  });

  it('applies assignedTo=me filter against direct assignments', async () => {
    await service.getQueue('event-1', {
      limit: 20,
      assignedTo: 'me',
    } as any);

    const findManyArg = mockPrisma.review_queue_items.findMany.mock.calls[0][0];
    expect(findManyArg.where).toMatchObject({
      queue_mode: 'direct',
      assigned_reviewer_id: 'reviewer-1',
    });
  });

  it('maps queue response with assignment metadata', async () => {
    const result = await service.getQueue('event-1', { limit: 20 } as any);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'queue-1',
      queueItemId: 'queue-1',
      queueMode: 'shared',
      assignedReviewerId: null,
      assignedReviewerEmail: null,
      assignedReviewerName: null,
      stepId: 'step-1',
      submissionVersionId: 'version-1',
    });
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('maps assigned reviewer display metadata for direct items', async () => {
    mockPrisma.review_queue_items.findMany.mockResolvedValueOnce([
      buildQueueItem({
        id: 'queue-direct',
        queueMode: 'direct',
        assignedReviewerId: 'reviewer-77',
      }),
    ]);

    const result = await service.getQueue('event-1', { limit: 20 } as any);

    expect(result.data[0]).toMatchObject({
      id: 'queue-direct',
      queueMode: 'direct',
      assignedReviewerId: 'reviewer-77',
      assignedReviewerEmail: 'reviewer@example.com',
      assignedReviewerName: 'Reviewer Name',
    });
  });

  it('ignores application-filter saved view payloads in review queue list', async () => {
    mockPrisma.review_queue_saved_views.findMany.mockResolvedValue([
      {
        id: 'rv-1',
        event_id: 'event-1',
        name: 'Review',
        user_id: 'reviewer-1',
        is_default: false,
        created_at: new Date('2026-03-10T10:00:00.000Z'),
        updated_at: new Date('2026-03-10T10:00:00.000Z'),
        filters: {
          kind: 'review_queue',
          version: 1,
          filters: { status: 'pending' },
        },
      },
      {
        id: 'rv-2',
        event_id: 'event-1',
        name: 'Applications view',
        user_id: 'reviewer-1',
        is_default: false,
        created_at: new Date('2026-03-10T10:00:00.000Z'),
        updated_at: new Date('2026-03-10T10:00:00.000Z'),
        filters: {
          kind: 'applications',
          version: 1,
          mode: 'advanced',
          filterTree: { type: 'group', mode: 'all', children: [] },
        },
      },
    ]);

    const views = await service.listSavedViews('event-1');
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('rv-1');
  });
});

describe('ReviewQueueService.getQueueItemContext', () => {
  const FILE_ID_CARD = '11111111-1111-4111-8111-111111111111';
  const FILE_PHOTO = '22222222-2222-4222-8222-222222222222';
  const FILE_UNKNOWN = '33333333-3333-4333-8333-333333333333';
  const NOT_A_FILE_UUID = '44444444-4444-4444-8444-444444444444';

  const WORKFLOW_STEPS = [
    {
      id: 'step-profile',
      title: 'Profile',
      step_index: 0,
      category: 'APPLICATION',
    },
    {
      id: 'step-review',
      title: 'Documents',
      step_index: 1,
      category: 'APPLICATION',
    },
    {
      id: 'step-essay',
      title: 'Essay',
      step_index: 2,
      category: 'APPLICATION',
    },
    {
      id: 'step-confirm',
      title: 'Confirmation',
      step_index: 3,
      category: 'CONFIRMATION',
    },
  ];

  const PROFILE_SCHEMA = {
    sections: [
      {
        id: 'sec-1',
        title: 'About you',
        fields: [
          { id: 'f-school', key: 'school', type: 'text', label: 'School' },
          {
            id: 'f-national',
            key: 'nationalId',
            type: 'text',
            label: 'National ID',
          },
          {
            id: 'f-id-card',
            key: 'idCard',
            type: 'file_upload',
            label: 'ID card',
          },
        ],
      },
    ],
  };

  const REVIEW_SCHEMA = {
    sections: [
      {
        id: 'sec-1',
        title: 'Documents',
        fields: [
          { id: 'f-photo', key: 'photo', type: 'file_upload', label: 'Photo' },
        ],
      },
    ],
  };

  type StepStateFixture = {
    step_id: string;
    status: string;
    latest_submission_version_id: string | null;
  };

  function buildContextQueueItem(overrides?: {
    queue_mode?: string;
    assigned_reviewer_id?: string | null;
    assignment_expires_at?: Date | null;
    completed_at?: Date | null;
    completed_by?: string | null;
    internal_notes?: string | null;
    profile?: Record<string, unknown> | null;
    stepStates?: StepStateFixture[];
  }) {
    const has = (key: string) =>
      !!overrides && Object.prototype.hasOwnProperty.call(overrides, key);
    const defaultStepStates: StepStateFixture[] = [
      {
        step_id: 'step-profile',
        status: StepStatus.APPROVED,
        latest_submission_version_id: 'version-profile',
      },
      {
        step_id: 'step-review',
        status: StepStatus.SUBMITTED,
        latest_submission_version_id: 'version-review',
      },
      {
        step_id: 'step-essay',
        status: StepStatus.UNLOCKED,
        latest_submission_version_id: null,
      },
      // step-confirm: no state row yet
    ];
    const defaultProfile = {
      first_name: ' Amina ',
      last_name: 'Benali',
      full_name: 'Legacy Full Name',
      institution: 'Lycee Moulay Youssef',
      city: 'Rabat',
      country: '  ',
      date_of_birth: new Date('2005-03-14T00:00:00.000Z'),
      // Never selected by the service; present to prove the mapping does not
      // leak extra profile columns.
      phone: '+212600000000',
      education_level: 'high_school',
      links: ['https://example.com/me'],
    };

    return {
      id: 'queue-ctx-1',
      application_id: 'app-1',
      step_id: 'step-review',
      submission_version_id: 'version-review',
      queue_mode: overrides?.queue_mode ?? 'shared',
      assigned_reviewer_id: overrides?.assigned_reviewer_id ?? null,
      assignment_expires_at: overrides?.assignment_expires_at ?? null,
      completed_at: overrides?.completed_at ?? null,
      completed_by: overrides?.completed_by ?? null,
      applications: {
        id: 'app-1',
        internal_notes: has('internal_notes')
          ? overrides?.internal_notes
          : null,
        users_applications_applicant_user_idTousers: {
          email: 'applicant@example.com',
          applicant_profiles: has('profile')
            ? overrides?.profile
            : defaultProfile,
        },
        application_step_states: overrides?.stepStates ?? defaultStepStates,
      },
    };
  }

  const PROFILE_VERSION = {
    id: 'version-profile',
    step_id: 'step-profile',
    version_number: 2,
    submitted_at: new Date('2026-03-01T09:00:00.000Z'),
    answers_snapshot: {
      data: { school: 'Lycee A', nationalId: NOT_A_FILE_UUID, oldField: 'x' },
    },
    form_versions: { schema: PROFILE_SCHEMA },
  };

  const REVIEW_VERSION = {
    id: 'version-review',
    step_id: 'step-review',
    version_number: 1,
    submitted_at: new Date('2026-03-05T09:00:00.000Z'),
    answers_snapshot: {
      photo: FILE_PHOTO,
      legacyUpload: {
        fileObjectId: FILE_UNKNOWN,
        originalFilename: 'gone.png',
      },
    },
    form_versions: { schema: REVIEW_SCHEMA },
  };

  const PROFILE_PATCHES = [
    {
      submission_version_id: 'version-profile',
      ops: [{ op: 'replace', path: '/school', value: 'Lycee B' }],
    },
    {
      submission_version_id: 'version-profile',
      ops: [
        {
          op: 'add',
          path: '/idCard',
          value: { fileObjectId: FILE_ID_CARD, originalFilename: 'id.pdf' },
        },
        { op: 'remove', path: '/oldField' },
      ],
    },
  ];

  const FILE_OBJECTS = [
    {
      id: FILE_PHOTO,
      original_filename: 'photo.jpg',
      mime_type: 'image/jpeg',
      size_bytes: BigInt(1024),
    },
    {
      id: FILE_ID_CARD,
      original_filename: 'id.pdf',
      mime_type: 'application/pdf',
      size_bytes: BigInt(2048),
    },
  ];

  let service: ReviewQueueService;
  let mockPrisma: any;
  let mockCls: any;
  let mockReviewerAssignmentService: Record<string, jest.Mock>;

  function setActor(params: {
    actorId?: string;
    permissions?: string[];
    isGlobalAdmin?: boolean;
  }) {
    mockCls.get = jest.fn((key: string) => {
      if (key === 'actorId') return params.actorId ?? 'reviewer-1';
      if (key === 'permissions') return params.permissions ?? [];
      if (key === 'isGlobalAdmin') return params.isGlobalAdmin ?? false;
      return undefined;
    });
  }

  function writeMocks(): jest.Mock[] {
    const mocks: jest.Mock[] = [];
    for (const [name, value] of Object.entries(mockPrisma)) {
      if (name.startsWith('$')) {
        if (name !== '$transaction') mocks.push(value as jest.Mock);
        continue;
      }
      for (const [method, fn] of Object.entries(
        value as Record<string, jest.Mock>,
      )) {
        if (/^(create|update|upsert|delete)/.test(method)) mocks.push(fn);
      }
    }
    return mocks;
  }

  beforeEach(() => {
    const delegate = (extra: Record<string, jest.Mock> = {}) => ({
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      ...extra,
    });

    mockPrisma = {
      review_queue_items: delegate({
        findFirst: jest.fn().mockResolvedValue(buildContextQueueItem()),
        findMany: jest.fn(),
      }),
      workflow_steps: delegate({
        findMany: jest.fn().mockResolvedValue(WORKFLOW_STEPS),
      }),
      step_submission_versions: delegate({
        findMany: jest
          .fn()
          .mockResolvedValue([PROFILE_VERSION, REVIEW_VERSION]),
      }),
      admin_change_patches: delegate({
        findMany: jest.fn().mockResolvedValue(PROFILE_PATCHES),
      }),
      file_objects: delegate({
        findMany: jest.fn().mockResolvedValue(FILE_OBJECTS),
      }),
      step_drafts: delegate({
        findFirst: jest.fn(),
        findMany: jest.fn(),
      }),
      application_step_states: delegate({ findMany: jest.fn() }),
      applications: delegate({ findFirst: jest.fn() }),
      form_versions: delegate({ findMany: jest.fn() }),
      $transaction: jest.fn((ops: any) =>
        typeof ops === 'function' ? ops(mockPrisma) : Promise.all(ops),
      ),
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      $queryRaw: jest.fn(),
    };

    mockCls = { get: jest.fn() };
    setActor({ permissions: [Permission.EVENT_APPLICATION_READ_FULL] });

    mockReviewerAssignmentService = {
      syncOpenQueueItemsForEvent: jest.fn(),
      releaseExpiredDirectAssignments: jest.fn(),
      claimQueueItem: jest.fn(),
      releaseQueueItem: jest.fn(),
      assertQueueAccessForReview: jest.fn(),
    };

    service = new ReviewQueueService(
      mockPrisma,
      mockCls,
      mockReviewerAssignmentService as any,
    );
  });

  describe('visibility', () => {
    it('returns 404 QUEUE_ITEM_NOT_FOUND when the item is not in this event', async () => {
      mockPrisma.review_queue_items.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getQueueItemContext('event-1', 'queue-ctx-1'),
      ).rejects.toMatchObject({
        status: 404,
        response: expect.objectContaining({ code: 'QUEUE_ITEM_NOT_FOUND' }),
      });
      expect(
        mockPrisma.review_queue_items.findFirst.mock.calls[0][0].where,
      ).toEqual({ id: 'queue-ctx-1', event_id: 'event-1' });
      expect(
        mockPrisma.step_submission_versions.findMany,
      ).not.toHaveBeenCalled();
    });

    it('lets a non-organizer read a shared item', async () => {
      const result = await service.getQueueItemContext(
        'event-1',
        'queue-ctx-1',
      );
      expect(result.queueItemId).toBe('queue-ctx-1');
    });

    it('lets a non-organizer read a direct item assigned to them', async () => {
      mockPrisma.review_queue_items.findFirst.mockResolvedValueOnce(
        buildContextQueueItem({
          queue_mode: 'direct',
          assigned_reviewer_id: 'reviewer-1',
          assignment_expires_at: new Date(Date.now() + 60_000),
        }),
      );

      await expect(
        service.getQueueItemContext('event-1', 'queue-ctx-1'),
      ).resolves.toMatchObject({ queueItemId: 'queue-ctx-1' });
    });

    it.each([
      ['an active assignment', new Date(Date.now() + 60 * 60_000)],
      ['an assignment without expiry', null],
    ])(
      'returns 403 for a direct item assigned to someone else (%s)',
      async (_label, expiresAt) => {
        mockPrisma.review_queue_items.findFirst.mockResolvedValueOnce(
          buildContextQueueItem({
            queue_mode: 'direct',
            assigned_reviewer_id: 'reviewer-2',
            assignment_expires_at: expiresAt,
          }),
        );

        await expect(
          service.getQueueItemContext('event-1', 'queue-ctx-1'),
        ).rejects.toMatchObject({
          status: 403,
          response: expect.objectContaining({
            code: 'QUEUE_ITEM_NOT_ASSIGNED_TO_YOU',
          }),
        });
        expect(
          mockPrisma.step_submission_versions.findMany,
        ).not.toHaveBeenCalled();
        expect(mockPrisma.file_objects.findMany).not.toHaveBeenCalled();
      },
    );

    it('lets a non-organizer read an expired direct item (listed as shared)', async () => {
      mockPrisma.review_queue_items.findFirst.mockResolvedValueOnce(
        buildContextQueueItem({
          queue_mode: 'direct',
          assigned_reviewer_id: 'reviewer-2',
          assignment_expires_at: new Date(Date.now() - 60_000),
        }),
      );

      await expect(
        service.getQueueItemContext('event-1', 'queue-ctx-1'),
      ).resolves.toMatchObject({ queueItemId: 'queue-ctx-1' });
    });

    it.each([
      [
        'an organizer (EVENT_UPDATE)',
        { permissions: [Permission.EVENT_UPDATE] },
      ],
      ['a global admin', { isGlobalAdmin: true }],
    ])(
      'lets %s read any item, including completed ones',
      async (_label, actor) => {
        setActor({ actorId: 'organizer-1', ...actor });
        mockPrisma.review_queue_items.findFirst
          .mockResolvedValueOnce(
            buildContextQueueItem({
              queue_mode: 'direct',
              assigned_reviewer_id: 'reviewer-2',
              assignment_expires_at: new Date(Date.now() + 60 * 60_000),
            }),
          )
          .mockResolvedValueOnce(
            buildContextQueueItem({
              completed_at: new Date('2026-03-06T10:00:00.000Z'),
              completed_by: 'reviewer-2',
            }),
          );

        await expect(
          service.getQueueItemContext('event-1', 'queue-ctx-1'),
        ).resolves.toMatchObject({ queueItemId: 'queue-ctx-1' });
        await expect(
          service.getQueueItemContext('event-1', 'queue-ctx-1'),
        ).resolves.toMatchObject({ queueItemId: 'queue-ctx-1' });
      },
    );

    it('hides completed items from non-organizers unless they completed it', async () => {
      const completedAt = new Date('2026-03-06T10:00:00.000Z');
      mockPrisma.review_queue_items.findFirst
        .mockResolvedValueOnce(
          buildContextQueueItem({
            completed_at: completedAt,
            completed_by: 'reviewer-2',
          }),
        )
        .mockResolvedValueOnce(
          buildContextQueueItem({
            completed_at: completedAt,
            completed_by: null,
          }),
        )
        .mockResolvedValueOnce(
          buildContextQueueItem({
            queue_mode: 'direct',
            assigned_reviewer_id: 'reviewer-1',
            completed_at: completedAt,
            completed_by: 'reviewer-1',
          }),
        );

      await expect(
        service.getQueueItemContext('event-1', 'queue-ctx-1'),
      ).rejects.toMatchObject({
        status: 404,
        response: expect.objectContaining({ code: 'QUEUE_ITEM_NOT_FOUND' }),
      });
      await expect(
        service.getQueueItemContext('event-1', 'queue-ctx-1'),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.getQueueItemContext('event-1', 'queue-ctx-1'),
      ).resolves.toMatchObject({ queueItemId: 'queue-ctx-1' });
    });
  });

  it('never writes, syncs or releases queue items', async () => {
    await service.getQueueItemContext('event-1', 'queue-ctx-1');

    const writes = writeMocks();
    expect(writes.length).toBeGreaterThan(0);
    for (const fn of writes) {
      expect(fn).not.toHaveBeenCalled();
    }
    for (const fn of Object.values(mockReviewerAssignmentService)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('returns ids and every workflow step in step_index order', async () => {
    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(mockPrisma.workflow_steps.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { event_id: 'event-1' },
        orderBy: { step_index: 'asc' },
      }),
    );
    expect(result).toMatchObject({
      queueItemId: 'queue-ctx-1',
      applicationId: 'app-1',
      stepId: 'step-review',
      submissionVersionId: 'version-review',
    });
    expect(
      result.steps.map((step) => ({
        stepId: step.stepId,
        stepIndex: step.stepIndex,
        title: step.title,
        category: step.category,
        status: step.status,
        isQueueItemStep: step.isQueueItemStep,
        submitted: step.submission !== null,
      })),
    ).toEqual([
      {
        stepId: 'step-profile',
        stepIndex: 0,
        title: 'Profile',
        category: 'APPLICATION',
        status: StepStatus.APPROVED,
        isQueueItemStep: false,
        submitted: true,
      },
      {
        stepId: 'step-review',
        stepIndex: 1,
        title: 'Documents',
        category: 'APPLICATION',
        status: StepStatus.SUBMITTED,
        isQueueItemStep: true,
        submitted: true,
      },
      {
        stepId: 'step-essay',
        stepIndex: 2,
        title: 'Essay',
        category: 'APPLICATION',
        status: StepStatus.UNLOCKED,
        isQueueItemStep: false,
        submitted: false,
      },
      {
        stepId: 'step-confirm',
        stepIndex: 3,
        title: 'Confirmation',
        category: 'CONFIRMATION',
        status: null,
        isQueueItemStep: false,
        submitted: false,
      },
    ]);
  });

  it('reads only latest submitted versions and never drafts', async () => {
    await service.getQueueItemContext('event-1', 'queue-ctx-1');

    const versionArgs =
      mockPrisma.step_submission_versions.findMany.mock.calls[0][0];
    expect(versionArgs.where).toEqual({
      id: { in: ['version-profile', 'version-review'] },
      application_id: 'app-1',
    });
    expect(versionArgs.select).toMatchObject({
      answers_snapshot: true,
      form_versions: { select: { schema: true } },
    });
    expect(mockPrisma.step_drafts.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.step_drafts.findMany).not.toHaveBeenCalled();
  });

  it('skips submission, patch and file queries when nothing was submitted', async () => {
    mockPrisma.review_queue_items.findFirst.mockResolvedValueOnce(
      buildContextQueueItem({ stepStates: [] }),
    );

    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(mockPrisma.step_submission_versions.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.admin_change_patches.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.file_objects.findMany).not.toHaveBeenCalled();
    expect(result.steps.every((step) => step.submission === null)).toBe(true);
    expect(result.steps.every((step) => step.status === null)).toBe(true);
    expect(result.files).toEqual([]);
  });

  it('queries only active patches for the latest versions, oldest first', async () => {
    await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(mockPrisma.admin_change_patches.findMany).toHaveBeenCalledWith({
      where: {
        submission_version_id: { in: ['version-profile', 'version-review'] },
        application_id: 'app-1',
        is_active: true,
      },
      select: { submission_version_id: true, ops: true },
      orderBy: { created_at: 'asc' },
    });
  });

  it('applies replace/add/remove patches on unwrapped answers and reports edited fields', async () => {
    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');
    const profileStep = result.steps.find(
      (step) => step.stepId === 'step-profile',
    );

    expect(profileStep?.submission).toEqual({
      submissionVersionId: 'version-profile',
      versionNumber: 2,
      submittedAt: new Date('2026-03-01T09:00:00.000Z'),
      formDefinition: PROFILE_SCHEMA,
      answers: {
        school: 'Lycee B',
        nationalId: NOT_A_FILE_UUID,
        idCard: { fileObjectId: FILE_ID_CARD, originalFilename: 'id.pdf' },
      },
      editedFields: [
        { key: 'school', originalValue: 'Lycee A' },
        { key: 'idCard' },
        { key: 'oldField', originalValue: 'x' },
      ],
    });
    // A field added by staff carries no originalValue property (clean JSON).
    expect(profileStep?.submission?.editedFields[1]).not.toHaveProperty(
      'originalValue',
    );

    const reviewStep = result.steps.find(
      (step) => step.stepId === 'step-review',
    );
    expect(reviewStep?.submission).toMatchObject({
      submissionVersionId: 'version-review',
      answers: REVIEW_VERSION.answers_snapshot,
      editedFields: [],
      formDefinition: REVIEW_SCHEMA,
    });
  });

  it('ignores a returned version that is not the step latest', async () => {
    mockPrisma.step_submission_versions.findMany.mockResolvedValueOnce([
      { ...PROFILE_VERSION, id: 'version-profile-old' },
      REVIEW_VERSION,
    ]);

    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(
      result.steps.find((step) => step.stepId === 'step-profile')?.submission,
    ).toBeNull();
  });

  it('returns file metadata only for referenced files in this event', async () => {
    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(mockPrisma.file_objects.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.file_objects.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [FILE_ID_CARD, FILE_PHOTO, FILE_UNKNOWN] },
        event_id: 'event-1',
      },
      select: {
        id: true,
        original_filename: true,
        mime_type: true,
        size_bytes: true,
      },
    });
    // The uuid in a text field (nationalId) is not a file; the unknown id is dropped.
    expect(result.files).toEqual([
      {
        fileObjectId: FILE_ID_CARD,
        stepId: 'step-profile',
        fieldKey: 'idCard',
        originalFilename: 'id.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      },
      {
        fileObjectId: FILE_PHOTO,
        stepId: 'step-review',
        fieldKey: 'photo',
        originalFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      },
    ]);
    expect(typeof result.files[0].sizeBytes).toBe('number');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('skips the file query when submissions reference no files', async () => {
    mockPrisma.step_submission_versions.findMany.mockResolvedValueOnce([
      {
        ...PROFILE_VERSION,
        answers_snapshot: { school: 'Lycee A', nationalId: NOT_A_FILE_UUID },
      },
    ]);
    mockPrisma.admin_change_patches.findMany.mockResolvedValueOnce([]);

    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(mockPrisma.file_objects.findMany).not.toHaveBeenCalled();
    expect(result.files).toEqual([]);
  });

  it('maps the live applicant profile without phone, education or links', async () => {
    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(result.applicant).toEqual({
      email: 'applicant@example.com',
      firstName: 'Amina',
      lastName: 'Benali',
      fullName: 'Amina Benali',
      institution: 'Lycee Moulay Youssef',
      city: 'Rabat',
      country: null,
      dateOfBirth: '2005-03-14',
    });
    const selectedProfile =
      mockPrisma.review_queue_items.findFirst.mock.calls[0][0].select
        .applications.select.users_applications_applicant_user_idTousers.select
        .applicant_profiles.select;
    expect(selectedProfile).not.toHaveProperty('phone');
    expect(selectedProfile).not.toHaveProperty('education_level');
    expect(selectedProfile).not.toHaveProperty('links');
    expect(selectedProfile).toHaveProperty('date_of_birth', true);
  });

  it('falls back to full_name and nulls when the profile is sparse or missing', async () => {
    mockPrisma.review_queue_items.findFirst
      .mockResolvedValueOnce(
        buildContextQueueItem({
          profile: {
            first_name: '',
            last_name: null,
            full_name: 'Legacy Full Name',
            institution: null,
            city: '',
            country: 'Morocco',
            date_of_birth: null,
          },
        }),
      )
      .mockResolvedValueOnce(buildContextQueueItem({ profile: null }));

    const sparse = await service.getQueueItemContext('event-1', 'queue-ctx-1');
    expect(sparse.applicant).toEqual({
      email: 'applicant@example.com',
      firstName: null,
      lastName: null,
      fullName: 'Legacy Full Name',
      institution: null,
      city: null,
      country: 'Morocco',
      dateOfBirth: null,
    });

    const missing = await service.getQueueItemContext('event-1', 'queue-ctx-1');
    expect(missing.applicant).toEqual({
      email: 'applicant@example.com',
      firstName: null,
      lastName: null,
      fullName: null,
      institution: null,
      city: null,
      country: null,
      dateOfBirth: null,
    });
  });

  it('parses internal notes newest first', async () => {
    mockPrisma.review_queue_items.findFirst.mockResolvedValueOnce(
      buildContextQueueItem({
        internal_notes: [
          '[2026-01-01T10:00:00.000Z] Alice: first note',
          'legacy free-form line',
          '[2026-02-01T10:00:00.000Z] Bob: second note',
        ].join('\n'),
      }),
    );

    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');

    expect(
      result.internalNotes.map((note) => ({
        authorName: note.authorName,
        createdAt: note.createdAt,
        content: note.content,
      })),
    ).toEqual([
      {
        authorName: 'Bob',
        createdAt: '2026-02-01T10:00:00.000Z',
        content: 'second note',
      },
      { authorName: null, createdAt: null, content: 'legacy free-form line' },
      {
        authorName: 'Alice',
        createdAt: '2026-01-01T10:00:00.000Z',
        content: 'first note',
      },
    ]);
  });

  it('returns no notes when the application has none', async () => {
    const result = await service.getQueueItemContext('event-1', 'queue-ctx-1');
    expect(result.internalNotes).toEqual([]);
  });
});
