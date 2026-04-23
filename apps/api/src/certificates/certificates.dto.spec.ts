import {
  CertificateAssetKindSchema,
  CertificateTextStyleSchema,
  RegisterCertificateAssetUploadSchema,
} from '@event-platform/shared';

describe('certificate shared DTO font support', () => {
  it('accepts font as a certificate asset kind', () => {
    expect(CertificateAssetKindSchema.parse('font')).toBe('font');
  });

  it('accepts fontAssetKey on certificate text style', () => {
    const parsed = CertificateTextStyleSchema.parse({
      fontFamily: 'Brand Sans',
      fontAssetKey: 'events/event-1/certificates/assets/font/brand.woff2',
      fontSize: 32,
    });

    expect(parsed.fontAssetKey).toBe(
      'events/event-1/certificates/assets/font/brand.woff2',
    );
    expect(parsed.fontFamily).toBe('Brand Sans');
  });

  it('accepts register upload payload for font kind', () => {
    const parsed = RegisterCertificateAssetUploadSchema.parse({
      originalFilename: 'brand.woff2',
      mimeType: 'font/woff2',
      sizeBytes: 4096,
      kind: 'font',
    });

    expect(parsed.kind).toBe('font');
  });
});
