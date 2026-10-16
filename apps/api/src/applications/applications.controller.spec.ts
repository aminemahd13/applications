import {
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ZodError } from 'zod';
import { Permission } from '@event-platform/shared';
import { PERMISSIONS_KEY } from '../common/decorators/require-permission.decorator';

/** @RequirePermission metadata of a handler, looked up by name. */
function permissionsOf(name: string): unknown {
  const handler = Object.getOwnPropertyDescriptor(
    ApplicationsController.prototype,
    name,
  )?.value as object;
  return Reflect.getMetadata(PERMISSIONS_KEY, handler);
}

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
      submitCurrentDraftAsStaff: jest.fn(),
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

describe('ApplicationsController staff draft submit endpoint', () => {
  function createController() {
    const applicationsService = {};
    const stepStateService = {};
    const submissionsService = {
      saveDraftAsStaff: jest.fn(),
      submitCurrentDraftAsStaff: jest.fn().mockResolvedValue({
        id: 'submission-1',
        applicationId: '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
        stepId: 'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
        formVersionId: 'form-1',
        versionNumber: 1,
        answersSnapshot: { field: 'value' },
        submittedAt: new Date('2026-01-01T10:00:00.000Z'),
        submittedBy: 'staff-1',
      }),
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

  it('delegates draft submit to submissions service', async () => {
    const { controller, submissionsService } = createController();

    await expect(
      controller.submitStaffStepDraft(
        'event-1',
        '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
        'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
      ),
    ).resolves.toEqual({
      data: expect.objectContaining({ id: 'submission-1' }),
    });

    expect(submissionsService.submitCurrentDraftAsStaff).toHaveBeenCalledWith(
      'event-1',
      '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
      'd8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a',
    );
  });

  it('requires event.step.review permission metadata', () => {
    const permissions = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ApplicationsController.prototype.submitStaffStepDraft,
    );
    expect(permissions).toEqual([Permission.EVENT_STEP_REVIEW]);
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
      controller.exportCsv(
        'event-1',
        { applicationIds: 'not-a-uuid,still-bad' } as any,
        res as any,
      ),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.exportEventApplicationsCsv).not.toHaveBeenCalled();
  });

  it('deduplicates valid applicationIds query values', async () => {
    const { controller, applicationsService, res } = createController();
    const id = '37a2125b-fdd0-42e2-a273-89d2f8010e4c';

    await controller.exportCsv(
      'event-1',
      { applicationIds: `${id}, ${id}` } as any,
      res as any,
    );

    expect(applicationsService.exportEventApplicationsCsv).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        applicationIds: [id],
      }),
    );
  });

  it('parses optional export config query values', async () => {
    const { controller, applicationsService, res } = createController();
    await controller.exportCsv(
      'event-1',
      {
        columns: ['applicationId', 'applicationUrl', 'applicationId'],
        includeResponseColumns: 'false',
        portal: 'admin',
      } as any,
      res as any,
    );

    expect(applicationsService.exportEventApplicationsCsv).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        columns: ['applicationId', 'applicationUrl'],
        includeResponseColumns: false,
        portal: 'admin',
      }),
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
      expect.objectContaining({
        applicationIds: [id],
      }),
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

describe('ApplicationsController resolve-by-emails', () => {
  function createController() {
    const applicationsService = {
      resolveByEmails: jest.fn().mockResolvedValue({
        applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
        userIds: ['d8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a'],
        matchedEmails: ['target@example.com'],
        unmatchedEmails: ['missing@example.com'],
      }),
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

  it('forwards parsed payload to resolveByEmails service', async () => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.resolveByEmails('event-1', {
        emails: ['Target@Example.com', 'missing@example.com'],
      }),
    ).resolves.toEqual({
      data: {
        applicationIds: ['37a2125b-fdd0-42e2-a273-89d2f8010e4c'],
        userIds: ['d8e8eb57-6ac9-440e-8036-6ac8fd5fcb9a'],
        matchedEmails: ['target@example.com'],
        unmatchedEmails: ['missing@example.com'],
      },
    });

    expect(applicationsService.resolveByEmails).toHaveBeenCalledWith('event-1', [
      'Target@Example.com',
      'missing@example.com',
    ]);
  });

  it('rejects malformed email payload', async () => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.resolveByEmails('event-1', {
        emails: ['not-an-email'],
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.resolveByEmails).not.toHaveBeenCalled();
  });

  it('rejects payloads longer than 2000 emails', async () => {
    const { controller, applicationsService } = createController();
    const tooManyEmails = Array.from(
      { length: 2001 },
      (_, index) => `user${index}@example.com`,
    );

    await expect(
      controller.resolveByEmails('event-1', {
        emails: tooManyEmails,
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.resolveByEmails).not.toHaveBeenCalled();
  });
});

describe('ApplicationsController append internal note', () => {
  const APPLICATION_ID = '37a2125b-fdd0-42e2-a273-89d2f8010e4c';
  const notesResponse = {
    notes: [
      {
        id: 'note-0',
        createdAt: '2026-10-15T09:30:00.000Z',
        authorName: 'Ada Lovelace',
        content: 'Looks good',
      },
    ],
  };

  function createController() {
    const applicationsService = {
      appendInternalNote: jest.fn().mockResolvedValue(notesResponse),
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

  it('requires event.application.notes.manage permission metadata', () => {
    expect(permissionsOf('appendInternalNote')).toEqual([
      Permission.EVENT_APPLICATION_NOTES_MANAGE,
    ]);
  });

  it('delegates trimmed content to the service and wraps the result in data', async () => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.appendInternalNote('event-1', APPLICATION_ID, {
        content: '  Looks good  ',
      }),
    ).resolves.toEqual({ data: notesResponse });

    expect(applicationsService.appendInternalNote).toHaveBeenCalledWith(
      'event-1',
      APPLICATION_ID,
      'Looks good',
    );
  });

  it('accepts content at the 2000 character limit', async () => {
    const { controller, applicationsService } = createController();
    const content = 'a'.repeat(2000);

    await controller.appendInternalNote('event-1', APPLICATION_ID, { content });

    expect(applicationsService.appendInternalNote).toHaveBeenCalledWith(
      'event-1',
      APPLICATION_ID,
      content,
    );
  });

  it.each([
    ['empty content', { content: '' }],
    ['whitespace-only content', { content: '   \n\t ' }],
    ['content over 2000 characters', { content: 'a'.repeat(2001) }],
    ['missing content', {}],
    ['non-string content', { content: 42 }],
    ['extra keys', { content: 'Looks good', authorName: 'Someone else' }],
    ['a null body', null],
  ])('rejects %s', async (_label, body) => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.appendInternalNote('event-1', APPLICATION_ID, body),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.appendInternalNote).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid application id before calling the service', async () => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.appendInternalNote('event-1', 'not-a-uuid', {
        content: 'Looks good',
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.appendInternalNote).not.toHaveBeenCalled();
  });
});

