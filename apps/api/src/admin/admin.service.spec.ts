import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService.assignRole', () => {
  let service: AdminService;
  let mockPrisma: any;
  let mockPasswordResetService: any;
  let mockRateLimiterService: any;

  const eventId = '11111111-1111-1111-1111-111111111111';
  const baseUser = {
    id: 'user-1',
    email: 'staff@example.com',
    is_global_admin: false,
    applicant_profiles: { full_name: null },
  };

  beforeEach(() => {
    mockPrisma = {
      events: {
        findFirst: jest.fn().mockResolvedValue({
          id: eventId,
          title: 'Sample Event',
        }),
      },
      users: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      event_role_assignments: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            access_start_at: data?.access_start_at ?? null,
            access_end_at: data?.access_end_at ?? null,
            invite_status: data?.invite_status ?? 'SENT',
            invite_failure_reason: data?.invite_failure_reason ?? null,
            invite_last_attempt_at: data?.invite_last_attempt_at ?? null,
            invite_last_sent_at: data?.invite_last_sent_at ?? null,
            invite_last_expires_at: data?.invite_last_expires_at ?? null,
          }),
        ),
      },
    };

    mockPasswordResetService = {
      sendPasswordSetupInvite: jest.fn().mockResolvedValue({
        invitationSent: true,
      }),
    };

    mockRateLimiterService = {
      revokeUserSessions: jest.fn().mockResolvedValue(0),
    };

    service = new AdminService(
      mockPrisma,
      mockPasswordResetService,
      mockRateLimiterService,
    );
  });

  it('sends invitation when an existing user regains staff access', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(baseUser);
    mockPrisma.event_role_assignments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.event_role_assignments.create.mockResolvedValue({
      id: 'assignment-1',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.assignRole({
      email: baseUser.email,
      role: 'reviewer',
      eventId,
    });

    expect(result.invitationSent).toBe(true);
    expect(mockPasswordResetService.sendPasswordSetupInvite).toHaveBeenCalled();
  });

  it('does not re-send invitation for already active staff users', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(baseUser);
    mockPrisma.event_role_assignments.findFirst
      .mockResolvedValueOnce({ id: 'existing-staff-assignment' })
      .mockResolvedValueOnce(null);
    mockPrisma.event_role_assignments.create.mockResolvedValue({
      id: 'assignment-2',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.assignRole({
      email: baseUser.email,
      role: 'organizer',
      eventId,
    });

    expect(result.invitationSent).toBeUndefined();
    expect(mockPasswordResetService.sendPasswordSetupInvite).not.toHaveBeenCalled();
  });

  it('sends invitation for brand new users created during role assignment', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    mockPrisma.users.create.mockResolvedValue({
      ...baseUser,
      id: 'new-user-1',
    });
    mockPrisma.event_role_assignments.findFirst.mockResolvedValue(null);
    mockPrisma.event_role_assignments.create.mockResolvedValue({
      id: 'assignment-3',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.assignRole({
      email: baseUser.email,
      role: 'checkin_staff',
      eventId,
    });

    expect(result.invitationSent).toBe(true);
    expect(mockPasswordResetService.sendPasswordSetupInvite).toHaveBeenCalledTimes(
      1,
    );
  });
});

describe('AdminService user management', () => {
  let service: AdminService;
  let mockPrisma: any;
  let mockPasswordResetService: any;
  let mockRateLimiterService: any;

  beforeEach(() => {
    mockPrisma = {
      users: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      applicant_profiles: {
        upsert: jest.fn(),
      },
      applications: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
    };

    mockPasswordResetService = {
      sendPasswordSetupInvite: jest.fn(),
    };

    mockRateLimiterService = {
      revokeUserSessions: jest.fn().mockResolvedValue(3),
    };

    service = new AdminService(
      mockPrisma,
      mockPasswordResetService,
      mockRateLimiterService,
    );
  });

  it('returns user detail with role and profile information', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'applicant@example.com',
      is_disabled: false,
      is_global_admin: false,
      email_verified_at: new Date('2026-02-01T00:00:00.000Z'),
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-03-01T00:00:00.000Z'),
      applicant_profiles: {
        first_name: 'Jane',
        last_name: 'Doe',
        full_name: 'Jane Doe',
        phone: '+212600000000',
        education_level: 'Undergraduate',
        institution: 'UM6P',
        city: 'Benguerir',
        country: 'Morocco',
        date_of_birth: new Date('2005-05-01T00:00:00.000Z'),
        links: ['https://example.com'],
      },
      event_role_assignments: [
        {
          id: 'role-1',
          role: 'reviewer',
          access_start_at: null,
          access_end_at: null,
          events: {
            id: 'event-1',
            title: 'Math Camp',
          },
        },
      ],
      _count: {
        event_role_assignments: 1,
      },
    });

    mockPrisma.applications.findMany.mockResolvedValue([
      {
        event_id: 'event-1',
        created_at: new Date('2026-02-05T00:00:00.000Z'),
        updated_at: new Date('2026-02-10T00:00:00.000Z'),
      },
      {
        event_id: 'event-2',
        created_at: new Date('2026-02-15T00:00:00.000Z'),
        updated_at: new Date('2026-02-20T00:00:00.000Z'),
      },
    ]);

    const result = await service.getUserDetail('user-1');

    expect(result.id).toBe('user-1');
    expect(result.profile.fullName).toBe('Jane Doe');
    expect(result.eventRoles).toHaveLength(1);
    expect(result.hasStaffRole).toBe(true);
    expect(result.applicationCount).toBe(2);
    expect(result.eventCount).toBe(2);
  });

  it('updates email, clears verification, and revokes sessions', async () => {
    mockPrisma.users.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'old@example.com',
        is_disabled: false,
        is_global_admin: false,
        applicant_profiles: {
          first_name: 'Jane',
          last_name: 'Doe',
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new@example.com',
        is_disabled: false,
        is_global_admin: false,
        email_verified_at: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
        applicant_profiles: {
          first_name: 'Jane',
          last_name: 'Doe',
          full_name: 'Jane Doe',
          phone: null,
          education_level: null,
          institution: null,
          city: null,
          country: null,
          date_of_birth: null,
          links: [],
        },
        event_role_assignments: [],
        _count: {
          event_role_assignments: 0,
        },
      });
    mockPrisma.users.findFirst.mockResolvedValue(null);
    mockPrisma.users.update.mockResolvedValue({});
    mockPrisma.applications.findMany.mockResolvedValue([]);

    const result = await service.updateUser('admin-1', 'user-1', {
      email: 'new@example.com',
    });

    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          email: 'new@example.com',
          email_verified_at: null,
        }),
      }),
    );
    expect(mockRateLimiterService.revokeUserSessions).toHaveBeenCalledWith(
      'user-1',
    );
    expect(result.sessionsRevoked).toBe(3);
    expect(result.user.email).toBe('new@example.com');
  });

  it('rejects duplicate email updates', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'old@example.com',
      is_disabled: false,
      is_global_admin: false,
      applicant_profiles: {
        first_name: 'Jane',
        last_name: 'Doe',
      },
    });
    mockPrisma.users.findFirst.mockResolvedValue({ id: 'user-2' });

    await expect(
      service.updateUser('admin-1', 'user-1', { email: 'taken@example.com' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('normalizes profile fields and links during update', async () => {
    mockPrisma.users.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        is_disabled: false,
        is_global_admin: false,
        applicant_profiles: {
          first_name: 'Jane',
          last_name: 'Doe',
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        is_disabled: false,
        is_global_admin: false,
        email_verified_at: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
        applicant_profiles: {
          first_name: 'Ada',
          last_name: 'Lovelace',
          full_name: 'Ada Lovelace',
          phone: '+33123456789',
          education_level: 'Masters',
          institution: 'Sorbonne',
          city: 'Paris',
          country: 'France',
          date_of_birth: new Date('2001-01-01T00:00:00.000Z'),
          links: ['https://example.com/profile'],
        },
        event_role_assignments: [],
        _count: {
          event_role_assignments: 0,
        },
      });
    mockPrisma.users.update.mockResolvedValue({});
    mockPrisma.applicant_profiles.upsert.mockResolvedValue({});
    mockPrisma.applications.findMany.mockResolvedValue([]);

    await service.updateUser('admin-1', 'user-1', {
      firstName: '  Ada  ',
      lastName: ' Lovelace ',
      phone: ' +33123456789 ',
      education: ' Masters ',
      institution: ' Sorbonne ',
      city: ' Paris ',
      country: ' France ',
      dateOfBirth: '2001-01-01',
      links: ['https://example.com/profile', '  ', 'https://example.com/profile'],
    });

    expect(mockPrisma.applicant_profiles.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          first_name: 'Ada',
          last_name: 'Lovelace',
          full_name: 'Ada Lovelace',
          phone: '+33123456789',
          education_level: 'Masters',
          institution: 'Sorbonne',
          city: 'Paris',
          country: 'France',
          links: [
            'https://example.com/profile',
            'https://example.com/profile',
          ],
        }),
      }),
    );
  });

  it('revokes sessions when disabling a user account', async () => {
    mockPrisma.users.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        is_disabled: false,
        is_global_admin: false,
        applicant_profiles: {
          first_name: 'Jane',
          last_name: 'Doe',
        },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        is_disabled: true,
        is_global_admin: false,
        email_verified_at: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
        applicant_profiles: {
          first_name: 'Jane',
          last_name: 'Doe',
          full_name: 'Jane Doe',
          phone: null,
          education_level: null,
          institution: null,
          city: null,
          country: null,
          date_of_birth: null,
          links: [],
        },
        event_role_assignments: [],
        _count: {
          event_role_assignments: 0,
        },
      });
    mockPrisma.users.update.mockResolvedValue({});
    mockPrisma.applications.findMany.mockResolvedValue([]);

    const result = await service.updateUser('admin-1', 'user-1', {
      isDisabled: true,
    });

    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          is_disabled: true,
        }),
      }),
    );
    expect(mockRateLimiterService.revokeUserSessions).toHaveBeenCalledWith(
      'user-1',
    );
    expect(result.sessionsRevoked).toBe(3);
  });

  it('rejects self-disable for the acting admin', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      is_disabled: false,
      is_global_admin: true,
      applicant_profiles: {
        first_name: null,
        last_name: null,
      },
    });

    await expect(
      service.updateUser('admin-1', 'admin-1', { isDisabled: true }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects disabling the last enabled global admin', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'admin-2',
      email: 'admin2@example.com',
      is_disabled: false,
      is_global_admin: true,
      applicant_profiles: {
        first_name: null,
        last_name: null,
      },
    });
    mockPrisma.users.count.mockResolvedValue(1);

    await expect(
      service.updateUser('admin-1', 'admin-2', { isDisabled: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('sets a user password and revokes sessions', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.users.update.mockResolvedValue({});

    const result = await service.setUserPassword('user-1', 'new-password-123');

    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          password_hash: expect.any(String),
        }),
      }),
    );
    expect(mockRateLimiterService.revokeUserSessions).toHaveBeenCalledWith(
      'user-1',
    );
    expect(result.sessionsRevoked).toBe(3);
  });

  it('throws when setting password for an unknown user', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);

    await expect(
      service.setUserPassword('missing-user', 'new-password-123'),
    ).rejects.toThrow(NotFoundException);
  });
});
