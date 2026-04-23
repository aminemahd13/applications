import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const CertificateElementTypeSchema = z.enum([
  'text',
  'dynamic_text',
  'image',
  'signature',
  'qr',
]);

export type CertificateElementType = z.infer<
  typeof CertificateElementTypeSchema
>;

const CertificateElementBaseSchema = z.object({
  id: z.string().min(1).max(128),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  zIndex: z.number().int().min(0).max(9999).optional().default(0),
  rotation: z.number().min(-360).max(360).optional().default(0),
  opacity: z.number().min(0).max(1).optional().default(1),
  locked: z.boolean().optional().default(false),
});

export const CertificateTextStyleSchema = z.object({
  fontFamily: z.string().trim().min(1).max(120).optional(),
  fontSize: z.number().min(8).max(400).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-10).max(40).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
});

export type CertificateTextStyle = z.infer<typeof CertificateTextStyleSchema>;

export const CertificateImageStyleSchema = z.object({
  fit: z.enum(['contain', 'cover', 'fill']).optional(),
  borderRadius: z.number().min(0).max(200).optional(),
});

export type CertificateImageStyle = z.infer<typeof CertificateImageStyleSchema>;

export const CertificateQrStyleSchema = z.object({
  foregroundColor: z.string().regex(HEX_COLOR).optional(),
  backgroundColor: z.string().regex(HEX_COLOR).optional(),
  showLabel: z.boolean().optional(),
});

export type CertificateQrStyle = z.infer<typeof CertificateQrStyleSchema>;

export const CertificateTextElementSchema = CertificateElementBaseSchema.extend({
  type: z.literal('text'),
  content: z.string().trim().min(1).max(1000),
  style: CertificateTextStyleSchema.optional().default({}),
});

export const CertificateDynamicTextElementSchema =
  CertificateElementBaseSchema.extend({
    type: z.literal('dynamic_text'),
    token: z.string().trim().min(1).max(120),
    style: CertificateTextStyleSchema.optional().default({}),
  });

export const CertificateImageElementSchema = CertificateElementBaseSchema.extend({
  type: z.literal('image'),
  assetKey: z.string().trim().max(500).optional(),
  style: CertificateImageStyleSchema.optional().default({}),
});

export const CertificateSignatureElementSchema =
  CertificateElementBaseSchema.extend({
    type: z.literal('signature'),
    signatureSlotKey: z.string().trim().min(1).max(120),
    style: CertificateImageStyleSchema.optional().default({}),
  });

export const CertificateQrElementSchema = CertificateElementBaseSchema.extend({
  type: z.literal('qr'),
  token: z.string().trim().min(1).max(120).optional().default('qrVerificationUrl'),
  style: CertificateQrStyleSchema.optional().default({}),
});

export const CertificateTemplateElementSchema = z.discriminatedUnion('type', [
  CertificateTextElementSchema,
  CertificateDynamicTextElementSchema,
  CertificateImageElementSchema,
  CertificateSignatureElementSchema,
  CertificateQrElementSchema,
]);

export type CertificateTemplateElement = z.infer<
  typeof CertificateTemplateElementSchema
>;

export const CertificateSignatureSlotSchema = z.object({
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  signerName: z.string().max(160).optional(),
  signerTitle: z.string().max(160).optional(),
  assetKey: z.string().max(500).optional(),
});

export type CertificateSignatureSlot = z.infer<
  typeof CertificateSignatureSlotSchema
>;

export const CertificateLayoutSchema = z.object({
  layoutSchemaVersion: z.literal(2).default(2),
  canvas: z.object({
    width: z.number().positive().max(8000).default(1600),
    height: z.number().positive().max(8000).default(1131),
    unit: z.enum(['px']).default('px'),
    backgroundColor: z.string().regex(HEX_COLOR).optional(),
    backgroundAssetKey: z.string().max(500).optional(),
    gridSize: z.number().int().min(4).max(128).optional().default(8),
    snapEnabled: z.boolean().optional().default(true),
  }),
  elements: z.array(CertificateTemplateElementSchema).default([]),
  signatureSlots: z.array(CertificateSignatureSlotSchema).optional().default([]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CertificateLayout = z.infer<typeof CertificateLayoutSchema>;

export const CreateCertificateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  typeKey: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_\-]+$/),
  typeLabel: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  isDefault: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  layout: CertificateLayoutSchema,
});

export type CreateCertificateTemplateDto = z.infer<
  typeof CreateCertificateTemplateSchema
>;

export const UpdateCertificateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    typeKey: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_\-]+$/)
      .optional(),
    typeLabel: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one template field must be provided',
  });

export type UpdateCertificateTemplateDto = z.infer<
  typeof UpdateCertificateTemplateSchema
>;

