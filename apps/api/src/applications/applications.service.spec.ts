import { ApplicationsService } from './applications.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ApplicationsService completion credentials', () => {
  let service: ApplicationsService;
  let mockPrisma: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.APP_BASE_URL = 'http://localhost:3000';

    mockPrisma = {
      applications: {
        findFirst: jest.fn(),
      },
      completion_credentials: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    service = new ApplicationsService(
      mockPrisma,
      { get: jest.fn() } as any,
      {} as any,
    );
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.JWT_SECRET;
  });

  it('issues a completion credential after check-in', async () => {
    const checkedInAt = new Date('2026-02-18T12:00:00.000Z');
    mockPrisma.applications.findFirst.mockResolvedValue({
      id: 'app-1',
      event_id: 'event-1',
      applicant_user_id: 'user-1',
      attendance_records: {
        status: 'CHECKED_IN',
        checked_in_at: checkedInAt,
      },
    });
    mockPrisma.completion_credentials.findUnique.mockResolvedValue(null);
    mockPrisma.completion_credentials.create.mockImplementation(
      ({ data }: any) =>
        Promise.resolve({
          certificate_id: data.certificate_id,
          credential_id: data.credential_id,
          issued_at: data.issued_at,
          revoked_at: data.revoked_at,
        }),
    );

    const credential = await service.issueCompletionCredential('event-1', 'app-1');

    expect(credential.status).toBe('ISSUED');
    expect(credential.certificateUrl).toContain('/credentials/certificate/');
    expect(credential.verifiableCredentialUrl).toContain('/credentials/verify/');
    expect(mockPrisma.completion_credentials.create).toHaveBeenCalledTimes(1);
  });

  it('revokes an existing completion credential', async () => {
    mockPrisma.completion_credentials.updateMany.mockResolvedValue({ count: 1 });

    await service.revokeCompletionCredential('event-1', 'app-1');

    expect(mockPrisma.completion_credentials.updateMany).toHaveBeenCalledWith({
      where: {
        application_id: 'app-1',
        event_id: 'event-1',
        revoked_at: null,
      },
      data: expect.objectContaining({
        revoked_at: expect.any(Date),
        updated_at: expect.any(Date),
      }),
    });
  });

  it('keeps credentials verifiable for archived events', async () => {
    const checkedInAt = new Date('2026-02-18T12:00:00.000Z');
    let createdData: any = null;

    mockPrisma.applications.findFirst.mockResolvedValue({
      id: 'app-1',
      event_id: 'event-1',
      applicant_user_id: 'user-1',
      attendance_records: {
        status: 'CHECKED_IN',
        checked_in_at: checkedInAt,
      },
    });
    mockPrisma.completion_credentials.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementation(async ({ where }: any) => {
        if (where.credential_id !== createdData?.credential_id) return null;
        return {
          application_id: 'app-1',
          event_id: 'event-1',
          certificate_id: createdData.certificate_id,
          credential_id: createdData.credential_id,
          credential_signature: createdData.credential_signature,
          issued_at: createdData.issued_at,
          revoked_at: null,
          events: {
            id: 'event-1',
            title: 'Demo Event',
            slug: 'demo-event',
            status: 'archived',
          },
          applications: {
            id: 'app-1',
            applicant_user_id: 'user-1',
            attendance_records: { checked_in_at: checkedInAt },
            users_applications_applicant_user_idTousers: {
              applicant_profiles: { full_name: 'Jane Doe' },
            },
          },
        };
      });
    mockPrisma.completion_credentials.create.mockImplementation(
      ({ data }: any) => {
        createdData = data;
        return Promise.resolve({
          certificate_id: data.certificate_id,
          credential_id: data.credential_id,
          issued_at: data.issued_at,
          revoked_at: data.revoked_at,
        });
      },
    );

    const issued = await service.issueCompletionCredential('event-1', 'app-1');
    const verification = await service.verifyCredential(issued.credentialId);

    expect(verification.valid).toBe(true);
    expect(verification.status).toBe('VALID');
    expect(verification.eventArchived).toBe(true);
    expect(verification.verification.signatureValid).toBe(true);
  });
});

