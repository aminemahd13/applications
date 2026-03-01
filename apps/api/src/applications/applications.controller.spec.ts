import { NotFoundException } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';

describe('ApplicationsController applicant step visibility', () => {
  function createController(stepIds: string[]) {
    const applicationsService = {
      findMyApplication: jest.fn().mockResolvedValue({
        id: 'app-1',
        stepStates: stepIds.map((stepId) => ({ stepId })),
      }),
    };
    const stepStateService = {};
    const submissionsService = {
      saveDraft: jest.fn(),
      getDraft: jest.fn(),
      submit: jest.fn(),
    };
    const cls = {};
    const prisma = {};

    const controller = new ApplicationsController(
      applicationsService as any,
      stepStateService as any,
      submissionsService as any,
      cls as any,
      prisma as any,
    );

    return { controller, applicationsService, submissionsService };
  }

  it('rejects draft save for hidden or unknown steps', async () => {
    const { controller, submissionsService } = createController(['step-visible']);

    await expect(
      controller.saveDraft('event-1', 'step-hidden', { answers: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(submissionsService.saveDraft).not.toHaveBeenCalled();
  });

  it('rejects draft fetch for hidden or unknown steps', async () => {
    const { controller, submissionsService } = createController(['step-visible']);

    await expect(controller.getDraft('event-1', 'step-hidden')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(submissionsService.getDraft).not.toHaveBeenCalled();
  });

  it('rejects submit for hidden or unknown steps', async () => {
    const { controller, submissionsService } = createController(['step-visible']);

    await expect(
      controller.submitStep('event-1', 'step-hidden', { answers: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(submissionsService.submit).not.toHaveBeenCalled();
  });
});
