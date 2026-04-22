import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FieldType } from '@event-platform/schemas';
import { Permission } from '@event-platform/shared';
import JSZip from 'jszip';
import { FilesService } from './files.service';

describe('FilesService applicant upload guard', () => {
  function createService(params: {
    stepStatus: string;
    allowApplicantModification: boolean;
    modificationScope: 'SUBMITTED_ONLY' | 'SUBMITTED_OR_APPROVED';
    deadlineAt?: Date | null;
  }) {
    const prisma = {
      applications: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'app-1',
          applicant_user_id: 'user-1',
        }),
      },
      workflow_steps: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'step-1',
          form_version_id: 'form-1',
          deadline_at: params.deadlineAt ?? null,
          allow_applicant_modification: params.allowApplicantModification,
          modification_scope: params.modificationScope,
        }),
      },
      application_step_states: {
        findFirst: jest.fn().mockResolvedValue({
          status: params.stepStatus,
        }),
      },
      form_versions: {
        findUnique: jest.fn().mockResolvedValue({
          schema: {
            sections: [
              {
                id: 'section-1',
                title: 'Files',
                fields: [
                  {
                    id: 'resume',
                    key: 'resume',
                    type: FieldType.FILE_UPLOAD,
                    label: 'Resume',
                  },
                ],
              },
            ],
          },
        }),
      },
    };

    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'permissions') return [];
        return undefined;
      }),
    };

    const storageService = {};
    const service = new FilesService(
      prisma as any,
      cls as any,
      storageService as any,
    );

    return service;
  }

  async function resolveContext(service: FilesService) {
    return (service as any).resolveUploadFieldContext('event-1', 'user-1', {
      applicationId: 'app-1',
      stepId: 'step-1',
      fieldId: 'resume',
    });
  }

  it('blocks submitted uploads when modification is disabled', async () => {
    const service = createService({
      stepStatus: 'SUBMITTED',
      allowApplicantModification: false,
      modificationScope: 'SUBMITTED_ONLY',
    });

    await expect(resolveContext(service)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows submitted uploads when submitted edits are enabled', async () => {
    const service = createService({
      stepStatus: 'SUBMITTED',
      allowApplicantModification: true,
      modificationScope: 'SUBMITTED_ONLY',
    });

    await expect(resolveContext(service)).resolves.toEqual(
      expect.objectContaining({ fieldId: 'resume' }),
    );
  });

  it('blocks approved uploads for submitted-only scope', async () => {
    const service = createService({
      stepStatus: 'APPROVED',
      allowApplicantModification: true,
      modificationScope: 'SUBMITTED_ONLY',
    });

    await expect(resolveContext(service)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows approved uploads for submitted-or-approved scope', async () => {
    const service = createService({
      stepStatus: 'APPROVED',
      allowApplicantModification: true,
      modificationScope: 'SUBMITTED_OR_APPROVED',
    });

    await expect(resolveContext(service)).resolves.toEqual(
      expect.objectContaining({ fieldId: 'resume' }),
    );
  });

  it('allows uploads during needs-revision when the base step deadline has passed', async () => {
    const service = createService({
      stepStatus: 'NEEDS_REVISION',
      allowApplicantModification: false,
      modificationScope: 'SUBMITTED_ONLY',
      deadlineAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(resolveContext(service)).resolves.toEqual(
      expect.objectContaining({ fieldId: 'resume' }),
    );
  });

  it('still blocks uploads after deadline when step is not in needs-revision', async () => {
    const service = createService({
      stepStatus: 'UNLOCKED',
      allowApplicantModification: false,
      modificationScope: 'SUBMITTED_ONLY',
      deadlineAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(resolveContext(service)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('FilesService event-wide field ZIP export', () => {
  type ExportServiceOptions = {
    permissions?: string[];
    stepForExport?: {
      id: string;
      title: string;
      fields: unknown[] | null;
    } | null;
    workflowStepsForCatalog?: Array<{
      id: string;
      title: string;
      step_index: number;
      fields: unknown[] | null;
    }>;
    stepStates?: Array<{
      application_id: string;
      latest_submission_version_id: string | null;
      email: string;
    }>;
    submissions?: Array<{
      id: string;
      application_id: string;
      answers_snapshot: Record<string, unknown>;
    }>;
    patchRows?: Array<{
      submission_version_id: string;
      ops: unknown;
    }>;
    fileRows?: Array<{
      id: string;
      storage_key: string;
      original_filename: string;
      sensitivity: string;
    }>;
  };

  function createSchema(fields: unknown[] | null | undefined) {
    if (!fields) return null;
    return {
      sections: [
        {
          id: 'section-1',
          title: 'Files',
          fields,
        },
      ],
    };
  }

  function createExportService(options: ExportServiceOptions = {}) {
    const stepForExport = options.stepForExport ?? {
      id: 'step-1',
      title: 'Step 1',
      fields: [
        {
          id: 'resume',
          key: 'resume',
          type: FieldType.FILE_UPLOAD,
          label: 'Resume',
          ui: { maxFiles: 2 },
        },
      ],
    };

    const workflowStepsForCatalog =
      options.workflowStepsForCatalog ??
      [
        {
          id: 'step-1',
          title: 'Step 1',
          step_index: 0,
          fields: stepForExport?.fields ?? null,
        },
      ];

    const stepStates =
      options.stepStates ??
      [
        {
          application_id: 'app-1',
          latest_submission_version_id: 'sub-1',
          email: 'applicant@example.com',
        },
      ];

    const submissions =
      options.submissions ??
      [
        {
          id: 'sub-1',
          application_id: 'app-1',
          answers_snapshot: {
            resume: [{ fileObjectId: 'file-1' }],
          },
        },
      ];

    const patchRows = options.patchRows ?? [];
    const fileRows =
      options.fileRows ??
      [
        {
          id: 'file-1',
          storage_key: 'key-1',
          original_filename: 'resume.pdf',
          sensitivity: 'normal',
        },
      ];

    const prisma = {
      workflow_steps: {
        findMany: jest.fn().mockResolvedValue(
          workflowStepsForCatalog.map((step) => ({
            id: step.id,
            title: step.title,
            step_index: step.step_index,
            form_versions: step.fields ? { schema: createSchema(step.fields) } : null,
          })),
        ),
        findFirst: jest.fn().mockResolvedValue(
          stepForExport
            ? {
                id: stepForExport.id,
                title: stepForExport.title,
                form_versions: stepForExport.fields
                  ? { schema: createSchema(stepForExport.fields) }
                  : null,
              }
            : null,
        ),
      },
      application_step_states: {
        findMany: jest.fn().mockImplementation(async (args?: any) => {
          const requestedApplicationIds = Array.isArray(
            args?.where?.application_id?.in,
          )
            ? (args.where.application_id.in as string[])
            : null;
          const effectiveStepStates = requestedApplicationIds
            ? stepStates.filter((stepState) =>
                requestedApplicationIds.includes(stepState.application_id),
              )
            : stepStates;

          return effectiveStepStates.map((stepState) => ({
            application_id: stepState.application_id,
            latest_submission_version_id: stepState.latest_submission_version_id,
            applications: {
              users_applications_applicant_user_idTousers: {
                email: stepState.email,
              },
            },
          }));
        }),
      },
      step_submission_versions: {
        findMany: jest.fn().mockResolvedValue(submissions),
      },
      admin_change_patches: {
        findMany: jest.fn().mockResolvedValue(patchRows),
      },
      file_objects: {
        findMany: jest.fn().mockImplementation(async (args?: any) => {
          const requestedIds = Array.isArray(args?.where?.id?.in)
            ? (args.where.id.in as string[])
            : null;
          if (!requestedIds) {
            return fileRows;
          }
          return fileRows.filter((row) => requestedIds.includes(row.id));
        }),
      },
    };

    const permissions = options.permissions ?? [
      Permission.EVENT_FILES_READ_NORMAL,
      Permission.EVENT_FILES_READ_SENSITIVE,
    ];
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'permissions') return permissions;
        return undefined;
      }),
    };

    const storageService = {
      getObjectBuffer: jest.fn(async (key: string) => Buffer.from(`buf:${key}`)),
    };

    const service = new FilesService(
      prisma as any,
      cls as any,
      storageService as any,
    );

    return { service, prisma, storageService };
  }

  it('lists exportable file_upload fields from workflow forms', async () => {
    const { service } = createExportService({
      workflowStepsForCatalog: [
        {
          id: 'step-1',
          title: 'Step 1',
          step_index: 0,
          fields: [
            {
              id: 'resume',
              key: 'resume',
              type: FieldType.FILE_UPLOAD,
              label: 'Resume',
              ui: { maxFiles: 2 },
            },
            {
              id: 'about',
              key: 'about',
              type: FieldType.TEXT,
              label: 'About',
            },
          ],
        },
        {
          id: 'step-2',
          title: 'Step 2',
          step_index: 1,
          fields: [
            {
              id: 'photo',
              key: 'photo',
              type: FieldType.FILE_UPLOAD,
              label: 'Personal photo',
            },
          ],
        },
      ],
    });

    const fields = await service.listExportableFileFields('event-1');

    expect(fields).toEqual([
      {
        stepId: 'step-1',
        stepTitle: 'Step 1',
        stepIndex: 0,
        fieldKey: 'resume',
        fieldLabel: 'Resume',
        maxFiles: 2,
      },
      {
        stepId: 'step-2',
        stepTitle: 'Step 2',
        stepIndex: 1,
        fieldKey: 'photo',
        fieldLabel: 'Personal photo',
        maxFiles: 1,
      },
    ]);
  });

  it('exports files across applications with latest submissions and active patches', async () => {
    const { service, prisma, storageService } = createExportService({
      stepForExport: {
        id: 'step-1',
        title: 'Step 1',
        fields: [
          {
            id: 'resume',
            key: 'resume',
            type: FieldType.FILE_UPLOAD,
            label: 'Resume',
            ui: { maxFiles: 3 },
          },
        ],
      },
      stepStates: [
        {
          application_id: 'app-1',
          latest_submission_version_id: 'sub-1',
          email: 'alpha@example.com',
        },
        {
          application_id: 'app-2',
          latest_submission_version_id: 'sub-2',
          email: 'beta@example.com',
        },
      ],
      submissions: [
        {
          id: 'sub-1',
          application_id: 'app-1',
          answers_snapshot: {
            resume: [{ fileObjectId: 'file-1' }],
          },
        },
        {
          id: 'sub-2',
          application_id: 'app-2',
          answers_snapshot: {
            resume: [{ fileObjectId: 'file-2' }],
          },
        },
      ],
      patchRows: [
        {
          submission_version_id: 'sub-2',
          ops: [
            {
              op: 'replace',
              path: '/resume',
              value: [{ fileObjectId: 'file-3' }, { fileObjectId: 'file-4' }],
            },
          ],
        },
      ],
      fileRows: [
        {
          id: 'file-1',
          storage_key: 'key-1',
          original_filename: 'resume.pdf',
          sensitivity: 'normal',
        },
        {
          id: 'file-3',
          storage_key: 'key-3',
          original_filename: 'photo.PNG',
          sensitivity: 'normal',
        },
        {
          id: 'file-4',
          storage_key: 'key-4',
          original_filename: 'avatar.jpg',
          sensitivity: 'normal',
        },
      ],
    });

    const result = await service.exportEventFieldFilesZip(
      'event-1',
      'step-1',
      'resume',
    );

    expect(result.filename).toBe('event-1__step-1__resume.zip');
    expect(storageService.getObjectBuffer).toHaveBeenCalledTimes(3);
    expect((prisma.file_objects.findMany as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          event_id: 'event-1',
        }),
      }),
    );

    const zip = await JSZip.loadAsync(result.buffer);
    const entryNames = Object.keys(zip.files).sort();
    expect(entryNames).toEqual([
      'alpha@example.com__app-1__resume__file_1.pdf',
      'beta@example.com__app-2__resume__file_1.png',
      'beta@example.com__app-2__resume__file_2.jpg',
    ]);
  });

  it('exports only selected application IDs when provided', async () => {
    const { service, prisma, storageService } = createExportService({
      stepStates: [
        {
          application_id: 'app-1',
          latest_submission_version_id: 'sub-1',
          email: 'alpha@example.com',
        },
        {
          application_id: 'app-2',
          latest_submission_version_id: 'sub-2',
          email: 'beta@example.com',
        },
      ],
      submissions: [
        {
          id: 'sub-1',
          application_id: 'app-1',
          answers_snapshot: {
            resume: [{ fileObjectId: 'file-1' }],
          },
        },
        {
          id: 'sub-2',
          application_id: 'app-2',
          answers_snapshot: {
            resume: [{ fileObjectId: 'file-2' }],
          },
        },
      ],
      fileRows: [
        {
          id: 'file-1',
          storage_key: 'key-1',
          original_filename: 'resume.pdf',
          sensitivity: 'normal',
        },
        {
          id: 'file-2',
          storage_key: 'key-2',
          original_filename: 'photo.png',
          sensitivity: 'normal',
        },
      ],
    });

    const result = await service.exportEventFieldFilesZip(
      'event-1',
      'step-1',
      'resume',
      ['app-2'],
    );

    expect((prisma.application_step_states.findMany as jest.Mock).mock.calls[0][0])
      .toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            application_id: { in: ['app-2'] },
          }),
        }),
      );
    expect(storageService.getObjectBuffer).toHaveBeenCalledTimes(1);

    const zip = await JSZip.loadAsync(result.buffer);
    expect(Object.keys(zip.files)).toEqual([
      'beta@example.com__app-2__resume__file_1.png',
    ]);
  });

  it('uses non-indexed filenames when the selected field is single-file', async () => {
    const { service } = createExportService({
      stepForExport: {
        id: 'step-1',
        title: 'Step 1',
        fields: [
          {
            id: 'resume',
            key: 'resume',
            type: FieldType.FILE_UPLOAD,
            label: 'Resume',
            ui: { maxFiles: 1 },
          },
        ],
      },
      submissions: [
        {
          id: 'sub-1',
          application_id: 'app-1',
          answers_snapshot: {
            resume: { fileObjectId: 'file-1' },
          },
        },
      ],
    });

    const result = await service.exportEventFieldFilesZip(
      'event-1',
      'step-1',
      'resume',
    );
    const zip = await JSZip.loadAsync(result.buffer);

    expect(Object.keys(zip.files)).toEqual([
      'applicant@example.com__app-1__resume.pdf',
    ]);
  });

  it('blocks export when a sensitive file is included without sensitive permission', async () => {
    const { service } = createExportService({
      permissions: [Permission.EVENT_FILES_READ_NORMAL],
      fileRows: [
        {
          id: 'file-1',
          storage_key: 'key-1',
          original_filename: 'private.pdf',
          sensitivity: 'sensitive',
        },
      ],
    });

    await expect(
      service.exportEventFieldFilesZip('event-1', 'step-1', 'resume'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects export when referenced files are missing in event scope', async () => {
    const { service } = createExportService({
      submissions: [
        {
          id: 'sub-1',
          application_id: 'app-1',
          answers_snapshot: {
            resume: [{ fileObjectId: 'file-1' }, { fileObjectId: 'file-2' }],
          },
        },
      ],
      fileRows: [
        {
          id: 'file-1',
          storage_key: 'key-1',
          original_filename: 'resume.pdf',
          sensitivity: 'normal',
        },
      ],
    });

    await expect(
      service.exportEventFieldFilesZip('event-1', 'step-1', 'resume'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects export when latest submission versions are missing', async () => {
    const { service } = createExportService({
      stepStates: [
        {
          application_id: 'app-1',
          latest_submission_version_id: 'missing-submission',
          email: 'applicant@example.com',
        },
      ],
      submissions: [],
    });

    await expect(
      service.exportEventFieldFilesZip('event-1', 'step-1', 'resume'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects export when no files exist for the selected field across submissions', async () => {
    const { service } = createExportService({
      submissions: [
        {
          id: 'sub-1',
          application_id: 'app-1',
          answers_snapshot: {
            resume: [],
          },
        },
      ],
    });

    await expect(
      service.exportEventFieldFilesZip('event-1', 'step-1', 'resume'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
