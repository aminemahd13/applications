import { StepStatus } from '@event-platform/shared';
import { StepStateService } from './step-state.service';

describe('StepStateService', () => {
  it('clears current draft pointer when marking a step approved', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new StepStateService({
      applications: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      application_step_states: {
        updateMany,
      },
    } as any);

    await service.markApproved('app-1', 'step-1');

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { application_id: 'app-1', step_id: 'step-1' },
        data: expect.objectContaining({
          status: StepStatus.APPROVED,
          current_draft_id: null,
        }),
      }),
    );
  });
});
