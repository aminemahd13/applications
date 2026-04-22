import { FilesController } from './files.controller';

describe('FilesController', () => {
  function createController() {
    const filesService = {
      registerUpload: jest.fn(),
      commitUpload: jest.fn(),
      getDownloadUrl: jest.fn(),
      listExportableFileFields: jest.fn(),
      createFieldFileExportJob: jest.fn(),
      getFieldFileExportJob: jest.fn(),
      getFieldFileExportJobDownloadUrl: jest.fn(),
      exportEventFieldFilesZip: jest.fn(),
    };
    const cls = {
      get: jest.fn(),
    };

    const controller = new FilesController(filesService as any, cls as any);
    return { controller, filesService, cls };
  }

  it('lists exportable file fields for an event', async () => {
    const { controller, filesService } = createController();
    const payload = [
      {
        stepId: 'step-1',
        stepTitle: 'Step 1',
        stepIndex: 0,
        fieldKey: 'resume',
        fieldLabel: 'Resume',
        maxFiles: 1,
      },
    ];
    filesService.listExportableFileFields.mockResolvedValue(payload);

    await expect(controller.listExportableFileFields('event-1')).resolves.toEqual({
      data: payload,
    });
    expect(filesService.listExportableFileFields).toHaveBeenCalledWith('event-1');
  });

  it('returns event-wide field ZIP with attachment headers', async () => {
    const { controller, filesService } = createController();
    const buffer = Buffer.from('zip-bytes');
    filesService.exportEventFieldFilesZip.mockResolvedValue({
      filename: 'event-1__step-1__resume.zip',
      buffer,
    });
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.exportEventFieldFilesZip(
      'event-1',
      'step-1',
      'resume',
      undefined,
      res,
    );

    expect(filesService.exportEventFieldFilesZip).toHaveBeenCalledWith(
      'event-1',
      'step-1',
      'resume',
      [],
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="event-1__step-1__resume.zip"',
    );
    expect(res.send).toHaveBeenCalledWith(buffer);
  });

  it('creates a field file export job and deduplicates applicationIds', async () => {
    const { controller, filesService } = createController();
    filesService.createFieldFileExportJob.mockResolvedValue({
      id: '2f5f0be7-f941-4ac8-b5cc-71f5ed9f8f5e',
      eventId: 'event-1',
      stepId: 'step-1',
      fieldId: 'resume',
      status: 'PENDING',
      applicationIdsCount: 1,
      attempts: 0,
      maxAttempts: 3,
      nextRetryAt: new Date('2026-04-22T12:00:00.000Z'),
      lockedAt: null,
      lockedBy: null,
      errorMessage: null,
      outputFilename: null,
      outputSizeBytes: null,
      completedAt: null,
      createdAt: new Date('2026-04-22T12:00:00.000Z'),
      updatedAt: new Date('2026-04-22T12:00:00.000Z'),
    });

    const applicationId = '11111111-1111-4111-8111-111111111111';
    const response = await controller.createFieldFileExportJob('event-1', {
      stepId: '22222222-2222-4222-8222-222222222222',
      fieldId: 'resume',
      applicationIds: [applicationId, applicationId],
    });

    expect(filesService.createFieldFileExportJob).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        stepId: '22222222-2222-4222-8222-222222222222',
        fieldId: 'resume',
        applicationIds: [applicationId],
      }),
    );
    expect(response).toEqual({
      data: expect.objectContaining({ status: 'PENDING' }),
    });
  });

  it('rejects oversized create-export payloads', async () => {
    const { controller } = createController();
    const oversized = Array.from(
      { length: 5001 },
      () => '11111111-1111-4111-8111-111111111111',
    );

    await expect(
      controller.createFieldFileExportJob('event-1', {
        stepId: '22222222-2222-4222-8222-222222222222',
        fieldId: 'resume',
        applicationIds: oversized,
      }),
    ).rejects.toBeTruthy();
  });

  it('returns field file export job status payload', async () => {
    const { controller, filesService } = createController();
    filesService.getFieldFileExportJob.mockResolvedValue({
      id: 'job-1',
      status: 'PROCESSING',
    });

    await expect(
      controller.getFieldFileExportJob('event-1', 'job-1'),
    ).resolves.toEqual({
      data: { id: 'job-1', status: 'PROCESSING' },
    });
    expect(filesService.getFieldFileExportJob).toHaveBeenCalledWith(
      'event-1',
      'job-1',
    );
  });

  it('returns field file export job download URL payload', async () => {
    const { controller, filesService } = createController();
    filesService.getFieldFileExportJobDownloadUrl.mockResolvedValue({
      url: 'https://storage.example.com/object.zip',
      expiresAt: new Date('2026-04-22T12:00:00.000Z'),
      filename: 'event-1__step-1__resume.zip',
    });

    await expect(
      controller.getFieldFileExportJobDownloadUrl('event-1', 'job-1'),
    ).resolves.toEqual({
      data: expect.objectContaining({
        url: 'https://storage.example.com/object.zip',
      }),
    });
    expect(filesService.getFieldFileExportJobDownloadUrl).toHaveBeenCalledWith(
      'event-1',
      'job-1',
    );
  });

  it('parses applicationIds query and forwards selected IDs to service', async () => {
    const { controller, filesService } = createController();
    const buffer = Buffer.from('zip-bytes');
    filesService.exportEventFieldFilesZip.mockResolvedValue({
      filename: 'event-1__step-1__resume.zip',
      buffer,
    });
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.exportEventFieldFilesZip(
      'event-1',
      'step-1',
      'resume',
      ' app-1,app-2 , app-1 ',
      res,
    );

    expect(filesService.exportEventFieldFilesZip).toHaveBeenCalledWith(
      'event-1',
      'step-1',
      'resume',
      ['app-1', 'app-2'],
    );
  });
});
