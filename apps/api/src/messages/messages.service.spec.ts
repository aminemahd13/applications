import { DecisionStatus } from '@event-platform/shared';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      applications: {
        findMany: jest.fn(),
      },
      users: {
        findMany: jest.fn(),
      },
    };

    service = new MessagesService(
      mockPrisma,
      { get: jest.fn() } as any,
      { sendAnnouncement: jest.fn() } as any,
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
});
