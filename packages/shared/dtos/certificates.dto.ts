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

export const CertificateTemplateElementSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: CertificateElementTypeSchema,
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive(),
    zIndex: z.number().int().min(0).max(9999).optional().default(0),
    content: z.string().max(1000).optional(),
    token: z.string().max(120).optional(),
    assetKey: z.string().max(500).optional(),
    signatureSlotKey: z.string().max(120).optional(),
    style: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .passthrough();

export type CertificateTemplateElement = z.infer<
  typeof CertificateTemplateElementSchema
>;

export const CertificateSignatureSlotSchema = z
  .object({
    key: z.string().min(1).max(120),
    label: z.string().min(1).max(120),
    signerName: z.string().max(160).optional(),
    signerTitle: z.string().max(160).optional(),
    assetKey: z.string().max(500).optional(),
  })
  .passthrough();

export type CertificateSignatureSlot = z.infer<
  typeof CertificateSignatureSlotSchema
>;

export const CertificateLayoutSchema = z
  .object({
    version: z.number().int().min(1).default(1),
    canvas: z
      .object({
        width: z.number().positive().max(8000).default(1600),
        height: z.number().positive().max(8000).default(1131),
        unit: z.enum(['px']).default('px'),
        backgroundColor: z.string().regex(HEX_COLOR).optional(),
        backgroundAssetKey: z.string().max(500).optional(),
      })
      .passthrough(),
    elements: z.array(CertificateTemplateElementSchema).default([]),
    signatureSlots: z.array(CertificateSignatureSlotSchema).optional().default([]),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .passthrough();

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
});

export type CertificateTemplateResponse = z.infer<
  typeof CertificateTemplateResponseSchema
>;

export const IssueCertificateSchema = z.object({
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid().optional(),
  applicationId: z.string().uuid(),
  issuerName: z.string().trim().min(1).max(200).optional(),
  payloadOverrides: z.record(z.string(), z.unknown()).optional().default({}),
});

export type IssueCertificateDto = z.infer<typeof IssueCertificateSchema>;

export const IssueCertificatesBulkSchema = z.object({
  templateId: z.string().uuid(),
  templateVersionId: z.string().uuid().optional(),
  applicationIds: z.array(z.string().uuid()).min(1).max(1000),
  issuerName: z.string().trim().min(1).max(200).optional(),
  payloadOverrides: z.record(z.string(), z.unknown()).optional().default({}),
});

export type IssueCertificatesBulkDto = z.infer<typeof IssueCertificatesBulkSchema>;

export const RevokeIssuedCertificateSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type RevokeIssuedCertificateDto = z.infer<
  typeof RevokeIssuedCertificateSchema
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
