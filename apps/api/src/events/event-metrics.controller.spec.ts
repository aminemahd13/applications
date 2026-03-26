import { Permission } from '@event-platform/shared';
import { PERMISSIONS_KEY } from '../common/decorators/require-permission.decorator';
import { EventMetricsController } from './event-metrics.controller';

describe('EventMetricsController', () => {
  it('requires event.update permission on both endpoints', () => {
    const getMetadata = Reflect.getMetadata.bind(Reflect);
    const fieldsPermissions = getMetadata(
      PERMISSIONS_KEY,
      EventMetricsController.prototype.getFields,
    );
    const queryPermissions = getMetadata(
      PERMISSIONS_KEY,
      EventMetricsController.prototype.query,
    );

    expect(fieldsPermissions).toEqual([Permission.EVENT_UPDATE]);
    expect(queryPermissions).toEqual([Permission.EVENT_UPDATE]);
  });

  it('delegates to service for fields and query', async () => {
    const service = {
      getFields: jest.fn().mockResolvedValue({ steps: [] }),
      query: jest.fn().mockResolvedValue({
        totals: {
          matchedApplications: 0,
          submitted: 0,
          inReview: 0,
          accepted: 0,
          waitlisted: 0,
          rejected: 0,
          confirmed: 0,
          checkedIn: 0,
        },
        decisionBreakdown: [],
        currentStepBreakdown: [],
        stepFunnel: [],
        geo: { countries: [], cities: [] },
        ageBuckets: [],
        fieldBreakdown: null,
        timeline: [],
      }),
    };

    const controller = new EventMetricsController(service as any);
    const fields = await controller.getFields('event-id');
    const queried = await controller.query('event-id', {});

    expect(service.getFields).toHaveBeenCalledWith('event-id');
    expect(fields).toEqual({ data: { steps: [] } });
    expect(service.query).toHaveBeenCalledWith(
      'event-id',
      expect.objectContaining({
        recipientFilter: {},
        responseFilters: [],
      }),
    );
    expect(queried).toEqual({
      data: expect.objectContaining({
        totals: expect.any(Object),
      }),
    });
  });
});
