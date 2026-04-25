import { ApplicationsService } from './applications.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DecisionStatus } from '@event-platform/shared';

describe('ApplicationsService completion credentials', () => {
  let service: ApplicationsService;
  let mockPrisma: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.PUBLIC_APP_BASE_URL = 'https://participant.example.com';

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
    delete process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGIN;
    delete process.env.PUBLIC_APP_BASE_URL;
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
    expect(credential.certificateUrl).toMatch(
      /^https:\/\/participant\.example\.com\/credentials\/certificate\//,
    );
    expect(credential.verifiableCredentialUrl).toMatch(
      /^https:\/\/participant\.example\.com\/credentials\/verify\//,
    );
    expect(credential.certificateUrl).toContain('/credentials/certificate/');
    expect(credential.verifiableCredentialUrl).toContain('/credentials/verify/');
    expect(mockPrisma.completion_credentials.create).toHaveBeenCalledTimes(1);
  });

  it('throws an actionable error when strict public app URL cannot be resolved', () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    process.env.APP_BASE_URL = 'http://0.0.0.0:3000';
    process.env.CORS_ORIGINS = 'http://localhost:3000,http://api:3000';
    process.env.CORS_ORIGIN = 'http://127.0.0.1:3000';

    expect(() =>
      (service as any).getCompletionCredentialLinks('certificate-1', 'credential-1'),
    ).toThrow(
      'Set PUBLIC_APP_BASE_URL to the public HTTPS origin',
    );

    delete process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGIN;
  });

  it('requires PUBLIC_APP_BASE_URL for credential links even when APP_BASE_URL is public', () => {
    delete process.env.PUBLIC_APP_BASE_URL;
    process.env.APP_BASE_URL = 'https://apply.example.com';
    process.env.CORS_ORIGINS = 'https://participant.example.com';

    expect(() =>
      (service as any).getCompletionCredentialLinks('certificate-1', 'credential-1'),
    ).toThrow('Set PUBLIC_APP_BASE_URL to the public HTTPS origin');

    delete process.env.CORS_ORIGINS;
  });

  it('emits participant QR and PDF links on the canonical public host', () => {
    const rows = [
      {
        id: 'issued-1',
        certificate_id: 'certificate-1',
        credential_id: 'credential-1',
        certificate_type_key: 'participation',
        certificate_type_label: 'Participation',
        qr_token: 'qr-token-1',
        issued_at: new Date('2026-02-18T12:00:00.000Z'),
        released_at: new Date('2026-02-18T12:01:00.000Z'),
        revoked_at: null,
        status: 'ISSUED',
        render_status: 'DONE',
        pdf_storage_key: 'events/event-1/certificates/pdf/certificate-1.pdf',
      },
    ];

    const [entry] = (service as any).toApplicationIssuedCertificates(rows, {
      hideUnreleased: false,
      isCheckedIn: true,
    });

    expect(entry.certificateUrl).toBe(
      'https://participant.example.com/credentials/certificate/certificate-1',
    );
    expect(entry.verifiableCredentialUrl).toBe(
      'https://participant.example.com/credentials/verify/credential-1',
    );
    expect(entry.qrVerificationUrl).toBe(
      'https://participant.example.com/credentials/qr/qr-token-1',
    );
    expect(entry.pdfUrl).toBe(
      'https://participant.example.com/credentials/certificate/certificate-1/pdf',
    );
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
          AND: expect.arrayContaining([{ tags: { hasEvery: ['vip', 'intl'] } }]),
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
  beforeEach(() => {
    process.env.PUBLIC_APP_BASE_URL = 'https://participant.example.com';
  });

  afterEach(() => {
    delete process.env.PUBLIC_APP_BASE_URL;
    delete process.env.APP_BASE_URL;
    delete process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGIN;
  });

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

  it('hides issued certificates for applicant before check-in/release', async () => {
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
          application_step_states: [],
          attendance_records: {
            status: 'CONFIRMED',
            checked_in_at: null,
          },
          completion_credentials: null,
          issued_certificates: [
            {
              id: 'issued-1',
              certificate_id: 'cert-1',
              credential_id: 'cred-1',
              certificate_type_key: 'participation',
              certificate_type_label: 'Participation',
              qr_token: 'qr-1',
              issued_at: now,
              released_at: null,
              revoked_at: null,
              status: 'ISSUED',
              render_status: 'DONE',
              pdf_storage_key: 'events/event-1/certificates/pdf/cert-1.pdf',
            },
          ],
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

    expect(result?.certificates ?? []).toEqual([]);
  });

  it('shows released convocation certificates for applicant before check-in', async () => {
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
          application_step_states: [],
          attendance_records: {
            status: 'CONFIRMED',
            checked_in_at: null,
          },
          completion_credentials: null,
          issued_certificates: [
            {
              id: 'issued-1',
              certificate_id: 'cert-1',
              credential_id: 'cred-1',
              certificate_type_key: 'convocation',
              certificate_type_label: 'Convocation',
              qr_token: 'qr-1',
              issued_at: now,
              released_at: now,
              revoked_at: null,
              status: 'ISSUED',
              render_status: 'DONE',
              pdf_storage_key: 'events/event-1/certificates/pdf/cert-1.pdf',
            },
          ],
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

    expect(result?.certificates?.length).toBe(1);
    expect(result?.certificates?.[0]?.certificateId).toBe('cert-1');
    expect(result?.certificates?.[0]?.certificateTypeKey).toBe('convocation');
  });

  it('shows issued certificates for applicant after check-in and release', async () => {
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
          application_step_states: [],
          attendance_records: {
            status: 'CHECKED_IN',
            checked_in_at: now,
          },
          completion_credentials: null,
          issued_certificates: [
            {
              id: 'issued-1',
              certificate_id: 'cert-1',
              credential_id: 'cred-1',
              certificate_type_key: 'participation',
              certificate_type_label: 'Participation',
              qr_token: 'qr-1',
              issued_at: now,
              released_at: now,
              revoked_at: null,
              status: 'ISSUED',
              render_status: 'DONE',
              pdf_storage_key: 'events/event-1/certificates/pdf/cert-1.pdf',
            },
          ],
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

    expect(result?.certificates?.length).toBe(1);
    expect(result?.certificates?.[0]?.certificateId).toBe('cert-1');
  });

  it('shows issued certificates when checked-in status exists without timestamp', async () => {
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
          application_step_states: [],
          attendance_records: {
            status: 'CHECKED_IN',
            checked_in_at: null,
          },
          completion_credentials: null,
          issued_certificates: [
            {
              id: 'issued-1',
              certificate_id: 'cert-1',
              credential_id: 'cred-1',
              certificate_type_key: 'participation',
              certificate_type_label: 'Participation',
              qr_token: 'qr-1',
              issued_at: now,
              released_at: now,
              revoked_at: null,
              status: 'ISSUED',
              render_status: 'DONE',
              pdf_storage_key: 'events/event-1/certificates/pdf/cert-1.pdf',
            },
          ],
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

    expect(result?.certificates?.length).toBe(1);
    expect(result?.certificates?.[0]?.certificateId).toBe('cert-1');
  });

  it('selects released_at when fetching applicant certificates', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'app-1' })
      .mockResolvedValueOnce(null);
    const mockPrisma = {
      applications: {
        findFirst,
      },
    };
    const mockCls = {
      get: jest.fn((key: string) => (key === 'actorId' ? 'user-1' : undefined)),
    };
    const stepStateService = {
      ensureStepStates: jest.fn().mockResolvedValue(true),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      mockCls as any,
      stepStateService as any,
    );

    await service.findMyApplication('event-1');

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(
      findFirst.mock.calls[0][0].include.issued_certificates.select.released_at,
    ).toBe(true);
    expect(
      findFirst.mock.calls[1][0].include.issued_certificates.select.released_at,
    ).toBe(true);
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

  it('applies SUBMITTED when a submission version exists and resolves open needs-info requests', async () => {
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      needs_info_requests: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const stepStateService = {
      manualUnlock: jest.fn(),
      markApproved: jest.fn(),
      markNeedsRevision: jest.fn(),
      recomputeAllStepStates: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      stepStateService as any,
    );

    const result = await service.bulkStepAction('event-1', {
      applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
      stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
      action: 'SUBMITTED',
    });

    expect(mockPrisma.application_step_states.updateMany).toHaveBeenCalledWith({
      where: {
        application_id: 'app-1',
        step_id: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        latest_submission_version_id: { not: null },
      },
      data: {
        status: 'SUBMITTED',
        current_draft_id: null,
        last_activity_at: expect.any(Date),
      },
    });
    expect(stepStateService.recomputeAllStepStates).toHaveBeenCalledWith('app-1');
    expect(mockPrisma.needs_info_requests.updateMany).toHaveBeenCalledWith({
      where: {
        application_id: 'app-1',
        step_id: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        status: 'OPEN',
      },
      data: {
        status: 'RESOLVED',
        resolved_at: expect.any(Date),
      },
    });
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
    process.env.PUBLIC_APP_BASE_URL = 'https://participant.example.com';
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.APP_BASE_URL;
    delete process.env.PUBLIC_APP_BASE_URL;
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
    expect(row).toContain("\"'+212600000000\"");
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

    await service.exportEventApplicationsCsv('event-1', {
      applicationIds: ['app-1'],
    });

    expect(mockPrisma.applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          event_id: 'event-1',
          id: { in: ['app-1'] },
        },
      }),
    );
  });

  it('respects requested core columns and portal link selection', async () => {
    const { service } = createService();

    const result = await service.exportEventApplicationsCsv('event-1', {
      columns: ['applicationId', 'applicationPath', 'applicationUrl'],
      includeResponseColumns: false,
      portal: 'admin',
    });

    const lines = result.csv.split('\n');
    expect(lines[0]).toContain('"applicationId"');
    expect(lines[0]).toContain('"applicationPath"');
    expect(lines[0]).toContain('"applicationUrl"');
    expect(lines[0]).not.toContain('"decisionStatus"');
    expect(lines[1]).toContain('"/admin/events/event-1/applications/app-1"');
    expect(lines[1]).toContain(
      '"https://platform.example.com/admin/events/event-1/applications/app-1"',
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

describe('ApplicationsService boolean query semantics', () => {
  const now = new Date('2026-03-10T10:00:00.000Z');

  function createApplicationRecord(input: {
    id: string;
    decisionStatus: string;
    stepStatus: string;
    tags?: string[];
  }) {
    return {
      id: input.id,
      event_id: 'event-1',
      applicant_user_id: `${input.id}-user`,
      decision_status: input.decisionStatus,
      decision_published_at: null,
      tags: input.tags ?? [],
      created_at: now,
      updated_at: now,
      assigned_reviewer_id: null,
      users_applications_applicant_user_idTousers: {
        email: `${input.id}@example.com`,
        applicant_profiles: {
          first_name: 'Ada',
          last_name: 'Lovelace',
          full_name: 'Ada Lovelace',
        },
      },
      application_step_states: [
        {
          step_id: 'step-1',
          status: input.stepStatus,
          current_draft_id: null,
          latest_submission_version_id: null,
          workflow_steps: { step_index: 0 },
        },
      ],
      attendance_records: null,
    };
  }

  it('combines DB-supported and computed conditions with AND', async () => {
    const match = createApplicationRecord({
      id: 'app-match',
      decisionStatus: 'ACCEPTED',
      stepStatus: 'NEEDS_REVISION',
    });
    const dbOnly = createApplicationRecord({
      id: 'app-db-only',
      decisionStatus: 'ACCEPTED',
      stepStatus: 'SUBMITTED',
    });
    const computedOnly = createApplicationRecord({
      id: 'app-computed-only',
      decisionStatus: 'NONE',
      stepStatus: 'NEEDS_REVISION',
    });

    const mockPrisma = {
      applications: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([match, dbOnly, computedOnly]),
      },
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    const result = await service.query('event-1', {
      limit: 50,
      order: 'desc',
      filterTree: {
        type: 'group',
        mode: 'all',
        children: [
          { type: 'decision_status', values: ['ACCEPTED'] },
          { type: 'needs_revision', value: true },
        ],
      },
    } as any);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('app-match');
    expect(result.meta.total).toBe(1);
  });

  it('keeps nextCursor stable for selective computed filters', async () => {
    const firstMatch = createApplicationRecord({
      id: 'app-z',
      decisionStatus: 'NONE',
      stepStatus: 'NEEDS_REVISION',
    });
    const nonMatch = createApplicationRecord({
      id: 'app-y',
      decisionStatus: 'NONE',
      stepStatus: 'SUBMITTED',
    });
    const secondMatch = createApplicationRecord({
      id: 'app-x',
      decisionStatus: 'NONE',
      stepStatus: 'NEEDS_REVISION',
    });

    const mockPrisma = {
      applications: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'app-z',
          updated_at: now,
        }),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([firstMatch, nonMatch, secondMatch])
          .mockResolvedValueOnce([nonMatch, secondMatch]),
      },
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    const first = await service.query('event-1', {
      limit: 1,
      order: 'desc',
      filterTree: {
        type: 'group',
        mode: 'all',
        children: [{ type: 'needs_revision', value: true }],
      },
    } as any);

    expect(first.data).toHaveLength(1);
    expect(first.data[0]?.id).toBe('app-z');
    expect(first.meta.hasMore).toBe(true);
    expect(first.meta.nextCursor).toBe('app-z');
    expect(first.meta.total).toBe(2);

    const second = await service.query('event-1', {
      limit: 1,
      order: 'desc',
      cursor: first.meta.nextCursor ?? undefined,
      filterTree: {
        type: 'group',
        mode: 'all',
        children: [{ type: 'needs_revision', value: true }],
      },
    } as any);

    expect(second.data).toHaveLength(1);
    expect(second.data[0]?.id).toBe('app-x');
    expect(second.meta.hasMore).toBe(false);
    expect(second.meta.nextCursor).toBeNull();
    expect(second.meta.total).toBeUndefined();
  });
});

describe('ApplicationsService saved view authorization', () => {
  const defaultPayload = {
    kind: 'applications',
    version: 1,
    mode: 'advanced',
    filterTree: {
      type: 'group',
      mode: 'all',
      children: [],
    },
  };

  function createServiceWithContext(params: {
    actorId: string;
    isGlobalAdmin?: boolean;
    organizerRole?: boolean;
    ownerId: string;
  }) {
    const mockPrisma = {
      review_queue_saved_views: {
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      event_role_assignments: {
        findFirst: jest.fn().mockResolvedValue(
          params.organizerRole ? { id: 'role-1' } : null,
        ),
      },
    };
    const mockCls = {
      get: jest.fn((key: string) => {
        if (key === 'actorId') return params.actorId;
        if (key === 'isGlobalAdmin') return Boolean(params.isGlobalAdmin);
        return undefined;
      }),
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      mockCls as any,
      {} as any,
    );

    const existing = {
      id: 'view-1',
      event_id: 'event-1',
      user_id: params.ownerId,
      name: 'My View',
      filters: defaultPayload,
      created_at: new Date('2026-03-10T10:00:00.000Z'),
      updated_at: new Date('2026-03-10T10:00:00.000Z'),
      users: {
        id: params.ownerId,
        email: 'owner@example.com',
        applicant_profiles: { full_name: 'Owner' },
      },
    };
    mockPrisma.review_queue_saved_views.findFirst.mockResolvedValue(existing);
    mockPrisma.review_queue_saved_views.update.mockResolvedValue(existing);
    return { service, mockPrisma };
  }

  it('allows the creator to update their saved view', async () => {
    const { service, mockPrisma } = createServiceWithContext({
      actorId: 'owner-1',
      ownerId: 'owner-1',
      organizerRole: false,
    });

    const result = await service.updateSavedView('event-1', 'view-1', {
      mode: 'advanced',
      filterTree: {
        type: 'group',
        mode: 'all',
        children: [],
      },
    } as any);

    expect(result.id).toBe('view-1');
    expect(mockPrisma.event_role_assignments.findFirst).not.toHaveBeenCalled();
  });

  it('blocks non-creator non-organizer edits', async () => {
    const { service } = createServiceWithContext({
      actorId: 'reviewer-1',
      ownerId: 'owner-1',
      organizerRole: false,
    });

    await expect(
      service.updateSavedView('event-1', 'view-1', {
        mode: 'advanced',
        filterTree: {
          type: 'group',
          mode: 'all',
          children: [],
        },
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows organizers to delete another user view', async () => {
    const { service, mockPrisma } = createServiceWithContext({
      actorId: 'organizer-1',
      ownerId: 'owner-1',
      organizerRole: true,
    });
    mockPrisma.review_queue_saved_views.findFirst.mockResolvedValue({
      id: 'view-1',
      user_id: 'owner-1',
      filters: defaultPayload,
    });

    await service.deleteSavedView('event-1', 'view-1');

    expect(mockPrisma.review_queue_saved_views.delete).toHaveBeenCalledWith({
      where: { id: 'view-1' },
    });
  });
});

describe('ApplicationsService resolveByEmails', () => {
  function createService() {
    const mockPrisma = {
      applications: {
        findMany: jest.fn(),
      },
    };
    const service = new ApplicationsService(
      mockPrisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );
    return { service, mockPrisma };
  }

  it('normalizes, dedupes, and returns unmatched emails', async () => {
    const { service, mockPrisma } = createService();
    mockPrisma.applications.findMany.mockResolvedValue([
      {
        id: '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
        applicant_user_id: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        users_applications_applicant_user_idTousers: {
          email: 'Target@Example.com',
        },
      },
    ]);

    const result = await service.resolveByEmails('event-1', [
      'TARGET@example.com',
      'target@example.com',
      'missing@example.com',
    ]);

    expect(mockPrisma.applications.findMany).toHaveBeenCalledWith({
      where: {
        event_id: 'event-1',
        users_applications_applicant_user_idTousers: {
          is: {
            email: { in: ['target@example.com', 'missing@example.com'] },
          },
        },
      },
      select: {
        id: true,
        applicant_user_id: true,
        users_applications_applicant_user_idTousers: {
          select: { email: true },
        },
      },
    });

    expect(result).toEqual({
      applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
      userIds: ['d8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a'],
      matchedEmails: ['target@example.com'],
      unmatchedEmails: ['missing@example.com'],
    });
  });

  it('dedupes applicationIds, userIds, and matchedEmails', async () => {
    const { service, mockPrisma } = createService();
    mockPrisma.applications.findMany.mockResolvedValue([
      {
        id: 'app-1',
        applicant_user_id: 'user-1',
        users_applications_applicant_user_idTousers: { email: 'A@example.com' },
      },
      {
        id: 'app-1',
        applicant_user_id: 'user-1',
        users_applications_applicant_user_idTousers: { email: 'a@example.com' },
      },
      {
        id: 'app-2',
        applicant_user_id: 'user-1',
        users_applications_applicant_user_idTousers: { email: 'a@example.com' },
      },
    ]);

    const result = await service.resolveByEmails('event-1', ['a@example.com']);

    expect(result).toEqual({
      applicationIds: ['app-1', 'app-2'],
      userIds: ['user-1'],
      matchedEmails: ['a@example.com'],
      unmatchedEmails: [],
    });
  });
});

describe('ApplicationsService decision template variables', () => {
  function createTemplateService() {
    const mockPrisma = {
      events: {
        findUnique: jest.fn(),
      },
      decision_templates: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      applications: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const mockCls = {
      get: jest.fn((key: string) =>
        key === 'actorId' ? 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a' : undefined,
      ),
    };
    const stepStateService = {
      recomputeAllStepStates: jest.fn(),
    };

    const service = new ApplicationsService(
      mockPrisma as any,
      mockCls as any,
      stepStateService as any,
    );
    jest.spyOn(service as any, 'findById').mockResolvedValue({
      id: '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
    });

    return { service, mockPrisma, stepStateService };
  }

  it('rejects dotted placeholders when creating decision templates', async () => {
    const { service, mockPrisma } = createTemplateService();
    mockPrisma.events.findUnique.mockResolvedValue({ id: 'event-1' });

    await expect(
      service.createDecisionTemplate('event-1', {
        name: 'Accepted template',
        status: DecisionStatus.ACCEPTED,
        subjectTemplate: 'Decision for {{event.title}}',
        bodyTemplate: 'Hello {{applicantName}}',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.decision_templates.create).not.toHaveBeenCalled();
  });

  it('rejects dotted placeholders when updating decision templates', async () => {
    const { service, mockPrisma } = createTemplateService();
    mockPrisma.decision_templates.findFirst.mockResolvedValue({ id: 'template-1' });

    await expect(
      service.updateDecisionTemplate('event-1', 'template-1', {
        bodyTemplate: 'Hello {{applicant.name}}',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.decision_templates.update).not.toHaveBeenCalled();
  });

  it('keeps unresolved legacy placeholders and records warning metadata in drafts', async () => {
    const { service, mockPrisma } = createTemplateService();
    mockPrisma.events.findUnique.mockResolvedValue({
      id: 'event-1',
      title: 'Math Event',
      slug: 'math-event',
      decision_config: {},
    });
    mockPrisma.applications.findFirst.mockResolvedValue({
      id: '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
      users_applications_applicant_user_idTousers: {
        email: 'applicant@example.com',
        applicant_profiles: {
          full_name: 'Ada Lovelace',
        },
      },
    });
    mockPrisma.decision_templates.findFirst.mockResolvedValue({
      id: 'template-1',
      name: 'Legacy accepted',
      status: DecisionStatus.ACCEPTED,
      subject_template: 'Decision for {{event.title}}',
      body_template: 'Hello {{applicantName}}, status: {{decision.status}}',
    });
    mockPrisma.applications.update.mockResolvedValue({});

    await service.setDecision(
      'event-1',
      '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
      DecisionStatus.ACCEPTED,
      true,
      'template-1',
    );

    const decisionDraft =
      mockPrisma.applications.update.mock.calls[0][0]?.data?.decision_draft;
    expect(decisionDraft.rendered.subject).toContain('{{event.title}}');
    expect(decisionDraft.rendered.body).toContain('{{decision.status}}');
    expect(decisionDraft.rendered.body).toContain('Ada Lovelace');
    expect(decisionDraft.warnings).toEqual(
      expect.objectContaining({
        unresolvedVariables: expect.arrayContaining([
          'event.title',
          'decision.status',
        ]),
      }),
    );
  });
});