describe('ApplicationsService cursor pagination', () => {
  let service: ApplicationsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      applications: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );
  });

  it('uses stable descending pagination by updated_at then id', async () => {
    const cursorTime = new Date('2026-03-08T10:00:00.000Z');
    mockPrisma.applications.findFirst.mockResolvedValue({
      id: 'cursor-id',
      updated_at: cursorTime,
    });

    await service.findAll(
      'event-1',
      { cursor: 'cursor-id', limit: 50, order: 'desc' } as any,
    );

    expect(mockPrisma.applications.findMany).toHaveBeenCalledTimes(1);
    const query = mockPrisma.applications.findMany.mock.calls[0][0];

    expect(query.orderBy).toEqual([{ updated_at: 'desc' }, { id: 'desc' }]);
    expect(query.where.AND).toEqual([
      {
        OR: [
          { updated_at: { lt: cursorTime } },
          { updated_at: cursorTime, id: { lt: 'cursor-id' } },
        ],
      },
    ]);
  });

  it('uses stable ascending pagination by updated_at then id', async () => {
    const cursorTime = new Date('2026-03-08T10:00:00.000Z');
    mockPrisma.applications.findFirst.mockResolvedValue({
      id: 'cursor-id',
      updated_at: cursorTime,
    });

    await service.findAll(
      'event-1',
      { cursor: 'cursor-id', limit: 50, order: 'asc' } as any,
    );

    expect(mockPrisma.applications.findMany).toHaveBeenCalledTimes(1);
    const query = mockPrisma.applications.findMany.mock.calls[0][0];

    expect(query.orderBy).toEqual([{ updated_at: 'asc' }, { id: 'asc' }]);
    expect(query.where.AND).toEqual([
      {
        OR: [
          { updated_at: { gt: cursorTime } },
          { updated_at: cursorTime, id: { gt: 'cursor-id' } },
        ],
      },
    ]);
  });
});

describe('ApplicationsService advanced filters and progress summary', () => {
  const now = new Date('2026-03-08T10:00:00.000Z');

  function createListApplication(input: {
    id: string;
    decisionStatus?: string;
    tags?: string[];
    stepStates: Array<{
      stepId: string;
      status: string;
      stepIndex: number;
      currentDraftId?: string | null;
      latestSubmissionVersionId?: string | null;
    }>;
  }) {
    return {
      id: input.id,
      event_id: 'event-1',
      applicant_user_id: `${input.id}-user`,
      decision_status: input.decisionStatus ?? 'NONE',
      decision_published_at: null,
      tags: input.tags ?? [],
      created_at: now,
      updated_at: now,
      users_applications_applicant_user_idTousers: {
        email: `${input.id}@example.com`,
        applicant_profiles: {
          first_name: 'Ada',
          last_name: 'Lovelace',
          full_name: 'Ada Lovelace',
        },
      },
      application_step_states: input.stepStates.map((stepState) => ({
        step_id: stepState.stepId,
        status: stepState.status,
        current_draft_id: stepState.currentDraftId ?? null,
        latest_submission_version_id: stepState.latestSubmissionVersionId ?? null,
        workflow_steps: { step_index: stepState.stepIndex },
      })),
      attendance_records: null,
    };
  }

  it('keeps tag filtering as match-all via hasEvery', async () => {
    const mockPrisma = {
      applications: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    await service.findAll(
      'event-1',
      {
        limit: 50,
        order: 'desc',
        tags: ['vip', 'intl'],
      } as any,
    );

    expect(mockPrisma.applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tags: { hasEvery: ['vip', 'intl'] },
        }),
      }),
    );
  });

  it('filters by computed criteria and returns draft-aware progress summary', async () => {
    const matching = createListApplication({
      id: 'app-match',
      stepStates: [
        {
          stepId: 'step-1',
          status: 'NEEDS_REVISION',
          stepIndex: 0,
          currentDraftId: 'draft-1',
        },
        {
          stepId: 'step-2',
          status: 'UNLOCKED',
          stepIndex: 1,
        },
      ],
    });
    const nonMatching = createListApplication({
      id: 'app-other',
      decisionStatus: 'ACCEPTED',
      stepStates: [
        {
          stepId: 'step-1',
          status: 'APPROVED',
          stepIndex: 0,
        },
      ],
    });

    const mockPrisma = {
      applications: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([matching, nonMatching]),
      },
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    const result = await service.findAll(
      'event-1',
      {
        limit: 50,
        order: 'desc',
        derivedStatus: ['accepted', 'revision_required'],
        hasDraftProgress: true,
        completionBucket: ['50_99'],
        needsRevisionOnly: true,
      } as any,
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('app-match');
    expect(result.data[0]?.stepsSummary).toEqual({
      total: 2,
      completed: 0,
      progressed: 1,
      progressPercent: 50,
      needsRevision: 1,
    });
  });
});