describe('ApplicationsController delete internal notes', () => {
  const APPLICATION_ID = '37a2125b-fdd0-42e2-a273-89d2f8010e4c';
  const noteRef = {
    id: 'note-0',
    createdAt: '2026-10-15T09:30:00.000Z',
    authorName: 'Ada Lovelace',
    content: 'Looks good',
  };
  const legacyRef = {
    id: 'note-1',
    createdAt: null,
    authorName: null,
    content: 'Legacy unprefixed note',
  };
  const deleteResponse = { notes: [], removed: 2, missing: 0 };

  function createController() {
    const applicationsService = {
      deleteInternalNotes: jest.fn().mockResolvedValue(deleteResponse),
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

  it('requires event.application.notes.manage permission metadata', () => {
    expect(permissionsOf('deleteInternalNotes')).toEqual([
      Permission.EVENT_APPLICATION_NOTES_MANAGE,
    ]);
  });

  it('passes the parsed note refs to the service and wraps the result in data', async () => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.deleteInternalNotes('event-1', APPLICATION_ID, {
        notes: [noteRef, legacyRef],
      }),
    ).resolves.toEqual({ data: deleteResponse });

    expect(applicationsService.deleteInternalNotes).toHaveBeenCalledWith(
      'event-1',
      APPLICATION_ID,
      [noteRef, legacyRef],
    );
  });

  it('accepts the maximum number of refs', async () => {
    const { controller, applicationsService } = createController();
    const notes = Array.from({ length: 1000 }, (_, index) => ({
      ...noteRef,
      id: `note-${index}`,
    }));

    await controller.deleteInternalNotes('event-1', APPLICATION_ID, { notes });

    expect(applicationsService.deleteInternalNotes).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty notes array', { notes: [] }],
    [
      'more than 1000 refs',
      {
        notes: Array.from({ length: 1001 }, (_, index) => ({
          ...noteRef,
          id: `note-${index}`,
        })),
      },
    ],
    ['a bad id format', { notes: [{ ...noteRef, id: 'legacy-0' }] }],
    ['extra keys on a ref', { notes: [{ ...noteRef, extra: true }] }],
    ['extra keys on the body', { notes: [noteRef], eventId: 'event-2' }],
    [
      'a missing content',
      { notes: [{ id: 'note-0', createdAt: null, authorName: null }] },
    ],
    [
      'a missing createdAt',
      { notes: [{ id: 'note-0', authorName: null, content: 'x' }] },
    ],
    ['a missing notes key', {}],
    ['a null body', null],
  ])('rejects %s', async (_label, body) => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.deleteInternalNotes('event-1', APPLICATION_ID, body),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.deleteInternalNotes).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid application id before calling the service', async () => {
    const { controller, applicationsService } = createController();

    await expect(
      controller.deleteInternalNotes('event-1', 'not-a-uuid', {
        notes: [noteRef],
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(applicationsService.deleteInternalNotes).not.toHaveBeenCalled();
  });
});

describe('ApplicationsController retired internal-notes replace', () => {
  it('keeps the notes-manage permission metadata on the route', () => {
    expect(permissionsOf('updateInternalNotes')).toEqual([
      Permission.EVENT_APPLICATION_NOTES_MANAGE,
    ]);
  });

  it('throws 410 INTERNAL_NOTES_REPLACE_DISABLED without touching the service', () => {
    const applicationsService = {};
    const controller = new ApplicationsController(
      applicationsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    let error: unknown;
    try {
      controller.updateInternalNotes();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(GoneException);
    expect((error as GoneException).getStatus()).toBe(410);
    expect((error as GoneException).getResponse()).toEqual({
      code: 'INTERNAL_NOTES_REPLACE_DISABLED',
      message: 'This page is out of date. Reload it to add or delete notes.',
    });
  });
});
