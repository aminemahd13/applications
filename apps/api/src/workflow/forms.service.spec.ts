import { FormsService } from './forms.service';

describe('FormsService required file gate', () => {
  const FILE_A = '11111111-1111-4111-8111-111111111111';
  const FILE_B = '22222222-2222-4222-8222-222222222222';

  const SCHEMA = {
    sections: [
      {
        id: 'sec-1',
        title: 'Documents',
        fields: [
          {
            id: 'f-resume',
            key: 'resume',
            type: 'file_upload',
            label: 'Resume',
            validation: { required: true },
          },
          {
            id: 'f-photo',
            key: 'photo',
            type: 'file',
            label: 'Photo',
            validation: { required: true },
          },
          { id: 'f-extra', key: 'extra', type: 'file_upload', label: 'Extra' },
        ],
      },
    ],
  };

  function createService(version: unknown = { id: 'fv-1', schema: SCHEMA }) {
    const prisma = {
      form_versions: { findUnique: jest.fn().mockResolvedValue(version) },
    };
    const service = new FormsService(prisma as any, {} as any);
    return { service, prisma };
  }

  it('returns refs for required file fields (legacy "file" type included), keyed canonically', async () => {
    const { service, prisma } = createService();

    await expect(
      service.getRequiredFileRefsForAnswers('fv-1', {
        resume: [{ fileObjectId: FILE_A }],
        'f-photo': FILE_B,
        extra: { fileObjectId: '33333333-3333-4333-8333-333333333333' },
      }),
    ).resolves.toEqual([
      { fieldId: 'resume', fileObjectId: FILE_A },
      { fieldId: 'photo', fileObjectId: FILE_B },
    ]);
    expect(prisma.form_versions.findUnique).toHaveBeenCalledWith({
      where: { id: 'fv-1' },
    });
  });

  it('normalizes a { data } envelope', async () => {
    const { service } = createService();

    await expect(
      service.getRequiredFileRefsForAnswers('fv-1', {
        data: { resume: FILE_A },
      }),
    ).resolves.toEqual([{ fieldId: 'resume', fileObjectId: FILE_A }]);
  });

  it('reports required file fields emptied by staff patches', async () => {
    const { service } = createService();

    await expect(
      service.getRequiredFileGate(
        'fv-1',
        { photo: FILE_B },
        { resume: FILE_A, photo: FILE_B },
      ),
    ).resolves.toEqual({
      refs: [{ fieldId: 'photo', fileObjectId: FILE_B }],
      removedFields: [{ key: 'resume', label: 'Resume' }],
    });
  });

  it('returns an empty gate when the form version is missing', async () => {
    const { service } = createService(null);

    await expect(
      service.getRequiredFileGate('missing', {}, { resume: FILE_A }),
    ).resolves.toEqual({ refs: [], removedFields: [] });
    await expect(
      service.getRequiredFileRefsForAnswers('missing', { resume: FILE_A }),
    ).resolves.toEqual([]);
  });
});
