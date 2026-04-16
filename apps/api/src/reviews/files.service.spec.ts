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

describe('FilesService field ZIP export', () => {
  type ExportServiceOptions = {
    answersSnapshot?: Record<string, unknown>;
    patchOps?: unknown[];
    maxFiles?: number;
    permissions?: string[];
    fileRows?: Array<{
      id: string;
      storage_key: string;
      original_filename: string;
      sensitivity: string;
    }>;
    hasLatestSubmission?: boolean;
  };

  function createExportService(options: ExportServiceOptions = {}) {
    const answersSnapshot =
      options.answersSnapshot ?? {
        resume: [{ fileObjectId: 'file-1' }],
      };
    const patchOps = options.patchOps ?? [];
    const maxFiles = options.maxFiles ?? 2;
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
      applications: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'app-1',
          users_applications_applicant_user_idTousers: {
            email: 'applicant@example.com',
          },
        }),
      },
      application_step_states: {
        findFirst: jest.fn().mockResolvedValue({
          latest_submission_version_id:
            options.hasLatestSubmission === false ? null : 'submission-1',
        }),
      },
      step_submission_versions: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'submission-1',
          form_version_id: 'form-1',
          answers_snapshot: answersSnapshot,
        }),
      },
      admin_change_patches: {
        findMany: jest.fn().mockResolvedValue(
          patchOps.length > 0 ? [{ ops: patchOps }] : [],
        ),
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
                    ui: {
                      maxFiles,
                    },
                  },
                ],
              },
            ],
          },
        }),
      },
      file_objects: {
        findMany: jest.fn().mockResolvedValue(fileRows),
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

  it('exports latest submitted field files with active patches applied', async () => {
    const { service, storageService } = createExportService({
      patchOps: [
        {
          op: 'replace',
          path: '/resume',
          value: [{ fileObjectId: 'file-2' }, { fileObjectId: 'file-3' }],
        },
      ],
      maxFiles: 3,
      fileRows: [
        {
          id: 'file-2',
          storage_key: 'key-2',
          original_filename: 'passport.pdf',
          sensitivity: 'normal',
        },
        {
          id: 'file-3',
          storage_key: 'key-3',
          original_filename: 'photo.PNG',
          sensitivity: 'normal',
        },
      ],
    });

    const result = await service.exportSubmittedFieldFilesZip(
      'event-1',
      'app-1',
      'step-1',
      'resume',
    );

    expect(result.filename).toBe('applicant@example.com__app-1__resume.zip');
    expect(storageService.getObjectBuffer).toHaveBeenCalledTimes(2);

    const zip = await JSZip.loadAsync(result.buffer);
    const entryNames = Object.keys(zip.files).sort();
    expect(entryNames).toEqual([
      'applicant@example.com__app-1__resume__file_1.pdf',
      'applicant@example.com__app-1__resume__file_2.png',
    ]);
    await expect(
      zip.files['applicant@example.com__app-1__resume__file_1.pdf'].async(
        'string',
      ),
    ).resolves.toBe('buf:key-2');
  });

  it('uses non-indexed filenames when field does not allow multiple files', async () => {
    const { service } = createExportService({
      answersSnapshot: { resume: { fileObjectId: 'file-1' } },
      maxFiles: 1,
      fileRows: [
        {
          id: 'file-1',
          storage_key: 'key-1',
          original_filename: 'resume.pdf',
          sensitivity: 'normal',
        },
      ],
    });

    const result = await service.exportSubmittedFieldFilesZip(
      'event-1',
      'app-1',
      'step-1',
      'resume',
    );
    const zip = await JSZip.loadAsync(result.buffer);
    const entryNames = Object.keys(zip.files).sort();

    expect(entryNames).toEqual(['applicant@example.com__app-1__resume.pdf']);
  });

  it('blocks export of sensitive files without sensitive file permission', async () => {
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
      service.exportSubmittedFieldFilesZip('event-1', 'app-1', 'step-1', 'resume'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects export when referenced file objects are missing in event scope', async () => {
    const { service } = createExportService({
      answersSnapshot: { resume: [{ fileObjectId: 'file-1' }, { fileObjectId: 'file-2' }] },
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
      service.exportSubmittedFieldFilesZip('event-1', 'app-1', 'step-1', 'resume'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects export when no files are present in submitted field answer', async () => {
    const { service } = createExportService({
      answersSnapshot: { resume: [] },
    });

    await expect(
      service.exportSubmittedFieldFilesZip('event-1', 'app-1', 'step-1', 'resume'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
