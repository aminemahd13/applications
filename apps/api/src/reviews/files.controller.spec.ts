import { FilesController } from './files.controller';

describe('FilesController', () => {
  function createController() {
    const filesService = {
      registerUpload: jest.fn(),
      commitUpload: jest.fn(),
      getDownloadUrl: jest.fn(),
      listExportableFileFields: jest.fn(),
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