export const CreateCertificateTemplateVersionSchema = z.object({
  layout: CertificateLayoutSchema,
});

export type CreateCertificateTemplateVersionDto = z.infer<
  typeof CreateCertificateTemplateVersionSchema
>;

export const ActivateCertificateTemplateVersionSchema = z.object({
  versionId: z.string().uuid(),
});

export type ActivateCertificateTemplateVersionDto = z.infer<
  typeof ActivateCertificateTemplateVersionSchema
>;

export const UpdateCertificateTemplateDraftSchema = z.object({
  revision: z.number().int().min(0),
  layout: CertificateLayoutSchema,
});

export type UpdateCertificateTemplateDraftDto = z.infer<
  typeof UpdateCertificateTemplateDraftSchema
>;

export const PublishCertificateTemplateSchema = z.object({
  activate: z.boolean().optional().default(true),
});

export type PublishCertificateTemplateDto = z.infer<
  typeof PublishCertificateTemplateSchema
>;

export const DuplicateCertificateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
});

export type DuplicateCertificateTemplateDto = z.infer<
  typeof DuplicateCertificateTemplateSchema
>;

export const ListCertificateTemplatesQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
  typeKey: z.string().trim().max(80).optional(),
});

export type ListCertificateTemplatesQueryDto = z.infer<
  typeof ListCertificateTemplatesQuerySchema
>;

export const CertificateTemplateVersionResponseSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  versionNumber: z.number().int(),
  layout: CertificateLayoutSchema,
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
});

export type CertificateTemplateVersionResponse = z.infer<
  typeof CertificateTemplateVersionResponseSchema
>;

export const CertificateTemplateDraftResponseSchema = z.object({
  templateId: z.string().uuid(),
  revision: z.number().int().min(0),
  layout: CertificateLayoutSchema,
  updatedAt: z.coerce.date().nullable(),
});

export type CertificateTemplateDraftResponse = z.infer<
  typeof CertificateTemplateDraftResponseSchema
>;

export const CertificateTemplateResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string(),
  typeKey: z.string(),
  typeLabel: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  archivedAt: z.coerce.date().nullable(),
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  activeVersionId: z.string().uuid().nullable().optional(),
  activeVersionNumber: z.number().int().nullable().optional(),
  draftRevision: z.number().int().min(0),
  draftUpdatedAt: z.coerce.date().nullable(),
  layoutSchemaVersion: z.number().int().min(2).default(2),
});

export type CertificateTemplateResponse = z.infer<
  typeof CertificateTemplateResponseSchema
>;

function dedupeNonEmptyStrings(values?: string[]): string[] | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  return Array.from(
    new Set(
      values.map((value) => String(value ?? '').trim()).filter((value) => value.length > 0),
    ),
  );
}

export const IssueCertificateSchema = z.object({
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid().optional(),
  applicationId: z.string().uuid(),
  issuerName: z.string().trim().min(1).max(200).optional(),
  reissueIfExists: z.boolean().optional().default(false),
  payloadOverrides: z.record(z.string(), z.unknown()).optional().default({}),
});

export type IssueCertificateDto = z.infer<typeof IssueCertificateSchema>;

export const IssueCertificatesBulkSchema = z.object({
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid().optional(),
  applicationIds: z.array(z.string().uuid()).min(1).max(1000),
  issuerName: z.string().trim().min(1).max(200).optional(),
  reissueIfExists: z.boolean().optional().default(false),
  payloadOverrides: z.record(z.string(), z.unknown()).optional().default({}),
});

export type IssueCertificatesBulkDto = z.infer<typeof IssueCertificatesBulkSchema>;

export const IssueCertificatesByTagsSchema = z
  .object({
    templateId: z.string().uuid(),
    templateVersionId: z.string().uuid().optional(),
    tags: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
    issuerName: z.string().trim().min(1).max(200).optional(),
    reissueIfExists: z.boolean().optional().default(false),
    payloadOverrides: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .transform((value) => ({
    ...value,
    tags: dedupeNonEmptyStrings(value.tags) ?? [],
  }));

export type IssueCertificatesByTagsDto = z.infer<
  typeof IssueCertificatesByTagsSchema
>;

export const ListCertificateIssuanceTagsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListCertificateIssuanceTagsQueryDto = z.infer<
  typeof ListCertificateIssuanceTagsQuerySchema
>;

export const RevokeIssuedCertificateSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type RevokeIssuedCertificateDto = z.infer<
  typeof RevokeIssuedCertificateSchema
>;

export const ReleaseIssuedCertificateSchema = z.object({});

export type ReleaseIssuedCertificateDto = z.infer<
  typeof ReleaseIssuedCertificateSchema
>;

export const ReleaseCertificatesBulkSchema = z
  .object({
    applicationIds: z.array(z.string().uuid()).min(1).max(1000),
  })
  .transform((value) => ({
    applicationIds: dedupeNonEmptyStrings(value.applicationIds) ?? [],
  }));

export type ReleaseCertificatesBulkDto = z.infer<
  typeof ReleaseCertificatesBulkSchema
>;

export const CertificateRenderJobStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'DONE',
  'FAILED',
]);