describe('ApplicationsService detail draft answer visibility', () => {
  const now = new Date('2026-03-08T10:00:00.000Z');

  function createDetailedApplication(stepState: {
    currentDraftId?: string | null;
    latestSubmissionVersionId?: string | null;
  }) {
    return {
      id: 'app-1',
      event_id: 'event-1',
      applicant_user_id: 'user-1',
      decision_status: 'NONE',
      decision_published_at: null,
      decision_draft: null,
      tags: [],
      internal_notes: null,
      assigned_reviewer_id: null,
      created_at: now,
      updated_at: now,
      users_applications_applicant_user_idTousers: {
        id: 'user-1',
        email: 'user@example.com',
        applicant_profiles: null,
      },
      application_step_states: [
        {
          application_id: 'app-1',
          step_id: 'step-1',
          status: 'UNLOCKED',
          current_draft_id: stepState.currentDraftId ?? null,
          latest_submission_version_id: stepState.latestSubmissionVersionId ?? null,
          revision_cycle_count: 0,
          unlocked_at: now,
          last_activity_at: now,
          workflow_steps: {
            title: 'Step 1',
            step_index: 0,
            category: 'APPLICATION',
            deadline_at: null,
            instructions_rich: null,
            form_versions: null,
          },
        },
      ],
      attendance_records: null,
      completion_credentials: null,
    };
  }

  it('returns draft answers when only draft exists', async () => {
    const mockPrisma = {
      applications: {
        findFirst: jest.fn().mockResolvedValue(
          createDetailedApplication({ currentDraftId: 'draft-1' }),
        ),
      },
      step_submission_versions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      admin_change_patches: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      step_drafts: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'draft-1', answers_draft: { essay: 'Draft answer' } },
        ]),
      },
      applicant_profiles: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      { ensureStepStates: jest.fn().mockResolvedValue(false) } as any,
    );

    const result = await service.findById('event-1', 'app-1');

    expect(result.stepStates[0]?.answers).toEqual({ essay: 'Draft answer' });
    expect(result.stepStates[0]?.answersSource).toBe('DRAFT');
  });

  it('prefers draft answers over submitted answers when both exist', async () => {
    const mockPrisma = {
      applications: {
        findFirst: jest.fn().mockResolvedValue(
          createDetailedApplication({
            currentDraftId: 'draft-1',
            latestSubmissionVersionId: 'submission-1',
          }),
        ),
      },
      step_submission_versions: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'submission-1', answers_snapshot: { essay: 'Submitted answer' } },
        ]),
      },
      admin_change_patches: {
        findMany: jest.fn().mockResolvedValue([
          {
            submission_version_id: 'submission-1',
            ops: [{ op: 'replace', path: '/essay', value: 'Patched answer' }],
          },
        ]),
      },
      step_drafts: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'draft-1', answers_draft: { essay: 'Draft answer' } },
        ]),
      },
      applicant_profiles: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      { ensureStepStates: jest.fn().mockResolvedValue(false) } as any,
    );

    const result = await service.findById('event-1', 'app-1');

    expect(result.stepStates[0]?.answers).toEqual({ essay: 'Draft answer' });
    expect(result.stepStates[0]?.answersSource).toBe('DRAFT');
  });
});

