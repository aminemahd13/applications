import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import {
  Permission,
  CreateMessageSchema,
  CreateSystemAnnouncementSchema,
  SystemAnnouncementFilterSchema,
  PreviewRecipientsSchema,
  MessageListQuerySchema,
  MessageRecipientsQuerySchema,
  InboxQuerySchema,
  DecisionStatus,
} from '@event-platform/shared';
import { ClsService } from 'nestjs-cls';

function normalizeRecipientFilter(input: unknown): unknown {
  if (!input) return input;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('recipientFilter must be an object');
  }

  const filter = input as Record<string, unknown>;
  const legacyType =
    typeof filter.type === 'string' ? filter.type.toUpperCase() : null;
  if (!legacyType) return input;

  if (legacyType === 'ALL') {
    return {};
  }

  if (legacyType === 'STATUS') {
    const status = String(filter.status ?? '').toUpperCase();
    const allowed = new Set(Object.values(DecisionStatus));
    if (!allowed.has(status as DecisionStatus)) {
      throw new BadRequestException('Invalid status recipient filter');
    }
    return { decisionStatus: [status] };
  }

  if (legacyType === 'DIRECT') {
    const email = String(filter.email ?? '')
      .trim()
      .toLowerCase();
    if (!email) {
      throw new BadRequestException('Direct recipient filter requires email');
    }
    return { emails: [email] };
  }

  throw new BadRequestException('Unsupported recipient filter type');
}

/**
 * Staff Messaging Controller
 */
@Controller('events/:eventId/messages')
@UseGuards(PermissionsGuard)
export class StaffMessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * Preview recipients for a filter (dry run)
   */
  @Post('preview-recipients')
  @RequirePermission(Permission.EVENT_MESSAGES_SEND)
  async previewRecipients(
    @Param('eventId') eventId: string,
    @Body() body: any,
  ) {
    const dto = PreviewRecipientsSchema.parse({
      ...body,
      recipientFilter: normalizeRecipientFilter(body?.recipientFilter),
    });
    const result = await this.messagesService.previewRecipients(
      eventId,
      dto.recipientFilter,
    );
    return { data: result };
  }

  /**
   * Send a message
   */
  @Post()
  @RequirePermission(Permission.EVENT_MESSAGES_SEND)
  async createMessage(@Param('eventId') eventId: string, @Body() body: any) {
    const dto = CreateMessageSchema.parse({
      ...body,
      recipientFilter: normalizeRecipientFilter(body?.recipientFilter),
    });
    const message = await this.messagesService.createMessage(eventId, dto);
    return { data: message };
  }

  /**
   * List sent messages
   */
  @Get()
  @RequirePermission(Permission.EVENT_MESSAGES_READ)
  async listMessages(@Param('eventId') eventId: string, @Query() query: any) {
    const dto = MessageListQuerySchema.parse(query);
    const result = await this.messagesService.listMessages(eventId, dto);
    return { data: result.items, nextCursor: result.nextCursor };
  }

  /**
   * Get message detail
   */
  @Get(':messageId')
  @RequirePermission(Permission.EVENT_MESSAGES_READ)
  async getMessage(
    @Param('eventId') eventId: string,
    @Param('messageId') messageId: string,
  ) {
    const message = await this.messagesService.getMessageById(
      eventId,
      messageId,
    );
    return { data: message };
  }

  /**
   * Get message recipients
   */
  @Get(':messageId/recipients')
  @RequirePermission(Permission.EVENT_MESSAGES_READ_STATS)
  async getRecipients(
    @Param('eventId') eventId: string,
    @Param('messageId') messageId: string,
    @Query() query: any,
  ) {
    const dto = MessageRecipientsQuerySchema.parse(query);
    const result = await this.messagesService.getMessageRecipients(
      eventId,
      messageId,
      dto,
    );
    return { data: result.items, nextCursor: result.nextCursor };
  }

  /**
   * Delete a sent message (organizer/admin)
   */
  @Delete(':messageId')
  @RequirePermission(Permission.EVENT_APPLICATION_DELETE)
  async deleteMessage(
    @Param('eventId') eventId: string,
    @Param('messageId') messageId: string,
  ) {
    await this.messagesService.deleteMessage(eventId, messageId);
    return { success: true };
  }
}

/**
 * Applicant Inbox Controller
 */
@Controller('me/inbox')
@UseGuards(PermissionsGuard)
export class InboxController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly cls: ClsService,
  ) {}

  /**
   * List inbox items
   */
  @Get()
  @RequirePermission(Permission.SELF_INBOX_READ)
  async getInbox(@Query() query: any) {
    const userId = this.cls.get('actorId');
    const dto = InboxQuerySchema.parse(query);
    const result = await this.messagesService.getInbox(userId, dto);
    return { data: result.items, nextCursor: result.nextCursor };
  }

  /**
   * Get inbox item detail
   */
  @Get(':recipientId')
  @RequirePermission(Permission.SELF_INBOX_READ)
  async getItem(@Param('recipientId') recipientId: string) {
    const userId = this.cls.get('actorId');
    const item = await this.messagesService.getInboxItem(userId, recipientId);
    return { data: item };
  }

  /**
   * Mark as read
   */
  @Post(':recipientId/read')
  @RequirePermission(Permission.SELF_INBOX_READ)
  async markRead(@Param('recipientId') recipientId: string) {
    const userId = this.cls.get('actorId');
    await this.messagesService.markAsRead(userId, recipientId);
    return { success: true };
  }

  /**
   * Mark as unread
   */
  @Post(':recipientId/unread')
  @RequirePermission(Permission.SELF_INBOX_READ)
  async markUnread(@Param('recipientId') recipientId: string) {
    const userId = this.cls.get('actorId');
    await this.messagesService.markAsUnread(userId, recipientId);
    return { success: true };
  }

  /**
   * Mark all as read
   */
  @Post('read-all')
  @RequirePermission(Permission.SELF_INBOX_READ)
  async markAllRead() {
    const userId = this.cls.get('actorId');
    await this.messagesService.markAllAsRead(userId);
    return { success: true };
  }
}

/**
 * Admin Announcements Controller (system-wide, no event context)
 */
@Controller('admin/announcements')
@UseGuards(PermissionsGuard)
export class AdminAnnouncementsController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Preview recipients for system-wide announcement
   */
  @Post('preview-recipients')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async previewRecipients(@Body() body: any) {
    const filter = SystemAnnouncementFilterSchema.parse(body?.recipientFilter ?? {});
    const result = await this.messagesService.previewSystemRecipients(filter);
    return { data: result };
  }

  /**
   * Send a system-wide announcement
   */
  @Post()
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async createAnnouncement(@Body() body: any) {
    const dto = CreateSystemAnnouncementSchema.parse(body);
    const message = await this.messagesService.createSystemAnnouncement(dto);
    return { data: message };
  }

  /**
   * List system-wide announcements
   */
  @Get()
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async listAnnouncements(@Query() query: any) {
    const dto = MessageListQuerySchema.parse(query);
    const result = await this.messagesService.listSystemAnnouncements(dto);
    return { data: result.items, nextCursor: result.nextCursor };
  }

  /**
   * Delete a system announcement
   */
  @Delete(':messageId')
  @RequirePermission(Permission.ADMIN_EVENTS_MANAGE)
  async deleteAnnouncement(@Param('messageId') messageId: string) {
    await this.messagesService.deleteMessage(null, messageId);
    return { success: true };
  }
}
