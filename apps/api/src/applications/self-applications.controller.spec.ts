import { SelfApplicationsController } from './self-applications.controller';

describe('SelfApplicationsController', () => {
  it('lists only applications for published events', async () => {
    const cls = {
      get: jest.fn((key: string) => (key === 'actorId' ? 'user-1' : undefined)),
    };
    const prisma = {
      applications: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'app-1',
            decision_status: 'ACCEPTED',
            decision_published_at: new Date('2026-02-18T10:00:00.000Z'),
            updated_at: new Date('2026-02-18T10:00:00.000Z'),
            events: {
              id: 'event-1',
              title: 'Event One',
              slug: 'event-one',
              start_at: null,
              venue_name: null,
            },
            application_step_states: [],
          },
        ]),
      },
    };

    const controller = new SelfApplicationsController(
      cls as any,
      prisma as any,
    );

    const result = await controller.listMyApplications();

    expect(prisma.applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          applicant_user_id: 'user-1',
          events: { is: { status: 'published' } },
        },
      }),
    );
    expect(result).toEqual({
      applications: [
        expect.objectContaining({
          id: 'app-1',
          eventId: 'event-1',
          eventSlug: 'event-one',
          decisionStatus: 'ACCEPTED',
        }),
      ],
    });
  });
});
