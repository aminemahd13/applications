import { NotFoundException } from '@nestjs/common';
import { CheckinService } from './checkin.service';

describe('CheckinService attendees list and export', () => {
  const mockEvent = {
    id: 'event-1',
    slug: 'math-maroc-2026',
    title: 'Math & Maroc 2026',
  };

  const mockApplication = {
    id: 'app-1',
    event_id: 'event-1',
    applicant_user_id: 'user-1',
    decision_status: 'ACCEPTED',
    tags: ['campus-rabat', 'vip'],
    created_at: new Date('2026-03-01T09:00:00.000Z'),
    updated_at: new Date('2026-03-03T09:00:00.000Z'),
    attendance_records: {
      status: 'CHECKED_IN',
      checked_in_at: new Date('2026-03-04T10:30:00.000Z'),
      checked_in_by: 'staff-1',
      users: { email: 'staff@example.com' },
    },
    users_applications_applicant_user_idTousers: {
      email: 'attendee@example.com',
      applicant_profiles: {
        first_name: 'Ada',
        last_name: 'Lovelace',
        full_name: 'Ada Lovelace',
      },
    },
  };

  function createService() {
    const prisma = {
      events: {
        findUnique: jest.fn().mockResolvedValue(mockEvent),
      },
      applications: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const service = new CheckinService(
      prisma as any,
      { get: jest.fn() } as any,
      {} as any,
    );
    return { service, prisma };
  }

  beforeEach(() => {
    process.env.APP_BASE_URL = 'https://platform.example.com';
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
  });

  it('lists attendees with tags and meta counters', async () => {
    const { service, prisma } = createService();
    prisma.applications.findMany
      .mockResolvedValueOnce([mockApplication])
      .mockResolvedValueOnce([{ tags: ['campus-rabat', 'vip'] }]);
    prisma.applications.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(5);

    const result = await service.listAttendees('event-1', {
      status: 'all',
      search: 'ada',
      tags: ['campus-rabat'],
      page: 1,
      pageSize: 50,
    });

    expect(result.meta.total).toBe(12);
    expect(result.meta.checkedIn).toBe(7);
    expect(result.meta.notCheckedIn).toBe(5);
    expect(result.meta.availableTags).toEqual(['campus-rabat', 'vip']);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        applicationId: 'app-1',
        applicantName: 'Ada Lovelace',
        isCheckedIn: true,
      }),
    );
    expect(prisma.applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { tags: { hasEvery: ['campus-rabat'] } },
          ]),
        }),
      }),
    );
  });

  it('exports attendees CSV with selected columns and admin links', async () => {
    const { service, prisma } = createService();
    prisma.applications.findMany.mockResolvedValueOnce([mockApplication]);

    const result = await service.exportAttendeesCsv('event-1', {
      status: 'checked_in',
      tags: ['campus-rabat'],
      search: undefined,
      columns: ['applicationId', 'isCheckedIn', 'applicationUrl'],
      portal: 'admin',
    });

    expect(result.filename).toBe('checkin-attendees-math-maroc-2026.csv');
    const lines = result.csv.split('\n');
    expect(lines[0]).toContain('"applicationId"');
    expect(lines[0]).toContain('"isCheckedIn"');
    expect(lines[0]).toContain('"applicationUrl"');
    expect(lines[1]).toContain('"app-1"');
    expect(lines[1]).toContain('"true"');
    expect(lines[1]).toContain(
      '"https://platform.example.com/admin/events/event-1/applications/app-1"',
    );
    expect(prisma.applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { tags: { hasEvery: ['campus-rabat'] } },
            { attendance_records: { is: { status: 'CHECKED_IN' } } },
          ]),
        }),
      }),
    );
  });

  it('throws when event is missing', async () => {
    const { service, prisma } = createService();
    prisma.events.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.listAttendees('missing-event', {
        status: 'all',
        search: undefined,
        tags: undefined,
        page: 1,
        pageSize: 50,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

