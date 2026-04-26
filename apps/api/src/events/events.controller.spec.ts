import { ZodError } from 'zod';
import { EventsController } from './events.controller';

describe('EventsController', () => {
  it('parses and forwards clone payload to service', async () => {
    const eventsService = {
      clone: jest.fn().mockResolvedValue({ id: 'event-2' }),
    };
    const controller = new EventsController(eventsService as any);

    const result = await controller.clone({
      sourceEventId: '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
      title: 'Cloned Event',
      slug: 'cloned-event',
    });

    expect(eventsService.clone).toHaveBeenCalledWith({
      sourceEventId: '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
      title: 'Cloned Event',
      slug: 'cloned-event',
    });
    expect(result).toEqual({ data: { id: 'event-2' } });
  });

  it('validates clone payload with schema', async () => {
    const eventsService = {
      clone: jest.fn(),
    };
    const controller = new EventsController(eventsService as any);

    await expect(
      controller.clone({
        sourceEventId: 'not-a-uuid',
        title: '',
        slug: 'invalid slug',
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(eventsService.clone).not.toHaveBeenCalled();
  });
});
