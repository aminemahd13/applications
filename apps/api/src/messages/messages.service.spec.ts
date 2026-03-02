import { DecisionStatus, MessageType } from '@event-platform/shared';
import { MessagesService } from './messages.service';
import { NotFoundException } from '@nestjs/common';

describe('MessagesService', () => {
  let service: MessagesService;
  let mockPrisma: any;
  let mockEmailService: any;

  beforeEach(() => {
    mockPrisma = {
      applications: {
        findMany: jest.fn(),
      },
      users: {
        findMany: jest.fn(),
      },
      messages: {
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      message_recipients: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn(),
      },
    };
    mockEmailService = {
      sendAnnouncement: jest.fn(),
    };

    service = new MessagesService(
      mockPrisma,
      { get: jest.fn() } as any,
      mockEmailService,
    );
  });

  describe('evaluateFilter', () => {
    it('targets only explicit email recipients for direct filters', async () => {
      mockPrisma.users.findMany.mockResolvedValue([{ id: 'target-user' }]);

      const recipients = await service.evaluateFilter('event-1', {
        emails: ['Target@Example.com'],
      });

      expect(recipients).toEqual(['target-user']);
      expect(mockPrisma.applications.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.users.findMany).toHaveBeenCalledWith({
        where: { email: { in: ['target@example.com'] } },
        select: { id: true },
      });
    });

    it('includes all event applicants when filter is empty', async () => {
      mockPrisma.applications.findMany.mockResolvedValue([
        { id: 'app-1', applicant_user_id: 'user-1' },
        { id: 'app-2', applicant_user_id: 'user-2' },
      ]);

      const recipients = await service.evaluateFilter('event-1', {});

      expect(recipients).toEqual(['user-1', 'user-2']);
      expect(mockPrisma.applications.findMany).toHaveBeenCalledWith({
        where: { event_id: 'event-1' },
        select: { id: true, applicant_user_id: true },
      });
    });

    it('unions segmented recipients with explicit user ids', async () => {
      mockPrisma.applications.findMany.mockResolvedValue([
        { id: 'app-1', applicant_user_id: 'segmented-user' },
      ]);

      const recipients = await service.evaluateFilter('event-1', {
        decisionStatus: [DecisionStatus.ACCEPTED],
        userIds: ['manual-user'],
      });

      expect(recipients).toEqual(['segmented-user', 'manual-user']);
    });

    it('builds demographic filters with explicit relation wrappers and DOB bounds', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-02T12:00:00.000Z'));
      mockPrisma.applications.findMany.mockResolvedValue([]);

      await service.evaluateFilter('event-1', {
        ageMin: 18,
        ageMax: 30,
        country: ['MA'],
        city: ['Rabat'],
        educationLevel: ['Bachelor'],
      } as any);

      const where = mockPrisma.applications.findMany.mock.calls[0][0].where;
      expect(where.event_id).toBe('event-1');
      expect(where.AND).toEqual(
        expect.arrayContaining([
          {
            users_applications_applicant_user_idTousers: {
              is: {
                applicant_profiles: {
                  is: { country: { in: ['MA'] } },
                },
              },
            },
          },
          {
            users_applications_applicant_user_idTousers: {
              is: {
                applicant_profiles: {
                  is: { education_level: { in: ['Bachelor'] } },
                },
              },
            },
          },
        ]),
      );

      const dobFilter = where.AND.find(
        (condition: any) =>
          condition?.users_applications_applicant_user_idTousers?.is
            ?.applicant_profiles?.is?.date_of_birth,
      );
      expect(
        dobFilter.users_applications_applicant_user_idTousers.is
          .applicant_profiles.is.date_of_birth,
      ).toEqual({
        gte: new Date('1995-03-03T00:00:00.000Z'),
        lte: new Date('2008-03-02T00:00:00.000Z'),
      });

      jest.useRealTimers();
    });
  });

  describe('evaluateSystemFilter', () => {
    it('uses explicit applicant profile relation wrappers', async () => {
      mockPrisma.users.findMany.mockResolvedValue([]);

      await service.evaluateSystemFilter({
        country: ['MA'],
        city: ['Rabat'],
        educationLevel: ['Bachelor'],
      } as any);

      const where = mockPrisma.users.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([
          {
            applicant_profiles: {
              is: { country: { in: ['MA'] } },
            },
          },
          {
            applicant_profiles: {
              is: {
                city: { in: ['Rabat'], mode: 'insensitive' },
              },
            },
          },
          {
            applicant_profiles: {
              is: { education_level: { in: ['Bachelor'] } },
            },
          },
        ]),
      );
    });
  });

  describe('processQueuedEmails', () => {
    it('falls back to bodyText when bodyRich is plain text', async () => {
      mockPrisma.message_recipients.findMany.mockResolvedValue([
        {
          id: 'recipient-1',
          message_id: 'message-1',
          email_attempts: 0,
          users: { email: 'target@example.com' },
          messages: {
            title: 'Subject line',
            body_rich: 'Plain body from composer',
            body_text: 'Plain body from composer',
            action_buttons: [],
          },
        },
      ]);
      mockPrisma.message_recipients.updateMany.mockResolvedValue({ count: 1 });
      mockEmailService.sendAnnouncement.mockResolvedValue(undefined);

      const result = await service.processQueuedEmails(10);

      expect(result).toEqual({ attempted: 1, sent: 1, failed: 0 });
      expect(mockEmailService.sendAnnouncement).toHaveBeenCalledWith(
        'target@example.com',
        'Subject line',
        '<p>Plain body from composer</p>',
        [],
      );
    });
  });

  describe('deleteMessage', () => {
    it('deletes an event-scoped message', async () => {
      mockPrisma.messages.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.deleteMessage('event-1', 'message-1'),
      ).resolves.toBeUndefined();

      expect(mockPrisma.messages.deleteMany).toHaveBeenCalledWith({
        where: { id: 'message-1', event_id: 'event-1' },
      });
    });

    it('throws when message does not exist in event scope', async () => {
      mockPrisma.messages.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteMessage('event-1', 'missing-message'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('system announcements scoping', () => {
    it('lists only null-event announcement messages', async () => {
      mockPrisma.messages.findMany.mockResolvedValue([]);

      await service.listSystemAnnouncements({ limit: 10 } as any);

      expect(mockPrisma.messages.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event_id: null, type: MessageType.ANNOUNCEMENT },
        }),
      );
    });

    it('deletes only null-event announcement messages', async () => {
      mockPrisma.messages.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.deleteSystemAnnouncement('message-1'),
      ).resolves.toBeUndefined();

      expect(mockPrisma.messages.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'message-1',
          event_id: null,
          type: MessageType.ANNOUNCEMENT,
        },
      });
    });
  });
});
