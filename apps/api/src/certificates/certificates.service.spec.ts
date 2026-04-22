import { ConflictException, NotFoundException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

function createServiceHarness() {
  const prisma = {
    issued_certificates: {
      findUnique: jest.fn(),
    },
    file_objects: {
      findFirst: jest.fn(),
    },
  };
  const storageService = {
    getPresignedGetUrl: jest.fn(),
  };
  const cls = {
    get: jest.fn(),
  };

  const service = new CertificatesService(
    prisma as any,
    cls as any,
    storageService as any,
  );

  return { service, prisma, storageService };
}

function createVersionLifecycleHarness() {
  const tx = {
    certificate_template_versions: {
      delete: jest.fn(),
    },
    certificate_templates: {
      update: jest.fn(),
    },
  };

  const prisma = {
    certificate_templates: {
      findFirst: jest.fn(),
    },
    certificate_template_versions: {
      findFirst: jest.fn(),
    },
    issued_certificates: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (ctx: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const storageService = {};
  const cls = {
    get: jest.fn((key: string) => (key === 'actorId' ? 'actor-1' : undefined)),
  };

  const service = new CertificatesService(
    prisma as any,
    cls as any,
    storageService as any,
  );

  return { service, prisma, tx };
}

describe('CertificatesService public resolvers', () => {
  it('returns a signed PDF URL for issued certificate PDFs', async () => {
    const { service, prisma, storageService } = createServiceHarness();
    const storageKey = 'events/event-1/certificates/pdf/certificate-1.pdf';

    prisma.issued_certificates.findUnique.mockResolvedValue({
      pdf_storage_key: storageKey,
    });
    storageService.getPresignedGetUrl.mockResolvedValue(
      'https://storage.example.com/signed-pdf',
    );

    const result = await service.resolveCertificatePdfUrl('certificate-1');

    expect(prisma.issued_certificates.findUnique).toHaveBeenCalledWith({
      where: {
        certificate_id: 'certificate-1',
      },
      select: {
        pdf_storage_key: true,
      },
    });
    expect(storageService.getPresignedGetUrl).toHaveBeenCalledWith(
      storageKey,
      3600,
    );
    expect(result).toBe('https://storage.example.com/signed-pdf');
  });

  it('throws 404 when certificate PDF record is missing', async () => {
    const { service, prisma } = createServiceHarness();

    prisma.issued_certificates.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveCertificatePdfUrl('certificate-404'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 404 when certificate exists without PDF key', async () => {
    const { service, prisma } = createServiceHarness();

    prisma.issued_certificates.findUnique.mockResolvedValue({
      pdf_storage_key: null,
    });

    await expect(
      service.resolveCertificatePdfUrl('certificate-no-pdf'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a signed URL for committed certificate assets', async () => {
    const { service, prisma, storageService } = createServiceHarness();
    const storageKey =
      'events/event-1/certificates/assets/background/background.png';

    prisma.file_objects.findFirst.mockResolvedValue({ id: 'asset-1' });
    storageService.getPresignedGetUrl.mockResolvedValue(
      'https://storage.example.com/signed-asset',
    );

    const result = await service.resolveCertificateAssetUrl(storageKey);

    expect(prisma.file_objects.findFirst).toHaveBeenCalledWith({
      where: {
        storage_key: storageKey,
        status: 'COMMITTED',
      },
      select: {
        id: true,
      },
    });
    expect(storageService.getPresignedGetUrl).toHaveBeenCalledWith(
      storageKey,
      3600,
    );
    expect(result).toBe('https://storage.example.com/signed-asset');
  });

  it('throws 404 for certificate asset keys outside certificate scope', async () => {
    const { service, prisma } = createServiceHarness();

    await expect(
      service.resolveCertificateAssetUrl('events/event-1/microsite/banner.jpg'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.file_objects.findFirst).not.toHaveBeenCalled();
  });

  it('throws 404 when a certificate asset does not exist', async () => {
    const { service, prisma } = createServiceHarness();
    const storageKey = 'events/event-1/certificates/assets/signature/sign.png';

    prisma.file_objects.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveCertificateAssetUrl(storageKey),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CertificatesService deleteTemplateVersion', () => {
  it('blocks deleting the active published version', async () => {
    const { service, prisma } = createVersionLifecycleHarness();

    prisma.certificate_templates.findFirst.mockResolvedValue({
      id: 'template-1',
      event_id: 'event-1',
      active_version_id: 'version-1',
    });
    prisma.certificate_template_versions.findFirst.mockResolvedValue({
      id: 'version-1',
      template_id: 'template-1',
      version_number: 1,
    });

    await expect(
      service.deleteTemplateVersion('event-1', 'template-1', 'version-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.issued_certificates.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks deleting a version referenced by active issued certificates', async () => {
    const { service, prisma } = createVersionLifecycleHarness();

    prisma.certificate_templates.findFirst.mockResolvedValue({
      id: 'template-1',
      event_id: 'event-1',
      active_version_id: 'version-2',
    });
    prisma.certificate_template_versions.findFirst.mockResolvedValue({
      id: 'version-1',
      template_id: 'template-1',
      version_number: 1,
    });
    prisma.issued_certificates.findFirst.mockResolvedValue({
      id: 'issued-1',
    });

    await expect(
      service.deleteTemplateVersion('event-1', 'template-1', 'version-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes a version when only revoked references exist', async () => {
    const { service, prisma, tx } = createVersionLifecycleHarness();

    prisma.certificate_templates.findFirst.mockResolvedValue({
      id: 'template-1',
      event_id: 'event-1',
      active_version_id: 'version-2',
    });
    prisma.certificate_template_versions.findFirst.mockResolvedValue({
      id: 'version-1',
      template_id: 'template-1',
      version_number: 1,
    });
    prisma.issued_certificates.findFirst.mockResolvedValue(null);

    await service.deleteTemplateVersion('event-1', 'template-1', 'version-1');

    expect(tx.certificate_template_versions.delete).toHaveBeenCalledWith({
      where: { id: 'version-1' },
    });
    expect(tx.certificate_templates.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: {
        updated_by: 'actor-1',
        updated_at: expect.any(Date),
      },
    });
  });
});
