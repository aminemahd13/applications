import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ZodError } from 'zod';

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

describe('ApplicationsController bulk step action permissions', () => {
  function createController(permissions: string[]) {
    const applicationsService = {
      bulkStepAction: jest.fn().mockResolvedValue({ updated: 1, skipped: 0 }),
    };
    const stepStateService = {};
    const submissionsService = {};
    const cls = {
      get: jest.fn((key: string) =>
        key === 'permissions' ? permissions : undefined,
      ),
    };
    const prisma = {};

    const controller = new ApplicationsController(
      applicationsService as any,
      stepStateService as any,
      submissionsService as any,
      cls as any,
      prisma as any,
    );

    return { controller, applicationsService };
  }

  it('rejects APPROVE when actor only has unlock override permission', async () => {
    const { controller, applicationsService } = createController([
      'event.step.override.unlock',
    ]);

    await expect(
      controller.bulkStepAction('event-1', {
        applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
        stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        action: 'APPROVE',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(applicationsService.bulkStepAction).not.toHaveBeenCalled();
  });

  it('allows LOCK when actor has unlock override permission', async () => {
    const { controller, applicationsService } = createController([
      'event.step.override.unlock',
    ]);

    await expect(
      controller.bulkStepAction('event-1', {
        applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
        stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        action: 'LOCK',
      }),
    ).resolves.toEqual({ data: { updated: 1, skipped: 0 } });
    expect(applicationsService.bulkStepAction).toHaveBeenCalledTimes(1);
  });
});

describe('ApplicationsController export query validation', () => {
  function createController() {
    const applicationsService = {
      exportEventApplicationsCsv: jest.fn().mockResolvedValue({
        filename: 'applications.csv',
        csv: 'id\n',
      }),
    };
    const stepStateService = {};
    const submissionsService = {};
    const cls = {};
    const prisma = {};
    const controller = new ApplicationsController(
      applicationsService as any,
      stepStateService as any,
      submissionsService as any,
      cls as any,
      prisma as any,
    );

    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    return { controller, applicationsService, res };
  }

  it('rejects malformed applicationIds query', async () => {
    const { controller, applicationsService, res } = createController();

    await expect(
      controller.exportCsv('event-1', 'not-a-uuid,still-bad', res as any),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.exportEventApplicationsCsv).not.toHaveBeenCalled();
  });

  it('deduplicates valid applicationIds query values', async () => {
    const { controller, applicationsService, res } = createController();
    const id = '37a2125b-fdd0-42e2-a273-89d2f8010e4c';

    await controller.exportCsv('event-1', `${id}, ${id}`, res as any);

    expect(applicationsService.exportEventApplicationsCsv).toHaveBeenCalledWith(
      'event-1',
      [id],
    );
  });

  it('exports selected applications from POST body', async () => {
    const { controller, applicationsService, res } = createController();
    const id = '37a2125b-fdd0-42e2-a273-89d2f8010e4c';

    await controller.exportSelectedCsv(
      'event-1',
      { applicationIds: [id] },
      res as any,
    );

    expect(applicationsService.exportEventApplicationsCsv).toHaveBeenCalledWith(
      'event-1',
      [id],
    );
  });

  it('rejects malformed applicationIds in export POST body', async () => {
    const { controller, applicationsService, res } = createController();

    await expect(
      controller.exportSelectedCsv(
        'event-1',
        { applicationIds: ['not-a-uuid'] },
        res as any,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.exportEventApplicationsCsv).not.toHaveBeenCalled();
  });
});
