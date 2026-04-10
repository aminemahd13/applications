import { StepStatus } from '@event-platform/shared';
import { StepStateService } from './step-state.service';

describe('StepStateService', () => {
  function createHarness() {
    const prisma = {
      applications: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      application_step_states: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'state-1',
          revision_cycle_count: 1,
        }),
        update: jest.fn().mockResolvedValue({ id: 'state-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      workflow_steps: {
        findUnique: jest.fn().mockResolvedValue({
          step_index: 2,
          strict_gating: true,
          allow_next_steps_while_revising: false,
          revision_deadline_at: null,
        }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const service = new StepStateService(prisma as any);
    return { service, prisma };
  }

  it('clears current draft pointer when marking a step approved', async () => {
    const { service, prisma } = createHarness();

    await service.markApproved('app-1', 'step-1');

    expect(prisma.application_step_states.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { application_id: 'app-1', step_id: 'step-1' },
        data: expect.objectContaining({
          status: StepStatus.APPROVED,
          current_draft_id: null,
          revision_deadline_at: null,
        }),
      }),
    );
  });

  it('locks downstream steps when strict gating is enabled and revision pass-through is disabled', async () => {
    const { service, prisma } = createHarness();
    const lockSpy = jest
      .spyOn(service as any, 'lockDownstreamSteps')
      .mockResolvedValue(undefined);

    await service.markNeedsRevision('app-1', 'step-1');

    expect(lockSpy).toHaveBeenCalledWith('app-1', 2);
    expect(prisma.application_step_states.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StepStatus.NEEDS_REVISION,
          revision_cycle_count: 2,
          revision_deadline_at: null,
        }),
      }),
    );
  });

  it('keeps downstream access and applies default revision deadline when pass-through is enabled', async () => {
    const { service, prisma } = createHarness();
    const lockSpy = jest
      .spyOn(service as any, 'lockDownstreamSteps')
      .mockResolvedValue(undefined);
    const configuredDeadline = new Date('2026-06-01T00:00:00.000Z');

    prisma.workflow_steps.findUnique.mockResolvedValue({
      step_index: 2,
      strict_gating: true,
      allow_next_steps_while_revising: true,
      revision_deadline_at: configuredDeadline,
    });

    await service.markNeedsRevision('app-1', 'step-1');

    expect(lockSpy).not.toHaveBeenCalled();
    expect(prisma.application_step_states.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revision_deadline_at: configuredDeadline,
        }),
      }),
    );
  });

  it('uses reviewer-provided revision deadline override when supplied', async () => {
    const { service, prisma } = createHarness();
    const overrideDeadline = new Date('2026-04-20T12:30:00.000Z');

    await service.markNeedsRevision('app-1', 'step-1', {
      revisionDeadlineAt: overrideDeadline,
    });

    expect(prisma.application_step_states.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revision_deadline_at: overrideDeadline,
        }),
      }),
    );
  });
});
