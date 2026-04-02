import { ForbiddenException } from '@nestjs/common';
import { FieldType } from '@event-platform/schemas';
import { FilesService } from './files.service';

describe('FilesService applicant upload guard', () => {
  function createService(params: {
    stepStatus: string;
    allowApplicantModification: boolean;
    modificationScope: 'SUBMITTED_ONLY' | 'SUBMITTED_OR_APPROVED';
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
          deadline_at: null,
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
});