describe('ApplicationsService applicant visibility', () => {
  it('only resolves my application for published events', async () => {
    const mockPrisma = {
      applications: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const mockCls = {
      get: jest.fn((key: string) => (key === 'actorId' ? 'user-1' : undefined)),
    };
    const stepStateService = {
      ensureStepStates: jest.fn(),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      mockCls as any,
      stepStateService as any,
    );

    const result = await service.findMyApplication('event-1');

    expect(result).toBeNull();
    expect(mockPrisma.applications.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event_id: 'event-1',
          applicant_user_id: 'user-1',
          events: { is: { status: 'published' } },
        }),
      }),
    );
  });

  it('shows hidden steps once they are unlocked for applicant view', async () => {
    const now = new Date('2026-02-20T10:00:00.000Z');
    const mockPrisma = {
      applications: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'app-1',
          event_id: 'event-1',
          applicant_user_id: 'user-1',
          decision_status: 'NONE',
          decision_published_at: null,
          decision_draft: null,
          tags: [],
          internal_notes: null,
          assigned_reviewer_id: null,
          created_at: now,
          updated_at: now,
          users_applications_applicant_user_idTousers: {
            id: 'user-1',
            email: 'user@example.com',
            applicant_profiles: null,
          },
          application_step_states: [
            {
              application_id: 'app-1',
              step_id: 'hidden-locked',
              status: 'LOCKED',
              current_draft_id: null,
              latest_submission_version_id: null,
              revision_cycle_count: 0,
              unlocked_at: null,
              last_activity_at: now,
              workflow_steps: {
                title: 'Hidden locked',
                step_index: 0,
                category: 'APPLICATION',
                deadline_at: null,
                instructions_rich: null,
                hidden: true,
                form_versions: null,
              },
            },
            {
              application_id: 'app-1',
              step_id: 'hidden-unlocked',
              status: 'UNLOCKED',
              current_draft_id: null,
              latest_submission_version_id: null,
              revision_cycle_count: 0,
              unlocked_at: now,
              last_activity_at: now,
              workflow_steps: {
                title: 'Hidden unlocked',
                step_index: 1,
                category: 'APPLICATION',
                deadline_at: null,
                instructions_rich: null,
                hidden: true,
                form_versions: null,
              },
            },
            {
              application_id: 'app-1',
              step_id: 'visible',
              status: 'UNLOCKED',
              current_draft_id: null,
              latest_submission_version_id: null,
              revision_cycle_count: 0,
              unlocked_at: now,
              last_activity_at: now,
              workflow_steps: {
                title: 'Visible step',
                step_index: 2,
                category: 'APPLICATION',
                deadline_at: null,
                instructions_rich: null,
                hidden: false,
                form_versions: null,
              },
            },
          ],
          attendance_records: null,
          completion_credentials: null,
        }),
      },
    };
    const mockCls = {
      get: jest.fn((key: string) => (key === 'actorId' ? 'user-1' : undefined)),
    };
    const stepStateService = {
      ensureStepStates: jest.fn().mockResolvedValue(false),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      mockCls as any,
      stepStateService as any,
    );

    const result = await service.findMyApplication('event-1');

    expect(result?.stepStates.map((step) => step.stepId)).toEqual([
      'hidden-unlocked',
      'visible',
    ]);
  });
});

