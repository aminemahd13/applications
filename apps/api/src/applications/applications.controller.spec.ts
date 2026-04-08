import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ZodError } from 'zod';
import { Permission } from '@event-platform/shared';
import { PERMISSIONS_KEY } from '../common/decorators/require-permission.decorator';

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

describe('ApplicationsController staff draft save endpoint', () => {
  function createController() {
    const applicationsService = {};
    const stepStateService = {};
    const submissionsService = {
      saveDraftAsStaff: jest
        .fn()
        .mockResolvedValue({ mode: 'DRAFT_SAVED', draftId: 'draft-1' }),
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

    return { controller, submissionsService };
  }

  it('delegates parsed payload to submissions service', async () => {
    const { controller, submissionsService } = createController();

    await expect(
      controller.saveStaffStepDraft(
        'event-1',
        '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
        'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        { answers: { field: 'value' } },
      ),
    ).resolves.toEqual({
      data: { mode: 'DRAFT_SAVED', draftId: 'draft-1' },
    });

    expect(submissionsService.saveDraftAsStaff).toHaveBeenCalledWith(
      'event-1',
      '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
      'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
      { answers: { field: 'value' } },
    );
  });

  it('rejects malformed draft payload', async () => {
    const { controller, submissionsService } = createController();

    await expect(
      controller.saveStaffStepDraft(
        'event-1',
        '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
        'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        {},
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(submissionsService.saveDraftAsStaff).not.toHaveBeenCalled();
  });

  it('requires event.step.patch permission metadata', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ApplicationsController.prototype.saveStaffStepDraft,
    );
    expect(permissions).toEqual([Permission.EVENT_STEP_PATCH]);
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

  it('rejects SUBMITTED when actor only has unlock override permission', async () => {
    const { controller, applicationsService } = createController([
      'event.step.override.unlock',
    ]);

    await expect(
      controller.bulkStepAction('event-1', {
        applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
        stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        action: 'SUBMITTED',
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

  it('allows SUBMITTED when actor has review permission', async () => {
    const { controller, applicationsService } = createController([
      'event.step.review',
    ]);

    await expect(
      controller.bulkStepAction('event-1', {
        applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
        stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        action: 'SUBMITTED',
      }),
    ).resolves.toEqual({ data: { updated: 1, skipped: 0 } });
    expect(applicationsService.bulkStepAction).toHaveBeenCalledTimes(1);
  });

  it('rejects REJECT when actor only has unlock override permission', async () => {
    const { controller, applicationsService } = createController([
      'event.step.override.unlock',
    ]);

    await expect(
      controller.bulkStepAction('event-1', {
        applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
        stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        action: 'REJECT',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(applicationsService.bulkStepAction).not.toHaveBeenCalled();
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

describe('ApplicationsController advanced query and saved views', () => {
  function createController() {
    const applicationsService = {
      query: jest.fn().mockResolvedValue({ data: [], meta: { hasMore: false } }),
      listSavedViews: jest.fn().mockResolvedValue([]),
      createSavedView: jest.fn().mockResolvedValue({ id: 'view-1' }),
      updateSavedView: jest.fn().mockResolvedValue({ id: 'view-1' }),
      deleteSavedView: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new ApplicationsController(
      applicationsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { controller, applicationsService };
  }

  it('forwards parsed advanced query payload', async () => {
    const { controller, applicationsService } = createController();
    await controller.query('event-1', {
      filterTree: {
        type: 'group',
        mode: 'all',
        children: [{ type: 'search_text', value: 'ada' }],
      },
    });

    expect(applicationsService.query).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        limit: 50,
        order: 'desc',
        filterTree: expect.objectContaining({
          type: 'group',
          mode: 'all',
        }),
      }),
    );
  });

  it('lists shared application saved views', async () => {
    const { controller, applicationsService } = createController();
    const result = await controller.listSavedViews('event-1');
    expect(result).toEqual({ data: [] });
    expect(applicationsService.listSavedViews).toHaveBeenCalledWith('event-1');
  });

  it('creates, updates and deletes shared saved views', async () => {
    const { controller, applicationsService } = createController();
    const createResult = await controller.createSavedView('event-1', {
      name: 'My View',
      mode: 'advanced',
      filterTree: {
        type: 'group',
        mode: 'all',
        children: [],
      },
    });
    expect(createResult).toEqual({ data: { id: 'view-1' } });
    expect(applicationsService.createSavedView).toHaveBeenCalled();

    const updateResult = await controller.updateSavedView(
      'event-1',
      'view-1',
      { name: 'Updated' },
    );
    expect(updateResult).toEqual({ data: { id: 'view-1' } });
    expect(applicationsService.updateSavedView).toHaveBeenCalledWith(
      'event-1',
      'view-1',
      expect.objectContaining({ name: 'Updated' }),
    );

    const deleteResult = await controller.deleteSavedView('event-1', 'view-1');
    expect(deleteResult).toEqual({ success: true });
    expect(applicationsService.deleteSavedView).toHaveBeenCalledWith(
      'event-1',
      'view-1',
    );
  });
});
