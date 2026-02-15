import { AdminService } from './admin.service';

describe('AdminService.assignRole', () => {
  let service: AdminService;
  let mockPrisma: any;
  let mockPasswordResetService: any;

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
      },
    };

    mockPasswordResetService = {
      sendPasswordSetupInvite: jest.fn().mockResolvedValue({
        invitationSent: true,
      }),
    };

    service = new AdminService(mockPrisma, mockPasswordResetService);
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
