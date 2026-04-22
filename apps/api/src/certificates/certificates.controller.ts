import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ActivateCertificateTemplateVersionSchema,
  CreateCertificateTemplateSchema,
  CreateCertificateTemplateVersionSchema,
  DuplicateCertificateTemplateSchema,
  IssueCertificateSchema,
  IssueCertificatesBulkSchema,
  ListCertificateRenderJobsQuerySchema,
  ListCertificateTemplatesQuerySchema,
  ListIssuedCertificatesQuerySchema,
  PublishCertificateTemplateSchema,
  RegisterCertificateAssetUploadSchema,
  RevokeIssuedCertificateSchema,
  UpdateCertificateTemplateDraftSchema,
  UpdateCertificateTemplateSchema,
  Permission,
} from '@event-platform/shared';
import { CertificatesService } from './certificates.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';

@UseGuards(PermissionsGuard)
@Controller()
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('events/:eventId/certificates/templates')
  @RequirePermission(Permission.EVENT_UPDATE)
  async listTemplates(
    @Param('eventId') eventId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const dto = ListCertificateTemplatesQuerySchema.parse(query ?? {});
    const data = await this.certificatesService.listTemplates(eventId, dto);
    return { data };
  }

  @Post('events/:eventId/certificates/templates')
  @RequirePermission(Permission.EVENT_UPDATE)
  async createTemplate(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = CreateCertificateTemplateSchema.parse(body ?? {});
    const data = await this.certificatesService.createTemplate(eventId, dto);
    return { data };
  }

  @Patch('events/:eventId/certificates/templates/:templateId')
  @RequirePermission(Permission.EVENT_UPDATE)
  async updateTemplate(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = UpdateCertificateTemplateSchema.parse(body ?? {});
    const data = await this.certificatesService.updateTemplate(
      eventId,
      templateId,
      dto,
    );
    return { data };
  }

  @Delete('events/:eventId/certificates/templates/:templateId')
  @RequirePermission(Permission.EVENT_UPDATE)
  async deleteTemplate(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
  ) {
    await this.certificatesService.deleteTemplate(eventId, templateId);
    return { status: 'DELETED' };
  }

  @Get('events/:eventId/certificates/templates/:templateId/draft')
  @RequirePermission(Permission.EVENT_UPDATE)
  async getTemplateDraft(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
  ) {
    const data = await this.certificatesService.getTemplateDraft(
      eventId,
      templateId,
    );
    return { data };
  }

  @Put('events/:eventId/certificates/templates/:templateId/draft')
  @RequirePermission(Permission.EVENT_UPDATE)
  async upsertTemplateDraft(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = UpdateCertificateTemplateDraftSchema.parse(body ?? {});
    const data = await this.certificatesService.upsertTemplateDraft(
      eventId,
      templateId,
      dto,
    );
    return { data };
  }

  @Post('events/:eventId/certificates/templates/:templateId/publish')
  @RequirePermission(Permission.EVENT_UPDATE)
  async publishTemplate(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = PublishCertificateTemplateSchema.parse(body ?? {});
    const data = await this.certificatesService.publishTemplate(
      eventId,
      templateId,
      dto,
    );
    return { data };
  }

  @Post('events/:eventId/certificates/templates/:templateId/duplicate')
  @RequirePermission(Permission.EVENT_UPDATE)
  async duplicateTemplate(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = DuplicateCertificateTemplateSchema.parse(body ?? {});
    const data = await this.certificatesService.duplicateTemplate(
      eventId,
      templateId,
      dto,
    );
    return { data };
  }

  @Get('events/:eventId/certificates/templates/:templateId/versions')
  @RequirePermission(Permission.EVENT_UPDATE)
  async listTemplateVersions(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
  ) {
    const data = await this.certificatesService.listTemplateVersions(
      eventId,
      templateId,
    );
    return { data };
  }

  @Post('events/:eventId/certificates/templates/:templateId/versions')
  @RequirePermission(Permission.EVENT_UPDATE)
  async createTemplateVersion(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = CreateCertificateTemplateVersionSchema.parse(body ?? {});
    const data = await this.certificatesService.createTemplateVersion(
      eventId,
      templateId,
      dto,
    );
    return { data };
  }

  @Post('events/:eventId/certificates/templates/:templateId/activate-version')
  @RequirePermission(Permission.EVENT_UPDATE)
  async activateTemplateVersion(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = ActivateCertificateTemplateVersionSchema.parse(body ?? {});
    const data = await this.certificatesService.activateTemplateVersion(
      eventId,
      templateId,
      dto.versionId,
    );
    return { data };
  }

  @Post('events/:eventId/certificates/issue')
  @RequirePermission(Permission.EVENT_UPDATE)
  async issueCertificate(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = IssueCertificateSchema.parse(body ?? {});
    const data = await this.certificatesService.issueCertificate(eventId, dto);
    return { data };
  }

  @Post('events/:eventId/certificates/issue-bulk')
  @RequirePermission(Permission.EVENT_UPDATE)
  async issueCertificatesBulk(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = IssueCertificatesBulkSchema.parse(body ?? {});
    const data = await this.certificatesService.issueCertificatesBulk(
      eventId,
      dto,
    );
    return { data };
  }

  @Post('events/:eventId/certificates/:issuedCertificateId/revoke')
  @RequirePermission(Permission.EVENT_UPDATE)
  async revokeCertificate(
    @Param('eventId') eventId: string,
    @Param('issuedCertificateId') issuedCertificateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = RevokeIssuedCertificateSchema.parse(body ?? {});
    const data = await this.certificatesService.revokeIssuedCertificate(
      eventId,
      issuedCertificateId,
      dto,
    );
    return { data };
  }

  @Get('events/:eventId/certificates/issued')
  @RequirePermission(Permission.EVENT_UPDATE)
  async listIssuedCertificates(
    @Param('eventId') eventId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const dto = ListIssuedCertificatesQuerySchema.parse(query ?? {});
    const data = await this.certificatesService.listIssuedCertificates(
      eventId,
      dto,
    );
    return { data };
  }

  @Get('events/:eventId/certificates/render-jobs')
  @RequirePermission(Permission.EVENT_UPDATE)
  async listRenderJobs(
    @Param('eventId') eventId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const dto = ListCertificateRenderJobsQuerySchema.parse(query ?? {});
    const data = await this.certificatesService.listRenderJobs(eventId, dto);
    return { data };
  }

  @Post('events/:eventId/certificates/render-jobs/:jobId/retry')
  @RequirePermission(Permission.EVENT_UPDATE)
  async retryRenderJob(
    @Param('eventId') eventId: string,
    @Param('jobId') jobId: string,
  ) {
    const data = await this.certificatesService.retryRenderJob(eventId, jobId);
    return { data };
  }

  @Post('admin/events/:eventId/certificates/assets/uploads')
  @RequirePermission(Permission.EVENT_UPDATE)
  async registerAssetUpload(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = RegisterCertificateAssetUploadSchema.parse(body ?? {});
    const data = await this.certificatesService.registerAssetUpload(
      eventId,
      dto,
    );
    return { data };
  }

  @Post('admin/events/:eventId/certificates/assets/uploads/:fileId/commit')
  @RequirePermission(Permission.EVENT_UPDATE)
  async commitAssetUpload(
    @Param('eventId') eventId: string,
    @Param('fileId') fileId: string,
  ) {
    const data = await this.certificatesService.commitAssetUpload(eventId, fileId);
    return { data };
  }

  @Get('admin/events/:eventId/certificates/assets')
  @RequirePermission(Permission.EVENT_UPDATE)
  async listAssets(
    @Param('eventId') eventId: string,
    @Query('kind') rawKind?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const kind = String(rawKind ?? 'all').trim().toLowerCase();
    const normalizedKind =
      kind === 'background' ||
      kind === 'signature' ||
      kind === 'logo' ||
      kind === 'image'
        ? kind
        : 'all';
    const limit = Number(rawLimit ?? 120);
    const data = await this.certificatesService.listAssets(
      eventId,
      normalizedKind,
      Number.isFinite(limit) ? limit : 120,
    );
    return { data };
  }

  @Delete('admin/events/:eventId/certificates/assets/:fileId')
  @RequirePermission(Permission.EVENT_UPDATE)
  async deleteAsset(
    @Param('eventId') eventId: string,
    @Param('fileId') fileId: string,
  ) {
    await this.certificatesService.deleteAsset(eventId, fileId);
    return { status: 'DELETED' };
  }
}

@Controller('credentials')
export class CertificatesPublicController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @SkipCsrf()
  @SkipThrottle()
  @Get('qr/:token')
  async resolveQrToken(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    const url = await this.certificatesService.resolveQrVerificationToken(token);
    return res.redirect(302, url);
  }
}
