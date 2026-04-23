import { ConflictException, NotFoundException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

function createServiceHarness() {
  const prisma = {
    issued_certificates: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    file_objects: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const storageService = {
    getPresignedGetUrl: jest.fn(),
    getHeadObject: jest.fn(),
    getObjectBuffer: jest.fn(),
    computeSha256: jest.fn(),
    deleteObject: jest.fn(),
  };
  const cls = {
    get: jest.fn((key: string) => (key === 'actorId' ? 'actor-1' : undefined)),
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
      status: 'ISSUED',
      revoked_at: null,
      released_at: new Date('2026-04-23T10:00:00.000Z'),
      pdf_storage_key: storageKey,
      applications: {
        attendance_records: {
          status: 'CHECKED_IN',
          checked_in_at: new Date('2026-04-23T10:00:00.000Z'),
        },
      },
    });
    storageService.getPresignedGetUrl.mockResolvedValue(
      'https://storage.example.com/signed-pdf',
    );

    const result = await service.resolveCertificatePdfUrl('certificate-1');

    expect(prisma.issued_certificates.findUnique).toHaveBeenCalledWith({
      where: {
        certificate_id: 'certificate-1',
      },
      include: {
        applications: {
          select: {
            attendance_records: {
              select: {
                status: true,
                checked_in_at: true,
              },
            },
          },
        },
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
      status: 'ISSUED',
      revoked_at: null,
      released_at: new Date('2026-04-23T10:00:00.000Z'),
      pdf_storage_key: null,
      applications: {
        attendance_records: {
          status: 'CHECKED_IN',
          checked_in_at: new Date('2026-04-23T10:00:00.000Z'),
        },
      },
    });

    await expect(
      service.resolveCertificatePdfUrl('certificate-no-pdf'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns participant PDF URL when attendee is checked in without timestamp', async () => {
    const { service, prisma, storageService } = createServiceHarness();
    const storageKey = 'events/event-1/certificates/pdf/certificate-legacy.pdf';

    prisma.issued_certificates.findUnique.mockResolvedValue({
      status: 'ISSUED',
      revoked_at: null,
      released_at: new Date('2026-04-23T10:00:00.000Z'),
      pdf_storage_key: storageKey,
      applications: {
        attendance_records: {
          status: 'CHECKED_IN',
          checked_in_at: null,
        },
      },
    });
    storageService.getPresignedGetUrl.mockResolvedValue(
      'https://storage.example.com/signed-pdf-legacy',
    );

    const result = await service.resolveCertificatePdfUrl('certificate-legacy');

    expect(storageService.getPresignedGetUrl).toHaveBeenCalledWith(
      storageKey,
      3600,
    );
    expect(result).toBe('https://storage.example.com/signed-pdf-legacy');
  });

  it('throws 404 for unreleased participant certificate PDF', async () => {
    const { service, prisma } = createServiceHarness();

    prisma.issued_certificates.findUnique.mockResolvedValue({
      status: 'ISSUED',
      revoked_at: null,
      released_at: null,
      pdf_storage_key: 'events/event-1/certificates/pdf/certificate-2.pdf',
      applications: {
        attendance_records: {
          status: 'CHECKED_IN',
          checked_in_at: new Date('2026-04-23T10:00:00.000Z'),
        },
      },
    });

    await expect(
      service.resolveCertificatePdfUrl('certificate-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves staff PDF URL regardless of release state', async () => {
    const { service, prisma, storageService } = createServiceHarness();
    const storageKey = 'events/event-1/certificates/pdf/certificate-staff.pdf';
    prisma.issued_certificates.findFirst = jest.fn().mockResolvedValue({
      pdf_storage_key: storageKey,
    });
    storageService.getPresignedGetUrl.mockResolvedValue(
      'https://storage.example.com/staff-pdf',
    );

    const result = await service.resolveIssuedCertificatePdfUrlForStaff(
      'event-1',
      'issued-1',
    );

    expect(prisma.issued_certificates.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'issued-1',
        event_id: 'event-1',
      },
      select: {
        pdf_storage_key: true,
      },
    });
    expect(result).toBe('https://storage.example.com/staff-pdf');
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

describe('CertificatesService public link generation', () => {
  beforeEach(() => {
    process.env.PUBLIC_APP_BASE_URL = 'https://participant.example.com';
  });

  afterEach(() => {
    delete process.env.PUBLIC_APP_BASE_URL;
    delete process.env.APP_BASE_URL;
    delete process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGIN;
  });

  it('generates credential, QR, and PDF links from canonical public host', () => {
    const { service } = createServiceHarness();

    const credentialLinks = (service as any).getCredentialLinks(
      'certificate-1',
      'credential-1',
    );
    const qrUrl = (service as any).getQrVerificationUrl('token-1');
    const pdfUrl = (service as any).getCertificatePdfUrl('certificate-1');
    const staffPdfUrl = (service as any).getStaffIssuedCertificatePdfUrl(
      'event-1',
      'issued-1',
    );

    expect(credentialLinks.certificateUrl).toBe(
      'https://participant.example.com/credentials/certificate/certificate-1',
    );
    expect(credentialLinks.verifiableCredentialUrl).toBe(
      'https://participant.example.com/credentials/verify/credential-1',
    );
    expect(qrUrl).toBe(
      'https://participant.example.com/credentials/qr/token-1',
    );
    expect(pdfUrl).toBe(
      'https://participant.example.com/credentials/certificate/certificate-1/pdf',
    );
    expect(staffPdfUrl).toBe(
      'https://participant.example.com/api/v1/events/event-1/certificates/issued-1/pdf',
    );
  });

  it('throws actionable error when strict public host cannot be resolved', () => {
    const { service } = createServiceHarness();
    delete process.env.PUBLIC_APP_BASE_URL;
    process.env.APP_BASE_URL = 'http://0.0.0.0:3000';
    process.env.CORS_ORIGINS = 'http://localhost:3000,http://api:3000';
    process.env.CORS_ORIGIN = 'http://127.0.0.1:3000';

    expect(() =>
      (service as any).getCredentialLinks('certificate-1', 'credential-1'),
    ).toThrow('Set PUBLIC_APP_BASE_URL to the public HTTPS origin');
  });

  it('requires PUBLIC_APP_BASE_URL even if APP_BASE_URL is otherwise public', () => {
    const { service } = createServiceHarness();
    delete process.env.PUBLIC_APP_BASE_URL;
    process.env.APP_BASE_URL = 'https://apply.example.com';
    process.env.CORS_ORIGINS = 'https://participant.example.com';

    expect(() =>
      (service as any).getCredentialLinks('certificate-1', 'credential-1'),
    ).toThrow('Set PUBLIC_APP_BASE_URL to the public HTTPS origin');
  });
});

describe('CertificatesService PDF text font fallback', () => {
  it('appends safe fallback chain for single custom font family', () => {
    const { service } = createServiceHarness();

    const svg = (service as any).buildTextOverlaySvg({
      width: 800,
      height: 120,
      text: 'Certificate',
      style: { fontFamily: 'Geist' },
      defaultAlign: 'left',
      defaultColor: '#0f172a',
      defaultFontSize: 32,
    });

    expect(svg).toContain(
      'font-family="Geist, &quot;Segoe UI&quot;, Arial, Helvetica, &quot;DejaVu Sans&quot;, &quot;Noto Sans&quot;, sans-serif"',
    );
  });

  it('preserves explicit multi-font order and guarantees a generic fallback', () => {
    const { service } = createServiceHarness();

    const svg = (service as any).buildTextOverlaySvg({
      width: 800,
      height: 120,
      text: 'Certificate',
      style: { fontFamily: '"Times New Roman", Georgia' },
      defaultAlign: 'left',
      defaultColor: '#0f172a',
      defaultFontSize: 32,
    });

    expect(svg).toContain(
      'font-family="&quot;Times New Roman&quot;, Georgia, sans-serif"',
    );
  });

  it('embeds uploaded font face and keeps fallback chain when font asset is bound', () => {
    const { service } = createServiceHarness();

    const svg = (service as any).buildTextOverlaySvg({
      width: 800,
      height: 120,
      text: 'Certificate',
      style: { fontFamily: 'Brand Sans', fontAssetKey: 'events/event-1/certificates/assets/font/brand.woff2' },
      embeddedFont: {
        storageKey: 'events/event-1/certificates/assets/font/brand.woff2',
        format: 'woff2',
        mimeType: 'font/woff2',
        buffer: Buffer.from('wOF2fontdata', 'utf8'),
        internalFamily: 'CertificateUploadedFont_a1b2c3d4e5f6',
      },
      defaultAlign: 'left',
      defaultColor: '#0f172a',
      defaultFontSize: 32,
    });

    expect(svg).toContain('@font-face');
    expect(svg).toContain('data:font/woff2;base64,');
    expect(svg).toContain(
      'font-family="&quot;CertificateUploadedFont_a1b2c3d4e5f6&quot;, Brand Sans, &quot;Segoe UI&quot;, Arial, Helvetica, &quot;DejaVu Sans&quot;, &quot;Noto Sans&quot;, sans-serif"',
    );
  });
});

describe('CertificatesService font asset upload validation', () => {
  it('accepts WOFF2 uploads when MIME and signature match', async () => {
    const { service, prisma, storageService } = createServiceHarness();
    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-1',
      event_id: 'event-1',
      created_by: 'actor-1',
      status: 'STAGED',
      storage_key: 'events/event-1/certificates/assets/font/sample.woff2',
      mime_type: 'font/woff2',
    });
    storageService.getHeadObject.mockResolvedValue({
      ContentLength: 128,
      ContentType: 'font/woff2',
    });
    storageService.getObjectBuffer.mockResolvedValue(
      Buffer.from('wOF2demo', 'utf8'),
    );
    storageService.computeSha256.mockResolvedValue('sha-256');
    prisma.file_objects.update.mockResolvedValue({
      id: 'file-1',
      storage_key: 'events/event-1/certificates/assets/font/sample.woff2',
      status: 'COMMITTED',
    });

    const result = await service.commitAssetUpload('event-1', 'file-1');

    expect(result.status).toBe('COMMITTED');
    expect(storageService.getObjectBuffer).toHaveBeenCalledWith(
      'events/event-1/certificates/assets/font/sample.woff2',
    );
    expect(prisma.file_objects.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-1' },
        data: expect.objectContaining({
          status: 'COMMITTED',
          sha256: 'sha-256',
        }),
      }),
    );
  });

  it('rejects font uploads when MIME does not match detected signature', async () => {
    const { service, prisma, storageService } = createServiceHarness();
    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-2',
      event_id: 'event-1',
      created_by: 'actor-1',
      status: 'STAGED',
      storage_key: 'events/event-1/certificates/assets/font/sample.ttf',
      mime_type: 'font/woff2',
    });
    storageService.getHeadObject.mockResolvedValue({
      ContentLength: 256,
      ContentType: 'font/woff2',
    });
    storageService.getObjectBuffer.mockResolvedValue(
      Buffer.from([0x00, 0x01, 0x00, 0x00, 0x12]),
    );

    await expect(
      service.commitAssetUpload('event-1', 'file-2'),
    ).rejects.toThrow('Font MIME type mismatch');
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'events/event-1/certificates/assets/font/sample.ttf',
    );
    expect(prisma.file_objects.delete).toHaveBeenCalledWith({
      where: { id: 'file-2' },
    });
  });

  it('rejects unsupported font signatures', async () => {
    const { service, prisma, storageService } = createServiceHarness();
    prisma.file_objects.findUnique.mockResolvedValue({
      id: 'file-3',
      event_id: 'event-1',
      created_by: 'actor-1',
      status: 'STAGED',
      storage_key: 'events/event-1/certificates/assets/font/sample.woff2',
      mime_type: 'font/woff2',
    });
    storageService.getHeadObject.mockResolvedValue({
      ContentLength: 180,
      ContentType: 'font/woff2',
    });
    storageService.getObjectBuffer.mockResolvedValue(
      Buffer.from('NOTAFONTFILE', 'utf8'),
    );

    await expect(
      service.commitAssetUpload('event-1', 'file-3'),
    ).rejects.toThrow('Unsupported font format');
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'events/event-1/certificates/assets/font/sample.woff2',
    );
    expect(prisma.file_objects.delete).toHaveBeenCalledWith({
      where: { id: 'file-3' },
    });
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
