import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Permission, FileSensitivity } from '@event-platform/shared';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClsService } from 'nestjs-cls';

@Controller('events/:eventId')
@UseGuards(PermissionsGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Upload file
   * Returns metadata and presigned URL (or handles stream)
   */
  /**
   * Upload file (Request Presigned URL)
   */
  @Post('uploads')
  @RequirePermission(Permission.SELF_SUBMIT_STEP, Permission.EVENT_STEP_PATCH)
  async registerUpload(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      sensitivity?: FileSensitivity;
    },
  ) {
    const sensitivity = body.sensitivity || FileSensitivity.NORMAL;
    // Storage key: events/:eventId/uploads/:uuid-:filename
    const storageKey = `events/${eventId}/uploads/${crypto.randomUUID()}-${body.originalFilename}`;

    return await this.filesService.registerUpload(eventId, {
      originalFilename: body.originalFilename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      storageKey,
      sensitivity,
    });
  }

  /**
   * Commit upload
   */
  @Post('uploads/:fileId/commit')
  @RequirePermission(Permission.SELF_SUBMIT_STEP, Permission.EVENT_STEP_PATCH)
  async commitUpload(
    @Param('eventId') eventId: string,
    @Param('fileId') fileId: string,
  ) {
    await this.filesService.commitUpload(fileId, eventId);
    return { status: 'COMMITTED' };
  }

  /**
   * Get secure download URL
   */
  @Get('files/:fileId/url')
  @RequirePermission(Permission.EVENT_APPLICATION_READ_BASIC)
  async getDownloadUrl(
    @Param('eventId') eventId: string,
    @Param('fileId') fileId: string,
    @Query('download') download?: string,
  ) {
    const permissions = this.cls.get('permissions') || [];
    const wantsDownload = download === '1' || download === 'true';
    return await this.filesService.getDownloadUrl(
      fileId,
      eventId,
      permissions,
      wantsDownload,
    );
  }
}
