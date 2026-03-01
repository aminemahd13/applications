import { ApplicationsService } from './applications.service';
import { ForbiddenException } from '@nestjs/common';

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