describe('ApplicationsService ticket confirmation gating', () => {
  let service: ApplicationsService;
  let mockPrisma: any;
  let mockCls: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    mockCls = {
      get: jest.fn((key: string) =>
        key === 'actorId' ? 'reviewer-1' : undefined,
      ),
    };
    mockPrisma = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          checkin_config: {
            enabled: true,
            allowSelfCheckin: true,
          },
        }),
      },
      applications: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'app-1',
          event_id: 'event-1',
          applicant_user_id: 'user-1',
          decision_status: 'ACCEPTED',
          decision_published_at: new Date('2026-02-20T10:00:00.000Z'),
          attendance_records: null,
        }),
      },
      application_step_states: {
        findMany: jest.fn(),
      },
      attendance_records: {
        upsert: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    service = new ApplicationsService(
      mockPrisma as any,
      mockCls as any,
      {} as any,
    );
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('blocks ticket generation before confirmation approval', async () => {
    mockPrisma.application_step_states.findMany.mockResolvedValue([
      { status: 'SUBMITTED' },
    ]);

    await expect(
      service.confirmAttendance('event-1', 'app-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.attendance_records.upsert).not.toHaveBeenCalled();
  });

  it('generates ticket after confirmation approval', async () => {
    mockPrisma.application_step_states.findMany.mockResolvedValue([
      { status: 'APPROVED' },
    ]);
    mockPrisma.attendance_records.upsert.mockResolvedValue({
      application_id: 'app-1',
      qr_token_hash: 'jti-1',
    });

    const result = await service.confirmAttendance('event-1', 'app-1');

    expect(typeof result.qrToken).toBe('string');
    expect(result.qrToken.length).toBeGreaterThan(10);
    expect(mockPrisma.attendance_records.upsert).toHaveBeenCalledTimes(1);
  });

  it('blocks ticket retrieval before confirmation approval', async () => {
    mockPrisma.application_step_states.findMany.mockResolvedValue([
      { status: 'SUBMITTED' },
    ]);
    mockPrisma.attendance_records.findUnique.mockResolvedValue({
      application_id: 'app-1',
      qr_token_hash: 'existing-jti',
    });

    await expect(service.getTicket('event-1', 'app-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('ApplicationsService create profile requirements', () => {
  it('rejects creating an application when required profile fields are missing', async () => {
    const mockPrisma = {
      events: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'event-1',
          status: 'published',
          application_open_at: null,
          application_close_at: null,
          capacity: null,
        }),
      },
      applications: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      applicant_profiles: {
        findUnique: jest.fn().mockResolvedValue({
          full_name: null,
          first_name: ' ',
          last_name: null,
          phone: null,
          education_level: 'Undergraduate',
          institution: 'Example University',
          city: 'Rabat',
          country: 'Morocco',
          date_of_birth: null,
        }),
      },
    };
    const mockCls = {
      get: jest.fn((key: string) => (key === 'actorId' ? 'user-1' : undefined)),
    };
    const stepStateService = {
      initializeStepStates: jest.fn(),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      mockCls as any,
      stepStateService as any,
    );

    let thrown: unknown;
    try {
      await service.create('event-1');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    if (!(thrown instanceof ForbiddenException)) {
      return;
    }

    const response = thrown.getResponse() as Record<string, unknown>;
    expect(response.code).toBe('PROFILE_INCOMPLETE');
    expect(response.missingFields).toEqual(
      expect.arrayContaining([
        'First name',
        'Last name',
        'Phone',
        'Date of birth',
      ]),
    );
    expect(mockPrisma.applications.create).not.toHaveBeenCalled();
    expect(stepStateService.initializeStepStates).not.toHaveBeenCalled();
  });
});

describe('ApplicationsService bulk step action', () => {
  it('adds approve side effects and tolerates non-fatal confirmation failures', async () => {
    const mockPrisma = {
      workflow_steps: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'step-1',
          category: 'CONFIRMATION',
        }),
      },
      applications: {
        findMany: jest.fn().mockResolvedValue([{ id: 'app-1' }]),
      },
      application_step_states: {
        findMany: jest.fn().mockResolvedValue([{ application_id: 'app-1' }]),
        updateMany: jest.fn(),
      },
      needs_info_requests: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const stepStateService = {
      manualUnlock: jest.fn(),
      markApproved: jest.fn().mockResolvedValue(undefined),
      markNeedsRevision: jest.fn(),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      stepStateService as any,
    );
    jest
      .spyOn(service, 'confirmAttendance')
      .mockRejectedValue(new Error('non-fatal'));

    const result = await service.bulkStepAction('event-1', {
      applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
      stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
      action: 'APPROVE',
    });

    expect(stepStateService.markApproved).toHaveBeenCalledWith(
      'app-1',
      'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
    );
    expect(mockPrisma.needs_info_requests.updateMany).toHaveBeenCalledWith({
      where: {
        application_id: 'app-1',
        step_id: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        status: 'OPEN',
      },
      data: {
        status: 'CANCELED',
        resolved_at: expect.any(Date),
      },
    });
    expect(service.confirmAttendance).toHaveBeenCalledWith('event-1', 'app-1');
    expect(result).toEqual({ updated: 1, skipped: 0 });
  });

  it('applies REJECT by setting final rejection and canceling open needs-info requests', async () => {
    const mockPrisma = {
      workflow_steps: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'step-1',
          category: 'APPLICATION',
        }),
      },
      applications: {
        findMany: jest.fn().mockResolvedValue([{ id: 'app-1' }]),
      },
      application_step_states: {
        findMany: jest.fn().mockResolvedValue([{ application_id: 'app-1' }]),
        updateMany: jest.fn(),
      },
      needs_info_requests: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const stepStateService = {
      manualUnlock: jest.fn(),
      markApproved: jest.fn(),
      markNeedsRevision: jest.fn(),
      markRejectedFinal: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      stepStateService as any,
    );

    const result = await service.bulkStepAction('event-1', {
      applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
      stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
      action: 'REJECT',
    });

    expect(stepStateService.markRejectedFinal).toHaveBeenCalledWith(
      'app-1',
      'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
    );
    expect(mockPrisma.needs_info_requests.updateMany).toHaveBeenCalledWith({
      where: {
        application_id: 'app-1',
        step_id: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        status: 'OPEN',
      },
      data: {
        status: 'CANCELED',
        resolved_at: expect.any(Date),
      },
    });
    expect(result).toEqual({ updated: 1, skipped: 0 });
  });

  it('skips LOCK when no step state exists for an application', async () => {
    const mockPrisma = {
      workflow_steps: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'step-1',
          category: 'APPLICATION',
        }),
      },
      applications: {
        findMany: jest.fn().mockResolvedValue([{ id: 'app-1' }]),
      },
      application_step_states: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      needs_info_requests: {
        updateMany: jest.fn(),
      },
    };
    const stepStateService = {
      manualUnlock: jest.fn(),
      markApproved: jest.fn(),
      markNeedsRevision: jest.fn(),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      stepStateService as any,
    );

    const result = await service.bulkStepAction('event-1', {
      applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
      stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
      action: 'LOCK',
    });

    expect(mockPrisma.application_step_states.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ updated: 0, skipped: 1 });
  });
});

