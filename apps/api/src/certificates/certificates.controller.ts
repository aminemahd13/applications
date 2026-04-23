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
  CreateCertificatePdfExportJobSchema,
  CreateCertificateTemplateSchema,
  CreateCertificateTemplateVersionSchema,
  DuplicateCertificateTemplateSchema,
  IssueCertificateSchema,
  IssueCertificatesByTagsSchema,
  IssueCertificatesBulkSchema,
  ListCertificateIssuanceTagsQuerySchema,
  ListCertificateRenderJobsQuerySchema,
  ListCertificateTemplatesQuerySchema,
  ListIssuedCertificatesQuerySchema,
  PublishCertificateTemplateSchema,
  RegisterCertificateAssetUploadSchema,
  ReleaseCertificatesBulkSchema,
  ReleaseIssuedCertificateSchema,
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

  @Delete('events/:eventId/certificates/templates/:templateId/versions/:versionId')
  @RequirePermission(Permission.EVENT_UPDATE)
  async deleteTemplateVersion(
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
    @Param('versionId') versionId: string,
  ) {
    await this.certificatesService.deleteTemplateVersion(
      eventId,
      templateId,
      versionId,
    );
    return { status: 'DELETED' };
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

  @Post('events/:eventId/certificates/issue-by-tags')
  @RequirePermission(Permission.EVENT_UPDATE)
  async issueCertificatesByTags(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = IssueCertificatesByTagsSchema.parse(body ?? {});
    const data = await this.certificatesService.issueCertificatesByTags(
      eventId,
      dto,
    );
    return { data };
  }

  @Get('events/:eventId/certificates/issuance-candidates')
  @RequirePermission(Permission.EVENT_UPDATE)
  async searchIssuanceCandidates(
    @Param('eventId') eventId: string,
    @Query('search') search?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const parsedLimit = Number(rawLimit ?? 20);
    const data = await this.certificatesService.searchIssuanceCandidates(
      eventId,
      {
        search: String(search ?? ''),
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
      },
    );
    return { data };
  }

  @Get('events/:eventId/certificates/issuance-tags')
  @RequirePermission(Permission.EVENT_UPDATE)
  async listIssuanceTags(
    @Param('eventId') eventId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const dto = ListCertificateIssuanceTagsQuerySchema.parse(query ?? {});
    const data = await this.certificatesService.listIssuanceTags(eventId, dto);
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

  @Post('events/:eventId/certificates/:issuedCertificateId/release')
  @RequirePermission(Permission.EVENT_UPDATE)
  async releaseCertificate(
    @Param('eventId') eventId: string,
    @Param('issuedCertificateId') issuedCertificateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    ReleaseIssuedCertificateSchema.parse(body ?? {});
    const data = await this.certificatesService.releaseIssuedCertificate(
      eventId,
      issuedCertificateId,
    );
    return { data };
  }

  @Post('events/:eventId/certificates/release-bulk')
  @RequirePermission(Permission.EVENT_UPDATE)
  async releaseCertificatesBulk(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = ReleaseCertificatesBulkSchema.parse(body ?? {});
    const data = await this.certificatesService.releaseCertificatesBulk(
      eventId,
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

  @Post('events/:eventId/certificates/pdf-export-jobs')
  @RequirePermission(Permission.EVENT_UPDATE)
  async createPdfExportJob(
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = CreateCertificatePdfExportJobSchema.parse(body ?? {});
    const data = await this.certificatesService.createCertificatePdfExportJob(
      eventId,
      dto,
    );
    return { data };
  }

  @Get('events/:eventId/certificates/pdf-export-jobs/:jobId')
  @RequirePermission(Permission.EVENT_UPDATE)
  async getPdfExportJob(
    @Param('eventId') eventId: string,
    @Param('jobId') jobId: string,
  ) {
    const data = await this.certificatesService.getCertificatePdfExportJob(
      eventId,
      jobId,
    );
    return { data };
  }

  @Get('events/:eventId/certificates/pdf-export-jobs/:jobId/download-url')
  @RequirePermission(Permission.EVENT_UPDATE)
  async getPdfExportJobDownloadUrl(
    @Param('eventId') eventId: string,
    @Param('jobId') jobId: string,
  ) {
    const data =
      await this.certificatesService.getCertificatePdfExportJobDownloadUrl(
        eventId,
        jobId,
      );
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

  @Get('events/:eventId/certificates/:issuedCertificateId/pdf')
  @RequirePermission(Permission.EVENT_UPDATE)
  async resolveIssuedCertificatePdf(
    @Param('eventId') eventId: string,
    @Param('issuedCertificateId') issuedCertificateId: string,
    @Res() res: Response,
  ) {
    const file = await this.certificatesService.getIssuedCertificatePdfFileForStaff(
      eventId,
      issuedCertificateId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    return res.send(file.buffer);
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
      kind === 'image' ||
      kind === 'font'
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

  @SkipCsrf()
  @SkipThrottle()
  @Get('certificate/:certificateId/pdf')
  async resolveCertificatePdf(
    @Param('certificateId') certificateId: string,
    @Res() res: Response,
  ) {
    const file = await this.certificatesService.getCertificatePdfFile(
      certificateId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    return res.send(file.buffer);
  }

  @SkipCsrf()
  @SkipThrottle()
  @Get('render/:token')
  async getCertificateRenderPayload(@Param('token') token: string) {
    const data = await this.certificatesService.getCertificateRenderPayload(
      token,
    );
    return { data };
  }

  @SkipCsrf()
  @SkipThrottle()
  @Get('assets')
  async resolveCertificateAsset(
    @Res() res: Response,
    @Query('key') key?: string,
  ) {
    const url = await this.certificatesService.resolveCertificateAssetUrl(key);
    return res.redirect(302, url);
  }
}
