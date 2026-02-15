import { DecisionStatus } from '@event-platform/shared';
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
      },
      message_recipients: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
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
});
