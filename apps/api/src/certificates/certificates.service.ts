import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { StorageService } from '../common/storage/storage.service';
import {
  CreateCertificateTemplateDto,
  CreateCertificateTemplateVersionDto,
  DuplicateCertificateTemplateDto,
  FileSensitivity,
  IssueCertificateDto,
  IssueCertificatesBulkDto,
  ListCertificateRenderJobsQueryDto,
  ListCertificateTemplatesQueryDto,
  ListIssuedCertificatesQueryDto,
  PublishCertificateTemplateDto,
  RegisterCertificateAssetUploadDto,
  RevokeIssuedCertificateDto,
  UpdateCertificateTemplateDraftDto,
  UpdateCertificateTemplateDto,
} from '@event-platform/shared';
import { Prisma } from '@event-platform/db';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { joinAppUrl, resolveAppBaseUrl } from '../common/utils/export-csv.util';

const CERTIFICATE_ASSET_PREFIX = /^events\/[^/]+\/certificates\/assets\/.+/;
const CERTIFICATE_PDF_PREFIX = /^events\/[^/]+\/certificates\/pdf\/.+/;

interface QrSigningConfig {
  activeKid: string;
  keys: Map<string, string>;
}

type IssuedCertificateForRender = {
  id: string;
  event_id: string;
  certificate_id: string;
  credential_id: string;
  certificate_type_label: string;
  issuer_name: string;
  issued_at: Date;
  payload_snapshot: unknown;
  applications: {
    id: string;
    users_applications_applicant_user_idTousers: {
      applicant_profiles: {
        first_name: string | null;
        last_name: string | null;
        full_name: string | null;
      } | null;
    } | null;
  };
  events: {
    title: string;
  };
};

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly storageService: StorageService,
  ) {}

  private getActorId(): string {
    const actorId = this.cls.get('actorId');
    if (!actorId || typeof actorId !== 'string') {
      throw new ForbiddenException('Authenticated actor required');
    }
    return actorId;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private isCertificateStudioSchemaMissing(error: unknown): boolean {
    const knownErrorCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : '';
    if (knownErrorCode === 'P2021' || knownErrorCode === 'P2022') {
      return true;
    }

    const message = String(
      (
        error as
          | { message?: string; meta?: { cause?: string; table?: string } }
          | undefined
      )?.message ??
        (error as { meta?: { cause?: string } } | undefined)?.meta?.cause ??
        '',
    ).toLowerCase();

    return (
      message.includes('certificate_templates') ||
      message.includes('certificate_template_versions')
    );
  }

  private normalizeMimeType(rawMimeType: string | undefined): string {
    const normalized = String(rawMimeType ?? 'application/octet-stream')
      .trim()
      .toLowerCase();
    if (normalized === 'image/jpg' || normalized === 'image/pjpeg') {
      return 'image/jpeg';
    }
    return normalized;
  }

  private getAppBaseUrl(): string {
    return resolveAppBaseUrl(process.env);
  }

  private getCredentialIssuerName(): string {
    const issuer = (process.env.CREDENTIAL_ISSUER ?? '').trim();
    if (issuer.length > 0) return issuer;
    return 'Math&Maroc Event Platform';
  }

  private getCredentialSigningSecret(): string {
    const explicit = (process.env.CREDENTIAL_SIGNING_SECRET ?? '').trim();
    if (explicit.length > 0) return explicit;

    const jwtSecret = (process.env.JWT_SECRET ?? '').trim();
    if (jwtSecret.length > 0) return jwtSecret;

    throw new Error(
      'CREDENTIAL_SIGNING_SECRET or JWT_SECRET must be configured',
    );
  }

  private parseQrSigningConfig(): QrSigningConfig {
    const parsed = new Map<string, string>();
    const fromEnv = (process.env.CERTIFICATE_QR_SIGNING_KEYS ?? '').trim();

    if (fromEnv.length > 0) {
      const segments = fromEnv
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

      for (const segment of segments) {
        const index = segment.indexOf(':');
        if (index <= 0) continue;
        const kid = segment.slice(0, index).trim();
        const key = segment.slice(index + 1).trim();
        if (!kid || !key) continue;
        parsed.set(kid, key);
      }
    }

    if (parsed.size === 0) {
      parsed.set('legacy', this.getCredentialSigningSecret());
    }

    const configuredActiveKid =
      (process.env.CERTIFICATE_QR_ACTIVE_KEY_ID ?? '').trim() ||
      (process.env.CREDENTIAL_QR_ACTIVE_KEY_ID ?? '').trim();

    const activeKid =
      configuredActiveKid && parsed.has(configuredActiveKid)
        ? configuredActiveKid
        : Array.from(parsed.keys())[0];

    return { activeKid, keys: parsed };
  }

  private signQrToken(payload: {
    eventId: string;
    certificateId: string;
    credentialId: string;
  }): { token: string; kid: string } {
    const config = this.parseQrSigningConfig();
    const signingSecret = config.keys.get(config.activeKid);
    if (!signingSecret) {
      throw new Error('Missing QR signing key for active key ID');
    }

    const token = jwt.sign(payload, signingSecret, {
      algorithm: 'HS256',
      keyid: config.activeKid,
    });

    return { token, kid: config.activeKid };
  }

  private verifyQrToken(token: string): {
    eventId: string;
    certificateId: string;
    credentialId: string;
  } {
    const config = this.parseQrSigningConfig();
    const decoded = jwt.decode(token, { complete: true });
    const kid =
      decoded && typeof decoded === 'object'
        ? String((decoded as { header?: { kid?: unknown } }).header?.kid ?? '')
        : '';

    const tryVerify = (secret: string) => {
      const verified = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
      const claims = this.toRecord(verified);
      const eventId = String(claims.eventId ?? '').trim();
      const certificateId = String(claims.certificateId ?? '').trim();
      const credentialId = String(claims.credentialId ?? '').trim();

      if (!eventId || !certificateId || !credentialId) {
        throw new BadRequestException('QR token payload is invalid');
      }

      return { eventId, certificateId, credentialId };
    };

    if (kid && config.keys.has(kid)) {
      return tryVerify(config.keys.get(kid) as string);
    }

    for (const [, secret] of config.keys) {
      try {
        return tryVerify(secret);
      } catch {
        // continue
      }
    }

    throw new BadRequestException('QR token is invalid');
  }

  private getCredentialLinks(certificateId: string, credentialId: string) {
    const base = this.getAppBaseUrl();
    return {
      certificateUrl: joinAppUrl(base, `/credentials/certificate/${certificateId}`),
      verifiableCredentialUrl: joinAppUrl(base, `/credentials/verify/${credentialId}`),
    };
  }

  private getQrVerificationUrl(token: string): string {
    return joinAppUrl(
      this.getAppBaseUrl(),
      `/credentials/qr/${encodeURIComponent(token)}`,
    );
  }

  private getCertificatePdfUrl(certificateId: string): string {
    return joinAppUrl(
      this.getAppBaseUrl(),
      `/credentials/certificate/${certificateId}/pdf`,
    );
  }

  private buildIssuedCertificateSignature(input: {
    eventId: string;
    applicationId: string;
    certificateId: string;
    credentialId: string;
    certificateTypeKey: string;
    participantName: string;
    issuedAt: Date;
  }): string {
    const payload = [
      input.eventId,
      input.applicationId,
      input.certificateId,
      input.credentialId,
      input.certificateTypeKey,
      input.participantName,
      input.issuedAt.toISOString(),
    ].join('|');

    return createHmac('sha256', this.getCredentialSigningSecret())
      .update(payload)
      .digest('hex');
  }

  private getDisplayName(profile: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  } | null | undefined): string {
    const first = profile?.first_name?.trim?.() ?? '';
    const last = profile?.last_name?.trim?.() ?? '';
    const full = profile?.full_name?.trim?.() ?? '';
    return [first, last].filter(Boolean).join(' ') || full || 'Attendee';
  }

  private mapTemplateRow(
    row: any,
    activeVersion?: { id: string; version_number: number } | null,
  ) {
    return {
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      typeKey: row.type_key,
      typeLabel: row.type_label,
      description: row.description ?? null,
      isActive: Boolean(row.is_active),
      isDefault: Boolean(row.is_default),
      metadata: this.toRecord(row.metadata),
      archivedAt: row.archived_at ?? null,
      createdBy: row.created_by,
      updatedBy: row.updated_by ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activeVersionId: activeVersion?.id ?? null,
      activeVersionNumber: activeVersion?.version_number ?? null,
      draftRevision: Number(row.draft_revision ?? 0),
      draftUpdatedAt: row.draft_updated_at ?? null,
      layoutSchemaVersion: Number(row.layout_schema_version ?? 2),
    };
  }

  private mapTemplateVersionRow(row: any) {
    return {
      id: row.id,
      templateId: row.template_id,
      versionNumber: row.version_number,
      layout: row.layout_json,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  private getTemplateDraftLayout(row: any) {
    const draft = this.toRecord(row?.draft_layout_json);
    const metadata = this.toRecord(draft.metadata);
    const canvas = this.toRecord(draft.canvas);
    const normalizedCanvas: Record<string, unknown> = {
      width: Number(canvas.width ?? 1600),
      height: Number(canvas.height ?? 1131),
      unit: String(canvas.unit ?? 'px'),
      gridSize: Number(canvas.gridSize ?? 8),
      snapEnabled:
        typeof canvas.snapEnabled === 'boolean' ? canvas.snapEnabled : true,
    };
    if (typeof canvas.backgroundColor === 'string') {
      normalizedCanvas.backgroundColor = canvas.backgroundColor;
    }
    if (typeof canvas.backgroundAssetKey === 'string') {
      normalizedCanvas.backgroundAssetKey = canvas.backgroundAssetKey;
    }

    return {
      layoutSchemaVersion: 2,
      canvas: normalizedCanvas,
      elements: Array.isArray(draft.elements) ? draft.elements : [],
      signatureSlots: Array.isArray(draft.signatureSlots)
        ? draft.signatureSlots
        : [],
      metadata,
    };
  }

  private async getTemplateForEvent(eventId: string, templateId: string) {
    const template = await (this.prisma as any).certificate_templates.findFirst({
      where: { id: templateId, event_id: eventId },
    });
    if (!template) {
      throw new NotFoundException('Certificate template not found');
    }
    return template;
  }

  private async getTemplateVersion(
    templateId: string,
    versionId?: string,
  ): Promise<any> {
    if (versionId) {
      const explicitVersion = await (this.prisma as any).certificate_template_versions.findFirst({
        where: {
          id: versionId,
          template_id: templateId,
        },
      });
      if (!explicitVersion) {
        throw new NotFoundException('Certificate template version not found');
      }
      return explicitVersion;
    }

    const template = await (this.prisma as any).certificate_templates.findUnique({
      where: { id: templateId },
      select: { active_version_id: true },
    });

    if (!template) {
      throw new NotFoundException('Certificate template not found');
    }

    if (template.active_version_id) {
      const activeVersion = await (this.prisma as any).certificate_template_versions.findUnique({
        where: { id: template.active_version_id },
      });
      if (activeVersion) return activeVersion;
    }

    const fallbackVersion = await (this.prisma as any).certificate_template_versions.findFirst({
      where: { template_id: templateId },
      orderBy: { version_number: 'desc' },
    });

    if (!fallbackVersion) {
      throw new NotFoundException(
        'Certificate template has no versions yet',
      );
    }

    return fallbackVersion;
  }

  private async getApplicationForIssuance(eventId: string, applicationId: string) {
    const application = await (this.prisma as any).applications.findFirst({
      where: { id: applicationId, event_id: eventId },
      include: {
        attendance_records: {
          select: {
            status: true,
            checked_in_at: true,
          },
        },
        users_applications_applicant_user_idTousers: {
          select: {
            id: true,
            email: true,
            applicant_profiles: {
              select: {
                first_name: true,
                last_name: true,
                full_name: true,
              },
            },
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  private async getEventForIssuance(eventId: string) {
    const event = await this.prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        start_at: true,
        end_at: true,
        venue_name: true,
        venue_address: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  private buildPayloadSnapshot(input: {
    application: any;
    event: any;
    template: any;
    issuedAt: Date;
    certificateId: string;
    credentialId: string;
    payloadOverrides?: Record<string, unknown>;
    qrVerificationUrl: string;
  }): Record<string, unknown> {
    const participantName = this.getDisplayName(
      input.application.users_applications_applicant_user_idTousers
        ?.applicant_profiles,
    );

    const links = this.getCredentialLinks(
      input.certificateId,
      input.credentialId,
    );

    const basePayload: Record<string, unknown> = {
      participantName,
      participantEmail:
        input.application.users_applications_applicant_user_idTousers?.email ?? '',
      eventTitle: input.event.title,
      eventSlug: input.event.slug,
      eventId: input.event.id,
      applicationId: input.application.id,
      certificateId: input.certificateId,
      credentialId: input.credentialId,
      certificateTypeKey: input.template.type_key,
      certificateTypeLabel: input.template.type_label,
      issuedAt: input.issuedAt.toISOString(),
      issuedDate: input.issuedAt.toISOString().split('T')[0],
      verificationUrl: links.verifiableCredentialUrl,
      certificateUrl: links.certificateUrl,
      qrVerificationUrl: input.qrVerificationUrl,
      issuerName: this.getCredentialIssuerName(),
      eventLocation:
        input.event.venue_name?.trim() || input.event.venue_address?.trim() || '',
    };

    return {
      ...basePayload,
      ...(input.payloadOverrides ?? {}),
    };
  }

  private mapIssuedCertificateRow(row: any) {
    const links = this.getCredentialLinks(row.certificate_id, row.credential_id);
    const qrVerificationUrl = this.getQrVerificationUrl(row.qr_token);
    const pdfUrl = row.pdf_storage_key
      ? this.getCertificatePdfUrl(row.certificate_id)
      : null;

    const templateSnapshot = this.toRecord(row.template_snapshot);
    const snapshotVersionNumber = Number(templateSnapshot.versionNumber ?? 0);
    const normalizedSnapshotVersionNumber =
      Number.isFinite(snapshotVersionNumber) && snapshotVersionNumber > 0
        ? snapshotVersionNumber
        : null;

    return {
      id: row.id,
      eventId: row.event_id,
      applicationId: row.application_id,
      templateId: row.template_id ?? null,
      templateVersionId: row.template_version_id ?? null,
      templateName:
        row.certificate_templates?.name ??
        String(templateSnapshot.name ?? ''),
      templateVersionNumber:
        row.certificate_template_versions?.version_number ??
        normalizedSnapshotVersionNumber,
      certificateTypeKey: row.certificate_type_key,
      certificateTypeLabel: row.certificate_type_label,
      certificateId: row.certificate_id,
      credentialId: row.credential_id,
      status:
        row.revoked_at || String(row.status).toUpperCase() === 'REVOKED'
          ? 'REVOKED'
          : 'ISSUED',
      issuerName: row.issuer_name,
      issuedAt: row.issued_at,
      revokedAt: row.revoked_at ?? null,
      certificateUrl: links.certificateUrl,
      verifiableCredentialUrl: links.verifiableCredentialUrl,
      qrVerificationUrl,
      pdfUrl,
      pdfStorageKey: row.pdf_storage_key ?? null,
      pdfGeneratedAt: row.pdf_generated_at ?? null,
      renderStatus: String(row.render_status ?? 'PENDING').toUpperCase(),
      renderError: row.render_error ?? null,
    };
  }

  async listTemplates(
    eventId: string,
    query: ListCertificateTemplatesQueryDto,
  ) {
    const where: Record<string, unknown> = {
      event_id: eventId,
    };

    if (!query.includeArchived) {
      where.archived_at = null;
    }

    if (query.typeKey && query.typeKey.trim()) {
      where.type_key = query.typeKey.trim().toLowerCase();
    }

    try {
      const templates = await (this.prisma as any).certificate_templates.findMany({
        where,
        orderBy: [
          { type_key: 'asc' },
          { is_default: 'desc' },
          { created_at: 'desc' },
        ],
      });

      const activeVersionIds = Array.from(
        new Set(
          templates
            .map((template: any) => template.active_version_id)
            .filter((id: string | null): id is string => Boolean(id)),
        ),
      );

      const activeVersions = activeVersionIds.length
        ? await (this.prisma as any).certificate_template_versions.findMany({
            where: { id: { in: activeVersionIds } },
            select: { id: true, version_number: true },
          })
        : [];

      const activeVersionById = new Map<
        string,
        { id: string; version_number: number }
      >(
        (activeVersions as Array<{ id: string; version_number: number }>).map(
          (version) => [version.id, version],
        ),
      );

      return templates.map((template: any) =>
        this.mapTemplateRow(
          template,
          template.active_version_id
            ? activeVersionById.get(template.active_version_id) ?? null
            : null,
        ),
      );
    } catch (error) {
      if (this.isCertificateStudioSchemaMissing(error)) {
        this.logger.warn(
          `Certificate Studio schema missing while listing templates for event ${eventId}. Returning an empty result.`,
        );
        return [];
      }
      throw error;
    }
  }

  async createTemplate(eventId: string, dto: CreateCertificateTemplateDto) {
    const actorId = this.getActorId();
    const typeKey = dto.typeKey.trim().toLowerCase();

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await (tx as any).certificate_templates.updateMany({
          where: {
            event_id: eventId,
            type_key: typeKey,
            archived_at: null,
            is_default: true,
          },
          data: {
            is_default: false,
            updated_by: actorId,
            updated_at: new Date(),
          },
        });
      }

      return (tx as any).certificate_templates.create({
        data: {
          id: crypto.randomUUID(),
          event_id: eventId,
          name: dto.name.trim(),
          type_key: typeKey,
          type_label: dto.typeLabel.trim(),
          description: dto.description?.trim() || null,
          is_active: true,
          is_default: Boolean(dto.isDefault),
          metadata: dto.metadata ?? {},
          layout_schema_version: 2,
          draft_layout_json: dto.layout,
          draft_revision: 0,
          draft_updated_at: new Date(),
          created_by: actorId,
          updated_by: actorId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    return this.mapTemplateRow(created, null);
  }

  async updateTemplate(
    eventId: string,
    templateId: string,
    dto: UpdateCertificateTemplateDto,
  ) {
    const actorId = this.getActorId();
    const existing = await this.getTemplateForEvent(eventId, templateId);

    const nextTypeKey = dto.typeKey
      ? dto.typeKey.trim().toLowerCase()
      : existing.type_key;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await (tx as any).certificate_templates.updateMany({
          where: {
            event_id: eventId,
            type_key: nextTypeKey,
            archived_at: null,
            is_default: true,
            id: { not: templateId },
          },
          data: {
            is_default: false,
            updated_by: actorId,
            updated_at: new Date(),
          },
        });
      }

      const data: Record<string, unknown> = {
        updated_at: new Date(),
        updated_by: actorId,
      };

      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.typeKey !== undefined) data.type_key = nextTypeKey;
      if (dto.typeLabel !== undefined) data.type_label = dto.typeLabel.trim();
      if (dto.description !== undefined)
        data.description = dto.description ? dto.description.trim() : null;
      if (dto.isDefault !== undefined) data.is_default = dto.isDefault;
      if (dto.metadata !== undefined) data.metadata = dto.metadata;
      if (dto.isActive !== undefined) {
        data.is_active = dto.isActive;
        data.archived_at = dto.isActive ? null : new Date();
      }

      return (tx as any).certificate_templates.update({
        where: { id: templateId },
        data,
      });
    });

    const activeVersion = updated.active_version_id
      ? await (this.prisma as any).certificate_template_versions.findUnique({
          where: { id: updated.active_version_id },
          select: { id: true, version_number: true },
        })
      : null;

    return this.mapTemplateRow(updated, activeVersion);
  }

  async deleteTemplate(eventId: string, templateId: string) {
    await this.getTemplateForEvent(eventId, templateId);
    await (this.prisma as any).certificate_templates.delete({
      where: { id: templateId },
    });
  }

  async getTemplateDraft(eventId: string, templateId: string) {
    const template = await this.getTemplateForEvent(eventId, templateId);
    return {
      templateId: template.id,
      revision: Number(template.draft_revision ?? 0),
      layout: this.getTemplateDraftLayout(template),
      updatedAt: template.draft_updated_at ?? null,
    };
  }

  async upsertTemplateDraft(
    eventId: string,
    templateId: string,
    dto: UpdateCertificateTemplateDraftDto,
  ) {
    const actorId = this.getActorId();
    const existing = await this.getTemplateForEvent(eventId, templateId);
    const currentRevision = Number(existing.draft_revision ?? 0);

    if (dto.revision !== currentRevision) {
      throw new ConflictException(
        `Draft revision conflict. Current revision is ${currentRevision}.`,
      );
    }

    const updated = await (this.prisma as any).certificate_templates.update({
      where: { id: templateId },
      data: {
        draft_layout_json: dto.layout,
        layout_schema_version: 2,
        draft_revision: currentRevision + 1,
        draft_updated_at: new Date(),
        updated_by: actorId,
        updated_at: new Date(),
      },
    });

    return {
      templateId: updated.id,
      revision: Number(updated.draft_revision ?? 0),
      layout: this.getTemplateDraftLayout(updated),
      updatedAt: updated.draft_updated_at ?? null,
    };
  }

  async publishTemplate(
    eventId: string,
    templateId: string,
    dto: PublishCertificateTemplateDto,
  ) {
    const actorId = this.getActorId();
    await this.getTemplateForEvent(eventId, templateId);

    const created = await this.prisma.$transaction(async (tx) => {
      const template = await (tx as any).certificate_templates.findFirst({
        where: { id: templateId, event_id: eventId },
      });

      if (!template) {
        throw new NotFoundException('Certificate template not found');
      }

      const latestVersion = await (tx as any).certificate_template_versions.findFirst({
        where: { template_id: templateId },
        orderBy: { version_number: 'desc' },
        select: { version_number: true },
      });

      const nextVersion = Number(latestVersion?.version_number ?? 0) + 1;
      const version = await (tx as any).certificate_template_versions.create({
        data: {
          id: crypto.randomUUID(),
          template_id: templateId,
          version_number: nextVersion,
          layout_json: this.getTemplateDraftLayout(template),
          created_by: actorId,
          created_at: new Date(),
        },
      });

      const updatedTemplate = await (tx as any).certificate_templates.update({
        where: { id: templateId },
        data: {
          updated_by: actorId,
          updated_at: new Date(),
          active_version_id: dto.activate ? version.id : template.active_version_id,
        },
      });

      return { template: updatedTemplate, version };
    });

    return {
      template: this.mapTemplateRow(created.template, {
        id: created.version.id,
        version_number: created.version.version_number,
      }),
      version: this.mapTemplateVersionRow(created.version),
    };
  }

  async duplicateTemplate(
    eventId: string,
    templateId: string,
    dto: DuplicateCertificateTemplateDto,
  ) {
    const actorId = this.getActorId();
    const source = await this.getTemplateForEvent(eventId, templateId);
    const preferredName = (dto.name ?? '').trim() || `${source.name} Copy`;

    const created = await this.prisma.$transaction(async (tx) => {
      let name = preferredName;
      let suffix = 2;

      // Resolve unique name per event.
      while (
        await (tx as any).certificate_templates.findFirst({
          where: { event_id: eventId, name },
          select: { id: true },
        })
      ) {
        name = `${preferredName} ${suffix}`;
        suffix += 1;
      }

      return (tx as any).certificate_templates.create({
        data: {
          id: crypto.randomUUID(),
          event_id: eventId,
          name,
          type_key: source.type_key,
          type_label: source.type_label,
          description: source.description ?? null,
          is_active: Boolean(source.is_active),
          is_default: false,
          metadata: source.metadata ?? {},
          layout_schema_version: 2,
          draft_layout_json: this.getTemplateDraftLayout(source),
          draft_revision: 0,
          draft_updated_at: new Date(),
          created_by: actorId,
          updated_by: actorId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    return this.mapTemplateRow(created, null);
  }

  async listTemplateVersions(eventId: string, templateId: string) {
    await this.getTemplateForEvent(eventId, templateId);

    const versions = await (this.prisma as any).certificate_template_versions.findMany({
      where: { template_id: templateId },
      orderBy: { version_number: 'desc' },
    });

    return versions.map((version: any) => this.mapTemplateVersionRow(version));
  }

  async createTemplateVersion(
    eventId: string,
    templateId: string,
    dto: CreateCertificateTemplateVersionDto,
  ) {
    const actorId = this.getActorId();
    await this.getTemplateForEvent(eventId, templateId);

    const created = await this.prisma.$transaction(async (tx) => {
      const latestVersion = await (tx as any).certificate_template_versions.findFirst({
        where: { template_id: templateId },
        orderBy: { version_number: 'desc' },
        select: { version_number: true },
      });

      const nextVersion = Number(latestVersion?.version_number ?? 0) + 1;
      const version = await (tx as any).certificate_template_versions.create({
        data: {
          id: crypto.randomUUID(),
          template_id: templateId,
          version_number: nextVersion,
          layout_json: dto.layout,
          created_by: actorId,
          created_at: new Date(),
        },
      });

      await (tx as any).certificate_templates.update({
        where: { id: templateId },
        data: {
          updated_at: new Date(),
          updated_by: actorId,
        },
      });

      return version;
    });

    return this.mapTemplateVersionRow(created);
  }

  async activateTemplateVersion(
    eventId: string,
    templateId: string,
    versionId: string,
  ) {
    const actorId = this.getActorId();
    await this.getTemplateForEvent(eventId, templateId);
    const version = await this.getTemplateVersion(templateId, versionId);

    const updatedTemplate = await (this.prisma as any).certificate_templates.update({
      where: { id: templateId },
      data: {
        active_version_id: version.id,
        updated_by: actorId,
        updated_at: new Date(),
      },
    });

    return this.mapTemplateRow(updatedTemplate, {
      id: version.id,
      version_number: version.version_number,
    });
  }

  private async issueOneCertificate(
    eventId: string,
    input: {
      templateId: string;
      templateVersionId?: string;
      applicationId: string;
      issuerName?: string;
      reissueIfExists?: boolean;
      payloadOverrides?: Record<string, unknown>;
    },
  ): Promise<{ certificate: any; created: boolean }> {
    const template = await this.getTemplateForEvent(eventId, input.templateId);
    if (!template.is_active || template.archived_at) {
      throw new BadRequestException('Certificate template is archived');
    }

    const templateVersion = await this.getTemplateVersion(
      template.id,
      input.templateVersionId,
    );

    const [application, event] = await Promise.all([
      this.getApplicationForIssuance(eventId, input.applicationId),
      this.getEventForIssuance(eventId),
    ]);

    if (template.type_key === 'participation') {
      const status = String(application.attendance_records?.status ?? '').toUpperCase();
      if (
        status !== 'CHECKED_IN' ||
        !application.attendance_records?.checked_in_at
      ) {
        throw new BadRequestException(
          'Participation certificates require checked-in attendance',
        );
      }
    }

    const existingActive = await (this.prisma as any).issued_certificates.findFirst({
      where: {
        application_id: application.id,
        certificate_type_key: template.type_key,
        revoked_at: null,
      },
      include: {
        certificate_templates: {
          select: { name: true },
        },
        certificate_template_versions: {
          select: { version_number: true },
        },
      },
    });

    if (existingActive && !input.reissueIfExists) {
      return {
        certificate: this.mapIssuedCertificateRow(existingActive),
        created: false,
      };
    }

    const issuedAt = new Date();
    const certificateId = crypto.randomUUID();
    const credentialId = crypto.randomUUID();

    const signedQr = this.signQrToken({
      eventId,
      certificateId,
      credentialId,
    });

    const qrVerificationUrl = this.getQrVerificationUrl(signedQr.token);
    const payloadSnapshot = this.buildPayloadSnapshot({
      application,
      event,
      template,
      issuedAt,
      certificateId,
      credentialId,
      payloadOverrides: input.payloadOverrides,
      qrVerificationUrl,
    });

    const participantName = String(payloadSnapshot.participantName ?? 'Attendee');

    const signature = this.buildIssuedCertificateSignature({
      eventId,
      applicationId: application.id,
      certificateId,
      credentialId,
      certificateTypeKey: template.type_key,
      participantName,
      issuedAt,
    });

    const templateSnapshot = {
      id: template.id,
      name: template.name,
      typeKey: template.type_key,
      typeLabel: template.type_label,
      versionId: templateVersion.id,
      versionNumber: templateVersion.version_number,
      layout: templateVersion.layout_json,
      metadata: template.metadata ?? {},
    };

    const issuerName =
      input.issuerName?.trim() || this.getCredentialIssuerName();

    const created = await this.prisma.$transaction(async (tx) => {
      if (existingActive && input.reissueIfExists) {
        await (tx as any).issued_certificates.update({
          where: { id: existingActive.id },
          data: {
            status: 'REVOKED',
            revoked_at: issuedAt,
            updated_at: issuedAt,
          },
        });
      }

      const issued = await (tx as any).issued_certificates.create({
        data: {
          id: crypto.randomUUID(),
          event_id: eventId,
          application_id: application.id,
          template_id: template.id,
          template_version_id: templateVersion.id,
          certificate_type_key: template.type_key,
          certificate_type_label: template.type_label,
          certificate_id: certificateId,
          credential_id: credentialId,
          credential_signature: signature,
          qr_token: signedQr.token,
          qr_key_id: signedQr.kid,
          issuer_name: issuerName,
          status: 'ISSUED',
          issued_at: issuedAt,
          template_snapshot: templateSnapshot,
          payload_snapshot: payloadSnapshot,
          render_status: 'PENDING',
          render_error: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      await (tx as any).certificate_render_jobs.create({
        data: {
          id: crypto.randomUUID(),
          event_id: eventId,
          issued_certificate_id: issued.id,
          status: 'PENDING',
          attempts: 0,
          max_attempts: Math.max(
            Number(process.env.CERTIFICATE_RENDER_MAX_ATTEMPTS ?? 5),
            1,
          ),
          next_retry_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      return (tx as any).issued_certificates.findUnique({
        where: { id: issued.id },
        include: {
          certificate_templates: {
            select: { name: true },
          },
          certificate_template_versions: {
            select: { version_number: true },
          },
        },
      });
    });

    return {
      certificate: this.mapIssuedCertificateRow(created),
      created: true,
    };
  }

  async issueCertificate(eventId: string, dto: IssueCertificateDto) {
    const result = await this.issueOneCertificate(eventId, {
      templateId: dto.templateId,
      templateVersionId: dto.templateVersionId,
      applicationId: dto.applicationId,
      issuerName: dto.issuerName,
      reissueIfExists: dto.reissueIfExists,
      payloadOverrides: dto.payloadOverrides ?? {},
    });

    return {
      ...result.certificate,
      created: result.created,
    };
  }

  async issueCertificatesBulk(eventId: string, dto: IssueCertificatesBulkDto) {
    const uniqueApplicationIds = Array.from(new Set(dto.applicationIds));

    const summary = {
      requested: uniqueApplicationIds.length,
      issued: 0,
      alreadyIssued: 0,
      notFound: [] as string[],
      failed: [] as Array<{ applicationId: string; reason: string }>,
      certificates: [] as any[],
    };

    for (const applicationId of uniqueApplicationIds) {
      try {
        const result = await this.issueOneCertificate(eventId, {
          templateId: dto.templateId,
          templateVersionId: dto.templateVersionId,
          applicationId,
          issuerName: dto.issuerName,
          reissueIfExists: dto.reissueIfExists,
          payloadOverrides: dto.payloadOverrides ?? {},
        });

        if (result.created) {
          summary.issued += 1;
        } else {
          summary.alreadyIssued += 1;
        }
        summary.certificates.push(result.certificate);
      } catch (error) {
        if (error instanceof NotFoundException) {
          summary.notFound.push(applicationId);
          continue;
        }

        summary.failed.push({
          applicationId,
          reason:
            error instanceof Error && error.message
              ? error.message
              : 'Failed to issue certificate',
        });
      }
    }

    return summary;
  }

  async revokeIssuedCertificate(
    eventId: string,
    issuedCertificateId: string,
    dto: RevokeIssuedCertificateDto,
  ) {
    const actorId = this.getActorId();
    const record = await (this.prisma as any).issued_certificates.findFirst({
      where: {
        id: issuedCertificateId,
        event_id: eventId,
      },
    });

    if (!record) {
      throw new NotFoundException('Issued certificate not found');
    }

    const revokedAt = new Date();
    const snapshot = this.toRecord(record.payload_snapshot);
    if (dto.reason && dto.reason.trim()) {
      snapshot.revocationReason = dto.reason.trim();
      snapshot.revokedBy = actorId;
    }

    const updated = await (this.prisma as any).issued_certificates.update({
      where: { id: record.id },
      data: {
        status: 'REVOKED',
        revoked_at: revokedAt,
        payload_snapshot: snapshot,
        updated_at: revokedAt,
      },
      include: {
        certificate_templates: {
          select: { name: true },
        },
        certificate_template_versions: {
          select: { version_number: true },
        },
      },
    });

    return this.mapIssuedCertificateRow(updated);
  }

  async listIssuedCertificates(
    eventId: string,
    query: ListIssuedCertificatesQueryDto,
  ) {
    const where: Record<string, unknown> = {
      event_id: eventId,
    };

    if (query.applicationId) {
      where.application_id = query.applicationId;
    }

    if (query.certificateTypeKey && query.certificateTypeKey.trim()) {
      where.certificate_type_key = query.certificateTypeKey.trim().toLowerCase();
    }

    if (query.status) {
      if (query.status === 'ISSUED') {
        where.revoked_at = null;
      } else if (query.status === 'REVOKED') {
        where.NOT = { revoked_at: null };
      }
    }

    const rows = await (this.prisma as any).issued_certificates.findMany({
      where,
      include: {
        certificate_templates: {
          select: { name: true },
        },
        certificate_template_versions: {
          select: { version_number: true },
        },
      },
      orderBy: [{ issued_at: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });

    return rows.map((row: any) => this.mapIssuedCertificateRow(row));
  }

  async listRenderJobs(eventId: string, query: ListCertificateRenderJobsQueryDto) {
    const where: Record<string, unknown> = {
      event_id: eventId,
    };

    if (query.status) {
      where.status = query.status;
    }

    const rows = await (this.prisma as any).certificate_render_jobs.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });

    return rows.map((row: any) => ({
      id: row.id,
      eventId: row.event_id,
      issuedCertificateId: row.issued_certificate_id,
      status: String(row.status).toUpperCase(),
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextRetryAt: row.next_retry_at,
      lockedAt: row.locked_at ?? null,
      lockedBy: row.locked_by ?? null,
      errorMessage: row.error_message ?? null,
      completedAt: row.completed_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async retryRenderJob(eventId: string, jobId: string) {
    const existing = await (this.prisma as any).certificate_render_jobs.findFirst({
      where: { id: jobId, event_id: eventId },
    });

    if (!existing) {
      throw new NotFoundException('Certificate render job not found');
    }

    const updated = await (this.prisma as any).certificate_render_jobs.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING',
        error_message: null,
        next_retry_at: new Date(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date(),
      },
    });

    return {
      id: updated.id,
      status: String(updated.status).toUpperCase(),
      nextRetryAt: updated.next_retry_at,
    };
  }

  async registerAssetUpload(
    eventId: string,
    dto: RegisterCertificateAssetUploadDto,
  ) {
    const userId = this.getActorId();
    const safeName = (dto.originalFilename || 'upload')
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120);

    const key = `events/${eventId}/certificates/assets/${dto.kind}/${crypto.randomUUID()}-${safeName}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    const file = await this.prisma.file_objects.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        storage_key: key,
        original_filename: dto.originalFilename,
        mime_type: dto.mimeType,
        size_bytes: BigInt(dto.sizeBytes),
        sensitivity: FileSensitivity.NORMAL,
        status: 'STAGED',
        expires_at: expiresAt,
        created_by: userId,
      },
    });

    const uploadUrl = await this.storageService.getPresignedPutUrl(
      key,
      dto.mimeType,
    );

    return {
      id: file.id,
      uploadUrl,
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes),
      kind: dto.kind,
    };
  }

  private async cleanupFailedUpload(key: string, fileId: string) {
    try {
      await this.storageService.deleteObject(key);
    } catch {
      // ignore
    }
    await this.prisma.file_objects.delete({ where: { id: fileId } });
  }

  async commitAssetUpload(eventId: string, fileId: string) {
    const actorId = this.getActorId();
    const file = await this.prisma.file_objects.findUnique({
      where: { id: fileId },
    });

    if (!file || file.event_id !== eventId) {
      throw new NotFoundException('Certificate asset not found');
    }

    if (file.created_by !== actorId) {
      throw new ForbiddenException('Access denied');
    }

    if (!CERTIFICATE_ASSET_PREFIX.test(file.storage_key)) {
      throw new BadRequestException('Asset storage key is invalid');
    }

    if (file.status === 'COMMITTED') {
      return {
        id: file.id,
        storageKey: file.storage_key,
        status: 'COMMITTED',
      };
    }

    let head;
    try {
      head = await this.storageService.getHeadObject(file.storage_key);
    } catch {
      throw new BadRequestException('File not found in storage');
    }

    const actualSize = Number(head?.ContentLength ?? 0);
    const expectedMime = this.normalizeMimeType(file.mime_type);
    const actualMime = this.normalizeMimeType(head?.ContentType);

    if (actualSize <= 0) {
      await this.cleanupFailedUpload(file.storage_key, file.id);
      throw new BadRequestException('Uploaded file is empty');
    }

    const maxSize = 150 * 1024 * 1024;
    if (actualSize > maxSize) {
      await this.cleanupFailedUpload(file.storage_key, file.id);
      throw new BadRequestException('File too large (Max 150MB).');
    }

    if (actualMime !== expectedMime) {
      await this.cleanupFailedUpload(file.storage_key, file.id);
      throw new BadRequestException(
        `File type mismatch. Expected ${expectedMime}, got ${actualMime}`,
      );
    }

    const blockedTypes = [
      'application/x-msdownload',
      'application/x-sh',
      'application/x-php',
      'application/x-dosexec',
    ];
    if (blockedTypes.includes(actualMime)) {
      await this.cleanupFailedUpload(file.storage_key, file.id);
      throw new BadRequestException('File type not allowed.');
    }

    const sha256 = await this.storageService.computeSha256(file.storage_key);

    const committed = await this.prisma.file_objects.update({
      where: { id: file.id },
      data: {
        status: 'COMMITTED',
        size_bytes: BigInt(actualSize),
        expires_at: null,
        sha256,
      },
    });

    return {
      id: committed.id,
      storageKey: committed.storage_key,
      status: committed.status,
    };
  }

  async listAssets(
    eventId: string,
    kind: 'all' | 'background' | 'signature' | 'logo' | 'image',
    limit: number,
  ) {
    const where: any = {
      event_id: eventId,
      status: 'COMMITTED',
      storage_key: { startsWith: `events/${eventId}/certificates/assets/` },
    };

    if (kind !== 'all') {
      where.storage_key = {
        startsWith: `events/${eventId}/certificates/assets/${kind}/`,
      };
    }

    const items = await this.prisma.file_objects.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limit, 1), 300),
      select: {
        id: true,
        storage_key: true,
        original_filename: true,
        mime_type: true,
        size_bytes: true,
        created_at: true,
      },
    });

    return items.map((item) => {
      const segments = item.storage_key.split('/');
      const detectedKind =
        segments.length >= 5
          ? String(segments[4]).trim().toLowerCase()
          : 'image';

      return {
        id: item.id,
        storageKey: item.storage_key,
        originalFilename: item.original_filename,
        mimeType: item.mime_type,
        sizeBytes: Number(item.size_bytes),
        createdAt: item.created_at,
        kind: detectedKind,
      };
    });
  }

  async deleteAsset(eventId: string, fileId: string) {
    const file = await this.prisma.file_objects.findFirst({
      where: {
        id: fileId,
        event_id: eventId,
        status: 'COMMITTED',
        storage_key: { startsWith: `events/${eventId}/certificates/assets/` },
      },
      select: {
        id: true,
        storage_key: true,
      },
    });

    if (!file) {
      throw new NotFoundException('Certificate asset not found');
    }

    await this.storageService.deleteObject(file.storage_key);
    await this.prisma.file_objects.delete({ where: { id: file.id } });
  }

  private createSimplePdfBuffer(lines: string[]): Buffer {
    const sanitize = (value: string) =>
      value
        .replace(/[\u0080-\uFFFF]/g, '?')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');

    const safeLines = lines.slice(0, 40).map((line) => sanitize(line));

    const contentParts: string[] = ['BT', '/F1 14 Tf', '50 550 Td'];
    for (let index = 0; index < safeLines.length; index += 1) {
      const line = safeLines[index];
      if (index > 0) {
        contentParts.push('0 -20 Td');
      }
      contentParts.push(`(${line}) Tj`);
    }
    contentParts.push('ET');
    const stream = `${contentParts.join('\n')}\n`;

    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
      `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream\nendobj\n`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    for (const objectText of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += objectText;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index <= objects.length; index += 1) {
      const offset = String(offsets[index]).padStart(10, '0');
      pdf += `${offset} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
  }

  private buildPdfLines(record: IssuedCertificateForRender): string[] {
    const payload = this.toRecord(record.payload_snapshot);
    return [
      'Certificate',
      `Type: ${record.certificate_type_label}`,
      `Participant: ${String(payload.participantName ?? this.getDisplayName(record.applications.users_applications_applicant_user_idTousers?.applicant_profiles))}`,
      `Event: ${record.events.title}`,
      `Certificate ID: ${record.certificate_id}`,
      `Credential ID: ${record.credential_id}`,
      `Issued At: ${record.issued_at.toISOString()}`,
      `Issuer: ${record.issuer_name}`,
      `Verification: ${this.getCredentialLinks(record.certificate_id, record.credential_id).verifiableCredentialUrl}`,
    ];
  }

  private async renderIssuedCertificatePdf(issuedCertificateId: string) {
    const record = await (this.prisma as any).issued_certificates.findUnique({
      where: { id: issuedCertificateId },
      include: {
        applications: {
          select: {
            id: true,
            users_applications_applicant_user_idTousers: {
              select: {
                applicant_profiles: {
                  select: {
                    first_name: true,
                    last_name: true,
                    full_name: true,
                  },
                },
              },
            },
          },
        },
        events: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Issued certificate not found');
    }

    const typedRecord = record as IssuedCertificateForRender;
    const lines = this.buildPdfLines(typedRecord);
    const pdfBuffer = this.createSimplePdfBuffer(lines);

    const pdfStorageKey = `events/${record.event_id}/certificates/pdf/${record.certificate_id}.pdf`;

    await this.storageService.putObjectBuffer(
      pdfStorageKey,
      pdfBuffer,
      'application/pdf',
    );

    await (this.prisma as any).issued_certificates.update({
      where: { id: record.id },
      data: {
        pdf_storage_key: pdfStorageKey,
        pdf_generated_at: new Date(),
        render_status: 'DONE',
        render_error: null,
        updated_at: new Date(),
      },
    });
  }

  async processRenderJobsBatch(workerId: string, batchSize: number) {
    const claimed = await this.prisma.$queryRawUnsafe<any[]>(
      `
      WITH candidates AS (
        SELECT id
        FROM "certificate_render_jobs"
        WHERE "status" = 'PENDING'
          AND "next_retry_at" <= NOW()
          AND "attempts" < "max_attempts"
        ORDER BY "created_at" ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "certificate_render_jobs" AS jobs
      SET "status" = 'PROCESSING',
          "attempts" = jobs."attempts" + 1,
          "locked_at" = NOW(),
          "locked_by" = $2,
          "updated_at" = NOW()
      FROM candidates
      WHERE jobs.id = candidates.id
      RETURNING jobs.*
      `,
      Math.max(batchSize, 1),
      workerId,
    );

    if (!claimed.length) {
      return { claimed: 0, completed: 0, failed: 0 };
    }

    let completed = 0;
    let failed = 0;

    for (const job of claimed) {
      try {
        await this.renderIssuedCertificatePdf(job.issued_certificate_id);
        await (this.prisma as any).certificate_render_jobs.update({
          where: { id: job.id },
          data: {
            status: 'DONE',
            completed_at: new Date(),
            error_message: null,
            locked_at: null,
            locked_by: null,
            updated_at: new Date(),
          },
        });
        completed += 1;
      } catch (error) {
        failed += 1;
        const attempts = Number(job.attempts ?? 0);
        const maxAttempts = Number(job.max_attempts ?? 5);
        const isExhausted = attempts >= maxAttempts;
        const errorMessage =
          error instanceof Error ? error.message.slice(0, 500) : 'Render failed';

        const retryDelaySeconds = Math.min(2 ** Math.max(attempts, 1) * 30, 3600);
        const nextRetryAt = new Date(Date.now() + retryDelaySeconds * 1000);

        await (this.prisma as any).certificate_render_jobs.update({
          where: { id: job.id },
          data: {
            status: isExhausted ? 'FAILED' : 'PENDING',
            error_message: errorMessage,
            next_retry_at: isExhausted ? job.next_retry_at : nextRetryAt,
            locked_at: null,
            locked_by: null,
            updated_at: new Date(),
            completed_at: isExhausted ? new Date() : null,
          },
        });

        await (this.prisma as any).issued_certificates.updateMany({
          where: { id: job.issued_certificate_id },
          data: {
            render_status: isExhausted ? 'FAILED' : 'PENDING',
            render_error: errorMessage,
            updated_at: new Date(),
          },
        });
      }
    }

    return {
      claimed: claimed.length,
      completed,
      failed,
    };
  }

  async getPublicCertificate(certificateId: string): Promise<any | null> {
    const record = await (this.prisma as any).issued_certificates.findUnique({
      where: { certificate_id: certificateId },
      include: {
        events: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            start_at: true,
            end_at: true,
            venue_name: true,
            venue_address: true,
          },
        },
        applications: {
          select: {
            id: true,
            attendance_records: {
              select: {
                checked_in_at: true,
              },
            },
            users_applications_applicant_user_idTousers: {
              select: {
                applicant_profiles: {
                  select: {
                    first_name: true,
                    last_name: true,
                    full_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!record) return null;

    const links = this.getCredentialLinks(record.certificate_id, record.credential_id);
    const qrVerificationUrl = this.getQrVerificationUrl(record.qr_token);
    const payload = this.toRecord(record.payload_snapshot);
    const templateSnapshot = this.toRecord(record.template_snapshot);
    const layout = templateSnapshot.layout ?? null;
    const participantName =
      String(payload.participantName ?? '').trim() ||
      this.getDisplayName(
        record.applications.users_applications_applicant_user_idTousers
          ?.applicant_profiles,
      );

    const pdfUrl = record.pdf_storage_key
      ? this.getCertificatePdfUrl(record.certificate_id)
      : null;

    return {
      certificateId: record.certificate_id,
      credentialId: record.credential_id,
      status: record.revoked_at ? 'REVOKED' : 'ISSUED',
      issuedAt: record.issued_at,
      checkedInAt:
        record.applications.attendance_records?.checked_in_at ?? record.issued_at,
      revokedAt: record.revoked_at,
      issuer: record.issuer_name,
      certificateType: {
        key: record.certificate_type_key,
        label: record.certificate_type_label,
      },
      certificateUrl: links.certificateUrl,
      verifiableCredentialUrl: links.verifiableCredentialUrl,
      qrVerificationUrl,
      pdfUrl,
      pdfStorageKey: record.pdf_storage_key ?? null,
      renderStatus: String(record.render_status ?? 'PENDING').toUpperCase(),
      renderError: record.render_error ?? null,
      event: {
        id: record.events.id,
        title: record.events.title,
        slug: record.events.slug,
        status: record.events.status,
        startAt: record.events.start_at,
        endAt: record.events.end_at,
        location:
          record.events.venue_name?.trim() ||
          record.events.venue_address?.trim() ||
          undefined,
      },
      recipient: {
        name: participantName,
      },
      verification: {
        algorithm: 'HMAC-SHA256',
        signature: record.credential_signature,
      },
      payload,
      layout,
      template: {
        text: {
          title: String(payload.title ?? 'Certificate'),
          subtitle: String(payload.subtitle ?? 'This certifies that'),
          completionText: String(
            payload.completionText ?? 'has successfully completed',
          ),
          footerText: String(
            payload.footerText ??
              'Verification available via the secure credential link below.',
          ),
        },
        style: {
          primaryColor: '#2563eb',
          secondaryColor: '#1d4ed8',
          backgroundColor: '#ffffff',
          textColor: '#0f172a',
          borderColor: '#cbd5e1',
        },
      },
    };
  }

  async verifyCredential(credentialId: string): Promise<any | null> {
    const record = await (this.prisma as any).issued_certificates.findUnique({
      where: { credential_id: credentialId },
      include: {
        events: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
          },
        },
        applications: {
          select: {
            id: true,
            attendance_records: {
              select: {
                checked_in_at: true,
              },
            },
            users_applications_applicant_user_idTousers: {
              select: {
                applicant_profiles: {
                  select: {
                    first_name: true,
                    last_name: true,
                    full_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!record) return null;

    const payload = this.toRecord(record.payload_snapshot);
    const participantName =
      String(payload.participantName ?? '').trim() ||
      this.getDisplayName(
        record.applications.users_applications_applicant_user_idTousers
          ?.applicant_profiles,
      );

    const expectedSignature = this.buildIssuedCertificateSignature({
      eventId: record.event_id,
      applicationId: record.application_id,
      certificateId: record.certificate_id,
      credentialId: record.credential_id,
      certificateTypeKey: record.certificate_type_key,
      participantName,
      issuedAt: record.issued_at,
    });

    const signatureValid = expectedSignature === record.credential_signature;
    const revoked = Boolean(record.revoked_at);
    const valid = signatureValid && !revoked;

    const links = this.getCredentialLinks(record.certificate_id, record.credential_id);

    return {
      valid,
      status: revoked ? 'REVOKED' : signatureValid ? 'VALID' : 'INVALID',
      issuer: record.issuer_name,
      issuedAt: record.issued_at,
      revokedAt: record.revoked_at,
      certificateUrl: links.certificateUrl,
      verifiableCredentialUrl: links.verifiableCredentialUrl,
      qrVerificationUrl: this.getQrVerificationUrl(record.qr_token),
      credential: {
        id: record.credential_id,
        certificateId: record.certificate_id,
        applicationId: record.application_id,
        event: {
          id: record.events.id,
          title: record.events.title,
          slug: record.events.slug,
          status: record.events.status,
        },
        recipient: {
          name: participantName,
        },
        checkedInAt:
          record.applications.attendance_records?.checked_in_at ?? record.issued_at,
        certificateType: {
          key: record.certificate_type_key,
          label: record.certificate_type_label,
        },
      },
      verification: {
        algorithm: 'HMAC-SHA256',
        signature: record.credential_signature,
        signatureValid,
      },
    };
  }

  async resolveQrVerificationToken(token: string) {
    const payload = this.verifyQrToken(token);

    const certificate = await (this.prisma as any).issued_certificates.findUnique({
      where: {
        credential_id: payload.credentialId,
      },
      select: {
        id: true,
        event_id: true,
        certificate_id: true,
        credential_id: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (
      certificate.certificate_id !== payload.certificateId ||
      certificate.event_id !== payload.eventId
    ) {
      throw new BadRequestException('QR token does not match certificate');
    }

    return this.getCredentialLinks(
      certificate.certificate_id,
      certificate.credential_id,
    ).verifiableCredentialUrl;
  }

  async resolveCertificatePdfUrl(certificateId: string): Promise<string> {
    const record = await (this.prisma as any).issued_certificates.findUnique({
      where: {
        certificate_id: certificateId,
      },
      select: {
        pdf_storage_key: true,
      },
    });

    const storageKey = String(record?.pdf_storage_key ?? '')
      .trim()
      .replace(/^\/+/, '');
    if (!storageKey || !CERTIFICATE_PDF_PREFIX.test(storageKey)) {
      throw new NotFoundException('Certificate PDF not found');
    }

    return this.storageService.getPresignedGetUrl(storageKey, 3600);
  }

  async resolveCertificateAssetUrl(rawStorageKey?: string): Promise<string> {
    const storageKey = String(rawStorageKey ?? '')
      .trim()
      .replace(/^\/+/, '');
    if (!storageKey || !CERTIFICATE_ASSET_PREFIX.test(storageKey)) {
      throw new NotFoundException('Asset not found');
    }

    const asset = await this.prisma.file_objects.findFirst({
      where: {
        storage_key: storageKey,
        status: 'COMMITTED',
      },
      select: {
        id: true,
      },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.storageService.getPresignedGetUrl(storageKey, 3600);
  }

  async listApplicationCertificates(
    eventId: string,
    applicationId: string,
  ): Promise<any[]> {
    const rows = await (this.prisma as any).issued_certificates.findMany({
      where: {
        event_id: eventId,
        application_id: applicationId,
      },
      include: {
        certificate_templates: {
          select: { name: true },
        },
        certificate_template_versions: {
          select: { version_number: true },
        },
      },
      orderBy: [{ issued_at: 'desc' }, { id: 'desc' }],
    });

    return rows.map((row: any) => this.mapIssuedCertificateRow(row));
  }
}
