import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  Req,
  Res,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { MicrositesService } from './microsites.service';
import { MicrositeMediaService } from './microsite-media.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permission } from '@event-platform/shared';
import { SkipCsrf } from '../common/decorators/skip-csrf.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  UpdateMicrositeSettingsSchema,
  CreateMicrositePageSchema,
  UpdateMicrositePageSchema,
} from '@event-platform/shared';
import { z } from 'zod';

interface UserSession {
  id: string;
  email: string;
}

interface RequestWithUserContext {
  session?: {
    user?: Partial<UserSession> | null;
  } | null;
  user?: Partial<UserSession> | null;
}

@Controller()
export class MicrositesController {
  constructor(
    private readonly service: MicrositesService,
    private readonly mediaService: MicrositeMediaService,
  ) {}

  private requireUserId(req: RequestWithUserContext): string {
    const user = (req?.session?.user ??
      req?.user) as Partial<UserSession> | null;
    if (!user?.id) {
      throw new UnauthorizedException('Not authenticated');
    }
    return user.id;
  }

  // --- Admin Endpoints ---

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_MANAGE_SETTINGS)
  @Get('admin/events/:eventId/microsite')
  async getAdminMicrosite(@Param('eventId') eventId: string) {
    const site = await this.service.ensureMicrosite(eventId);
    return site;
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_MANAGE_SETTINGS)
  @Patch('admin/events/:eventId/microsite')
  async updateSettings(
    @Param('eventId') eventId: string,
    @Body() body: z.infer<typeof UpdateMicrositeSettingsSchema>,
  ) {
    const payload = UpdateMicrositeSettingsSchema.parse(body);
    return this.service.updateSettings(eventId, payload);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Get('admin/events/:eventId/microsite/pages')
  async listPages(@Param('eventId') eventId: string) {
    return this.service.listDraftPages(eventId);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Get('admin/events/:eventId/microsite/pages/:pageId')
  async getPage(
    @Param('eventId') eventId: string,
    @Param('pageId') pageId: string,
  ) {
    return this.service.getDraftPage(eventId, pageId);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Post('admin/events/:eventId/microsite/pages')
  async createPage(
    @Param('eventId') eventId: string,
    @Body() body: z.infer<typeof CreateMicrositePageSchema>,
  ) {
    const payload = CreateMicrositePageSchema.parse(body);
    return this.service.createPage(eventId, payload);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Patch('admin/events/:eventId/microsite/pages/:pageId')
  async updatePage(
    @Param('eventId') eventId: string,
    @Param('pageId') pageId: string,
    @Body() body: z.infer<typeof UpdateMicrositePageSchema>,
  ) {
    const payload = UpdateMicrositePageSchema.parse(body);
    return this.service.updatePage(eventId, pageId, payload);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Delete('admin/events/:eventId/microsite/pages/:pageId')
  async deletePage(
    @Param('eventId') eventId: string,
    @Param('pageId') pageId: string,
  ) {
    return this.service.deletePage(eventId, pageId);
  }

  // --- Admin: Media Library ---

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Post('admin/events/:eventId/microsite/media/uploads')
  async registerMediaUpload(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    return this.mediaService.registerUpload(eventId, body);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Post('admin/events/:eventId/microsite/media/uploads/:fileId/commit')
  async commitMediaUpload(
    @Param('eventId') eventId: string,
    @Param('fileId') fileId: string,
  ) {
    await this.mediaService.commitUpload(eventId, fileId);
    return { status: 'COMMITTED' };
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Get('admin/events/:eventId/microsite/media')
  async listMedia(
    @Param('eventId') eventId: string,
    @Query('kind') kind?: 'all' | 'image' | 'video',
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number(limit ?? 120);
    return this.mediaService.listAssets(eventId, kind ?? 'all', parsedLimit);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PAGES_MANAGE)
  @Delete('admin/events/:eventId/microsite/media/:fileId')
  async deleteMedia(
    @Param('eventId') eventId: string,
    @Param('fileId') fileId: string,
  ) {
    await this.mediaService.deleteAsset(eventId, fileId);
    return { status: 'DELETED' };
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PUBLISH)
  @Post('admin/events/:eventId/microsite/publish')
  async publish(
    @Param('eventId') eventId: string,
    @Req() req: RequestWithUserContext,
  ) {
    return this.service.publish(eventId, this.requireUserId(req));
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_PUBLISH)
  @Post('admin/events/:eventId/microsite/unpublish')
  async unpublish(@Param('eventId') eventId: string) {
    return this.service.unpublish(eventId);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_ROLLBACK)
  @Post('admin/events/:eventId/microsite/rollback')
  async rollback(
    @Param('eventId') eventId: string,
    @Body('version') version: number,
  ) {
    if (typeof version !== 'number')
      throw new BadRequestException('Version required');
    return this.service.rollback(eventId, version);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermission(Permission.EVENT_MICROSITE_ROLLBACK) // Using rollback permission for viewing history
  @Get('admin/events/:eventId/microsite/versions')
  async getVersions(@Param('eventId') eventId: string) {
    return this.service.getVersions(eventId);
  }

  // --- Public Endpoints ---

  @SkipCsrf()
  @SkipThrottle()
  @Get('microsites/assets')
  async getPublicAsset(@Query('key') key: string, @Res() res: Response) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new BadRequestException('Asset key is required');
    }

    const signedUrl = await this.mediaService.getPublicAssetUrl(key);
    res.set(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=3600',
    );
    return res.redirect(302, signedUrl);
  }

  @SkipCsrf()
  @SkipThrottle()
  @Get('microsites/public/:slug')
  async getPublicMicrosite(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.getPublicMicrosite(slug);

    // Cache headers
    // ETag: "${slug}:${publishedVersion}"
    const etag = `"${slug}:${result.publishedVersion}"`;
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    return result;
  }

  @SkipCsrf()
  @SkipThrottle()
  @Get('microsites/public/:slug/pages/:pageSlug')
  async getPublicPage(
    @Param('slug') slug: string,
    @Param('pageSlug') pageSlug: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // We need published version to form ETag.
    // The service call currently gets it inside.
    // Ideally we get metadata first or service returns version too.
    // Let's use simple logic: service returns page + version context?
    // Service `getPublicPage` only returns page.
    // We need to fetch microsite version to build ETag.
    // Let's retrieve page.
    // The page object (version) has `version` field!
    const page = await this.service.getPublicPage(slug, pageSlug);

    const etag = `"${slug}:${page.version}"`;
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    return page;
  }
}