export type CertificateRenderJobStatus = z.infer<
  typeof CertificateRenderJobStatusSchema
>;

export const IssuedCertificateStatusSchema = z.enum(['ISSUED', 'REVOKED']);

export type IssuedCertificateStatus = z.infer<
  typeof IssuedCertificateStatusSchema
>;

export const IssuedCertificateResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  applicationId: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  templateVersionId: z.string().uuid().nullable(),
  templateName: z.string().nullable(),
  templateVersionNumber: z.number().int().nullable(),
  certificateTypeKey: z.string(),
  certificateTypeLabel: z.string(),
  certificateId: z.string().uuid(),
  credentialId: z.string().uuid(),
  status: IssuedCertificateStatusSchema,
  issuerName: z.string(),
  issuedAt: z.coerce.date(),
  releasedAt: z.coerce.date().nullable(),
  releasedBy: z.string().uuid().nullable(),
  isReleased: z.boolean(),
  revokedAt: z.coerce.date().nullable(),
  certificateUrl: z.string().url(),
  verifiableCredentialUrl: z.string().url(),
  qrVerificationUrl: z.string().url(),
  pdfUrl: z.string().url().nullable(),
  pdfStorageKey: z.string().nullable(),
  pdfGeneratedAt: z.coerce.date().nullable(),
  renderStatus: CertificateRenderJobStatusSchema,
  renderError: z.string().nullable(),
});

export type IssuedCertificateResponse = z.infer<
  typeof IssuedCertificateResponseSchema
>;

export const ListIssuedCertificatesQuerySchema = z.object({
  applicationId: z.string().uuid().optional(),
  certificateTypeKey: z.string().trim().max(80).optional(),
  status: IssuedCertificateStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListIssuedCertificatesQueryDto = z.infer<
  typeof ListIssuedCertificatesQuerySchema
>;

export const CertificateRenderJobResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  issuedCertificateId: z.string().uuid(),
  status: CertificateRenderJobStatusSchema,
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  nextRetryAt: z.coerce.date(),
  lockedAt: z.coerce.date().nullable(),
  lockedBy: z.string().nullable(),
  errorMessage: z.string().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CertificateRenderJobResponse = z.infer<
  typeof CertificateRenderJobResponseSchema
>;

export const ListCertificateRenderJobsQuerySchema = z.object({
  status: CertificateRenderJobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListCertificateRenderJobsQueryDto = z.infer<
  typeof ListCertificateRenderJobsQuerySchema
>;

export const CertificatePdfExportJobStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'DONE',
  'FAILED',
]);

export type CertificatePdfExportJobStatus = z.infer<
  typeof CertificatePdfExportJobStatusSchema
>;

export const CreateCertificatePdfExportJobSchema = z
  .object({
    issuedCertificateIds: z.array(z.string().uuid()).min(1).max(5000),
  })
  .transform((value) => ({
    issuedCertificateIds: dedupeNonEmptyStrings(value.issuedCertificateIds) ?? [],
  }));

export type CreateCertificatePdfExportJobDto = z.infer<
  typeof CreateCertificatePdfExportJobSchema
>;

export const CertificatePdfExportJobResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  status: CertificatePdfExportJobStatusSchema,
  issuedCertificateIdsCount: z.number().int().min(0),
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  nextRetryAt: z.coerce.date(),
  lockedAt: z.coerce.date().nullable(),
  lockedBy: z.string().nullable(),
  errorMessage: z.string().nullable(),
  outputFilename: z.string().nullable(),
  outputSizeBytes: z.coerce.number().int().min(0).nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CertificatePdfExportJobResponse = z.infer<
  typeof CertificatePdfExportJobResponseSchema
>;

export const CertificatePdfExportJobDownloadUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.coerce.date(),
  filename: z.string().trim().min(1),
});

export type CertificatePdfExportJobDownloadUrlResponse = z.infer<
  typeof CertificatePdfExportJobDownloadUrlResponseSchema
>;

export const CertificateAssetKindSchema = z.enum([
  'background',
  'signature',
  'logo',
  'image',
]);

export type CertificateAssetKind = z.infer<typeof CertificateAssetKindSchema>;

export const RegisterCertificateAssetUploadSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.coerce.number().int().min(1).max(150 * 1024 * 1024),
  kind: CertificateAssetKindSchema.default('image'),
});

export type RegisterCertificateAssetUploadDto = z.infer<
  typeof RegisterCertificateAssetUploadSchema
>;