describe('ApplicationsService CSV export', () => {
  const now = new Date('2026-03-02T12:00:00.000Z');

  function createService() {
    const mockPrisma = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event-1',
          slug: 'math-maroc-2026',
          title: 'Math & Maroc 2026',
        }),
      },
      applications: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'app-1',
            event_id: 'event-1',
            applicant_user_id: 'user-1',
            decision_status: 'ACCEPTED',
            decision_published_at: new Date('2026-03-01T09:00:00.000Z'),
            decision_draft: null,
            tags: ['vip', 'intl'],
            created_at: new Date('2026-02-20T10:00:00.000Z'),
            updated_at: new Date('2026-03-01T09:00:00.000Z'),
            users_applications_applicant_user_idTousers: {
              id: 'user-1',
              email: 'user@example.com',
              applicant_profiles: {
                full_name: 'Ada Lovelace',
                first_name: 'Ada',
                last_name: 'Lovelace',
                date_of_birth: new Date('2000-01-02T00:00:00.000Z'),
                phone: '+212600000000',
                education_level: 'Bachelor',
                institution: 'UM5',
                city: 'Rabat',
                country: 'MA',
                links: ['https://portfolio.example.com'],
              },
            },
            application_step_states: [
              {
                step_id: 'step-1',
                status: 'APPROVED',
                latest_submission_version_id: null,
                workflow_steps: {
                  title: 'Profile',
                  step_index: 0,
                },
              },
            ],
            attendance_records: {
              status: 'CONFIRMED',
            },
          },
        ]),
      },
      completion_credentials: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      file_objects: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      step_submission_versions: {
        findMany: jest.fn(),
      },
      admin_change_patches: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    return { service, mockPrisma };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    process.env.APP_BASE_URL = 'https://platform.example.com';
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.APP_BASE_URL;
  });

  it('exports CSV including profile and application fields', async () => {
    const { service } = createService();

    const result = await service.exportEventApplicationsCsv('event-1');

    expect(result.filename).toBe('applications-math-maroc-2026.csv');
    const lines = result.csv.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const header = lines[0];
    const row = lines[1];

    expect(header).toContain('"applicationId"');
    expect(header).toContain('"decisionStatus"');
    expect(header).toContain('"applicationCreatedAt"');

    expect(header).toContain('"applicantName"');
    expect(header).toContain('"applicantFirstName"');
    expect(header).toContain('"applicantLastName"');
    expect(header).toContain('"applicantDateOfBirth"');
    expect(header).toContain('"phone"');
    expect(header).toContain('"education"');
    expect(header).toContain('"institution"');
    expect(header).toContain('"city"');
    expect(header).toContain('"country"');
    expect(header).toContain('"profileLinks"');

    expect(row).toContain('"app-1"');
    expect(row).toContain('"user@example.com"');
    expect(row).toContain('"Ada Lovelace"');
    expect(row).toContain('"Ada"');
    expect(row).toContain('"Lovelace"');
    expect(row).toContain('"2000-01-02T00:00:00.000Z"');
    expect(row).toContain('"+212600000000"');
    expect(row).toContain('"Bachelor"');
    expect(row).toContain('"UM5"');
    expect(row).toContain('"Rabat"');
    expect(row).toContain('"MA"');
    expect(row).toContain('"https://portfolio.example.com"');
    expect(row).toContain('"ACCEPTED"');
    expect(row).toContain('"vip | intl"');
  });

  it('applies selected application IDs filter for export', async () => {
    const { service, mockPrisma } = createService();

    await service.exportEventApplicationsCsv('event-1', ['app-1']);

    expect(mockPrisma.applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          event_id: 'event-1',
          id: { in: ['app-1'] },
        },
      }),
    );
  });

  it('fails when event does not exist', async () => {
    const { service, mockPrisma } = createService();
    mockPrisma.events.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.exportEventApplicationsCsv('missing-event'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
