import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { EmailService } from '../common/email/email.service';
import {
  RecipientFilter,
  CreateMessageDto,
  InboxQueryDto,
  MessageSummary,
  MessageDetail,
  InboxItem,
  InboxDetail,
  MessageType,
  EmailDeliveryStatus,
  MessageListQueryDto,
  MessageRecipientsQueryDto,
} from '@event-platform/shared';

@Injectable()
export class MessagesService {
  private static readonly EMAIL_SEND_BATCH_SIZE = 150;
  private static readonly EMAIL_SEND_CONCURRENCY = 12;
  private static readonly EMAIL_RETRY_MAX_ATTEMPTS = 5;
  private static readonly EMAIL_RETRY_COOLDOWN_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly emailService: EmailService,
  ) {}

  // ============================================================
  // SEGMENTATION DSL EVALUATION
  // ============================================================

  async evaluateFilter(
    eventId: string,
    filter: RecipientFilter,
  ): Promise<string[]> {
    const filterAny = filter as any;
    const where: any = { event_id: eventId };
    const andConditions: any[] = [];

    if (filter.decisionStatus?.length) {
      andConditions.push({ decision_status: { in: filter.decisionStatus } });
    }

    // Support tagsAny + tagsAll together instead of silently overriding one with the other.
    if (filter.tagsAny?.length) {
      andConditions.push({ tags: { hasSome: filter.tagsAny } });
    }
    if (filter.tagsAll?.length) {
      andConditions.push({ tags: { hasEvery: filter.tagsAll } });
    }

    if (filter.needsInfoOpen) {
      andConditions.push({ needs_info_requests: { some: { status: 'OPEN' } } });
    }

    if (filter.stepId && filter.stepStatus?.length) {
      andConditions.push({
        application_step_states: {
          some: {
            step_id: filter.stepId,
            status: { in: filter.stepStatus },
          },
        },
      });
    }

    // currentStepId convenience: include apps where this step is still active/pending.
    if (filter.currentStepId) {
      andConditions.push({
        application_step_states: {
          some: {
            step_id: filter.currentStepId,
            status: { notIn: ['APPROVED', 'REJECTED_FINAL'] },
          },
        },
      });
    }

    if (filter.confirmed !== undefined) {
      if (filter.confirmed) {
        andConditions.push({
          OR: [
            { attendance_records: { is: { status: 'CONFIRMED' } } },
            { attendance_records: { is: { status: 'CHECKED_IN' } } },
          ],
        });
      } else {
        andConditions.push({
          OR: [
            { attendance_records: { is: null } },
            {
              attendance_records: {
                is: { status: { notIn: ['CONFIRMED', 'CHECKED_IN'] } },
              },
            },
          ],
        });
      }
    }

    if (filter.checkedIn !== undefined) {
      if (filter.checkedIn) {
        andConditions.push({
          attendance_records: { is: { status: 'CHECKED_IN' } },
        });
      } else {
        andConditions.push({
          OR: [
            { attendance_records: { is: null } },
            { attendance_records: { is: { status: { not: 'CHECKED_IN' } } } },
          ],
        });
      }
    }

    if (andConditions.length) {
      where.AND = andConditions;
    }

    // Get filtered applications
    const filteredApps = await this.prisma.applications.findMany({
      where,
      select: { id: true, applicant_user_id: true },
    });

    const recipientsByApplicationId = new Map<string, string>();
    for (const app of filteredApps) {
      recipientsByApplicationId.set(app.id, app.applicant_user_id);
    }

    // Add explicit applicationIds
    if (filter.applicationIds?.length) {
      const explicitApps = await this.prisma.applications.findMany({
        where: { event_id: eventId, id: { in: filter.applicationIds } },
        select: { id: true, applicant_user_id: true },
      });
      for (const app of explicitApps) {
        recipientsByApplicationId.set(app.id, app.applicant_user_id);
      }
    }

    let userIds = Array.from(new Set(recipientsByApplicationId.values()));

    // Add explicit user IDs
    if (filter.userIds?.length) {
      userIds = [...new Set([...userIds, ...filter.userIds])];
    }

    // Resolve user IDs by email
    if (filterAny.emails?.length) {
      const normalizedEmails = (filterAny.emails as string[]).map((email) =>
        email.toLowerCase(),
      );
      const emailUsers = await this.prisma.users.findMany({
        where: { email: { in: normalizedEmails } },
        select: { id: true },
      });
      userIds = [...new Set([...userIds, ...emailUsers.map((u) => u.id)])];
    }

    // Exclude user IDs
    if (filter.excludeUserIds?.length) {
      userIds = userIds.filter((id) => !filter.excludeUserIds!.includes(id));
    }

    return [...new Set(userIds)];
  }

  async previewRecipients(
    eventId: string,
    filter: RecipientFilter,
  ): Promise<{ count: number; sample: any[] }> {
    const userIds = await this.evaluateFilter(eventId, filter);

    // Get sample users (max 10)
    const sampleUsers = await this.prisma.users.findMany({
      where: { id: { in: userIds.slice(0, 10) } },
      select: {
        id: true,
        email: true,
        applicant_profiles: { select: { full_name: true } },
      },
    });

    return {
      count: userIds.length,
      sample: sampleUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.applicant_profiles?.full_name,
      })),
    };
  }

  // ============================================================
  // STAFF MESSAGING
  // ============================================================

  async createMessage(
    eventId: string,
    dto: CreateMessageDto,
  ): Promise<MessageDetail> {
    const actorId = this.cls.get('actorId');

    // Resolve recipients
    let userIds: string[] = [];

    if (dto.recipientFilter) {
      userIds = await this.evaluateFilter(eventId, dto.recipientFilter);
    }

    if (dto.explicitUserIds?.length) {
      userIds = [...new Set([...userIds, ...dto.explicitUserIds])];
    }

    if (userIds.length === 0) {
      throw new BadRequestException('No recipients matched the filter');
    }

    const now = new Date();
    const messageId = crypto.randomUUID();
    const isDirectMessage =
      ((dto.recipientFilter as any)?.emails?.length ?? 0) > 0 ||
      (dto.explicitUserIds?.length ?? 0) > 0;

    // Generate plaintext from rich content if not provided
    const bodyText = dto.bodyText || this.extractPlaintext(dto.bodyRich);

    // Create message
    await this.prisma.messages.create({
      data: {
        id: messageId,
        event_id: eventId,
        created_by: actorId,
        type: (isDirectMessage ? 'DIRECT' : 'ANNOUNCEMENT') as MessageType,
        title: dto.title,
        body_rich: dto.bodyRich || {},
        action_buttons: dto.actionButtons || [],
        body_text: bodyText,
        recipient_filter_json: dto.recipientFilter
          ? (dto.recipientFilter as any)
          : undefined,
        resolved_recipient_count: userIds.length,
        resolved_at: now,
        status: 'SENT',
      },
    });

    // Create recipients in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      await this.prisma.message_recipients.createMany({
        data: batch.map((userId) => ({
          id: crypto.randomUUID(),
          message_id: messageId,
          recipient_user_id: userId,
          delivery_inbox_status: 'DELIVERED',
          delivery_email_status: dto.sendEmail
            ? EmailDeliveryStatus.QUEUED
            : EmailDeliveryStatus.NOT_REQUESTED,
        })),
        skipDuplicates: true,
      });
    }

    // Email delivery is processed by the scheduler-driven queue worker.

    return this.getMessageById(eventId, messageId);
  }

  async listMessages(
    eventId: string,
    query: MessageListQueryDto,
  ): Promise<{ items: MessageSummary[]; nextCursor?: string }> {
    const where: any = { event_id: eventId };
    const cursorDate = this.parseCursorDate(query.cursor);
    if (cursorDate) {
      where.created_at = { lt: cursorDate };
    }

    const messages = await this.prisma.messages.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: query.limit + 1,
      include: { _count: { select: { message_recipients: true } } },
    });

    const hasMore = messages.length > query.limit;
    const page = hasMore ? messages.slice(0, query.limit) : messages;

    const messageIds = page.map((m) => m.id);
    const readCounts =
      messageIds.length === 0
        ? []
        : await this.prisma.message_recipients.groupBy({
            by: ['message_id'],
            where: {
              message_id: { in: messageIds },
              read_at: { not: null },
            },
            _count: { id: true },
          });
    const readCountByMessageId = new Map<string, number>(
      readCounts.map((row) => [row.message_id, row._count.id]),
    );

    const items = page.map((m) => ({
      id: m.id,
      eventId: m.event_id,
      type: m.type as MessageType,
      title: m.title,
      status: (m as any).status || 'SENT',
      recipientCount: m._count.message_recipients,
      readCount: readCountByMessageId.get(m.id) ?? 0,
      createdAt: m.created_at,
      createdBy: m.created_by,
    }));

    return {
      items,
      nextCursor:
        hasMore && page.length > 0
          ? page[page.length - 1].created_at.toISOString()
          : undefined,
    };
  }

  async getMessageById(
    eventId: string,
    messageId: string,
  ): Promise<MessageDetail> {
    const message = await this.prisma.messages.findFirst({
      where: { id: messageId, event_id: eventId },
      include: { _count: { select: { message_recipients: true } } },
    });

    if (!message) throw new NotFoundException('Message not found');

    const readCount = await this.prisma.message_recipients.count({
      where: {
        message_id: message.id,
        read_at: { not: null },
      },
    });

    return {
      id: message.id,
      eventId: message.event_id,
      type: message.type as MessageType,
      title: message.title,
      status: (message as any).status || 'SENT',
      recipientCount: message._count.message_recipients,
      readCount,
      createdAt: message.created_at,
      createdBy: message.created_by,
      bodyRich: message.body_rich,
      bodyText: (message as any).body_text,
      actionButtons: message.action_buttons as any[],
      recipientFilter: (message as any).recipient_filter_json,
      resolvedAt: (message as any).resolved_at,
    };
  }

  async getMessageRecipients(
    eventId: string,
    messageId: string,
    query: MessageRecipientsQueryDto,
  ): Promise<{ items: any[]; nextCursor?: string }> {
    // Verify message belongs to event
    const message = await this.prisma.messages.findFirst({
      where: { id: messageId, event_id: eventId },
    });
    if (!message) throw new NotFoundException('Message not found');

    const where: any = { message_id: messageId };
    const cursorDate = this.parseCursorDate(query.cursor);
    if (cursorDate) {
      where.created_at = { lt: cursorDate };
    }

    const recipients = await this.prisma.message_recipients.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: query.limit + 1,
      include: {
        users: {
          select: {
            email: true,
            applicant_profiles: { select: { full_name: true } },
          },
        },
      },
    });

    const hasMore = recipients.length > query.limit;
    const page = hasMore ? recipients.slice(0, query.limit) : recipients;

    return {
      items: page.map((r) => ({
        id: r.id,
        userId: r.recipient_user_id,
        email: r.users.email,
        name: r.users.applicant_profiles?.full_name,
        emailStatus: r.delivery_email_status,
        readAt: r.read_at,
      })),
      nextCursor:
        hasMore && page.length > 0
          ? page[page.length - 1].created_at.toISOString()
          : undefined,
    };
  }

  // ============================================================
  // APPLICANT INBOX
  // ============================================================

  async getInbox(
    userId: string,
    query: InboxQueryDto,
  ): Promise<{ items: InboxItem[]; nextCursor?: string }> {
    const where: any = { recipient_user_id: userId };

    if (query.eventId) {
      where.messages = { event_id: query.eventId };
    }

    if (query.unreadOnly) {
      where.read_at = null;
    }

    if (query.cursor) {
      where.created_at = { lt: new Date(query.cursor) };
    }

    const recipients = await this.prisma.message_recipients.findMany({
      where,
      include: {
        messages: true,
      },
      orderBy: { created_at: 'desc' },
      take: query.limit + 1,
    });

    const hasMore = recipients.length > query.limit;
    const items = recipients.slice(0, query.limit);

    const eventIdsNeedingApplication = [
      ...new Set(
        items
          .filter((r) => {
            const buttons = (r.messages.action_buttons as any[]) || [];
            const first = Array.isArray(buttons) ? buttons[0] : null;
            if (!first || typeof first !== 'object') return false;
            const kind = String(first.kind ?? '').toUpperCase();
            return (
              (kind === 'OPEN_STEP' || kind === 'OPEN_APPLICATION') &&
              typeof r.messages.event_id === 'string'
            );
          })
          .map((r) => r.messages.event_id as string),
      ),
    ];
    const applicationIdByEvent = await this.resolveApplicationIdsByEvent(
      userId,
      eventIdsNeedingApplication,
    );

    return {
      items: items.map((r) => ({
        ...this.mapInboxAction(
          Array.isArray(r.messages.action_buttons)
            ? (r.messages.action_buttons as any[])[0]
            : null,
          r.messages.event_id
            ? applicationIdByEvent.get(r.messages.event_id)
            : undefined,
        ),
        recipientId: r.id,
        messageId: r.message_id,
        title: r.messages.title,
        type: r.messages.type as MessageType,
        eventId: r.messages.event_id,
        createdAt: r.created_at,
        readAt: r.read_at,
        preview: ((r.messages as any).body_text || '').slice(0, 100),
      })),
      nextCursor: hasMore
        ? items[items.length - 1].created_at.toISOString()
        : undefined,
    };
  }

  async getInboxItem(
    userId: string,
    recipientId: string,
  ): Promise<InboxDetail> {
    const recipient = await this.prisma.message_recipients.findFirst({
      where: { id: recipientId, recipient_user_id: userId },
      include: { messages: true },
    });

    if (!recipient) throw new NotFoundException('Inbox item not found');

    const actionButtons = Array.isArray(recipient.messages.action_buttons)
      ? (recipient.messages.action_buttons as any[])
      : [];
    let applicationId: string | undefined;
    if (recipient.messages.event_id) {
      const app = await this.prisma.applications.findFirst({
        where: {
          event_id: recipient.messages.event_id,
          applicant_user_id: userId,
        },
        select: { id: true },
      });
      applicationId = app?.id;
    }

    return {
      ...this.mapInboxAction(actionButtons[0], applicationId),
      recipientId: recipient.id,
      messageId: recipient.message_id,
      title: recipient.messages.title,
      type: recipient.messages.type as MessageType,
      eventId: recipient.messages.event_id,
      createdAt: recipient.created_at,
      readAt: recipient.read_at,
      preview: ((recipient.messages as any).body_text || '').slice(0, 100),
      bodyRich: recipient.messages.body_rich,
      bodyText: (recipient.messages as any).body_text,
      actionButtons,
    };
  }

  async markAsRead(userId: string, recipientId: string): Promise<void> {
    const result = await this.prisma.message_recipients.updateMany({
      where: { id: recipientId, recipient_user_id: userId },
      data: { read_at: new Date() },
    });

    if (result.count === 0) throw new NotFoundException('Inbox item not found');
  }

  async markAsUnread(userId: string, recipientId: string): Promise<void> {
    const result = await this.prisma.message_recipients.updateMany({
      where: { id: recipientId, recipient_user_id: userId },
      data: { read_at: null },
    });

    if (result.count === 0) throw new NotFoundException('Inbox item not found');
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.message_recipients.updateMany({
      where: { recipient_user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
  }

  private async resolveApplicationIdsByEvent(
    userId: string,
    eventIds: string[],
  ): Promise<Map<string, string>> {
    if (!eventIds.length) return new Map();

    const apps = await this.prisma.applications.findMany({
      where: {
        applicant_user_id: userId,
        event_id: { in: eventIds },
      },
      select: { id: true, event_id: true },
    });

    return new Map(apps.map((app) => [app.event_id, app.id]));
  }

  private mapInboxAction(
    actionButton: any,
    applicationId?: string,
  ): {
    actionType?: 'OPEN_STEP' | 'OPEN_APPLICATION' | 'EXTERNAL_LINK';
    actionPayload?: Record<string, string>;
    actionLabel?: string;
  } {
    if (!actionButton || typeof actionButton !== 'object') return {};

    const kind = String(actionButton.kind ?? '').toUpperCase();
    if (kind === 'EXTERNAL_LINK' && typeof actionButton.url === 'string') {
      return {
        actionType: 'EXTERNAL_LINK',
        actionPayload: { url: actionButton.url },
        actionLabel:
          typeof actionButton.label === 'string'
            ? actionButton.label
            : 'Open link',
      };
    }

    if (kind === 'OPEN_APPLICATION') {
      if (!applicationId) return {};
      return {
        actionType: 'OPEN_APPLICATION',
        actionPayload: { applicationId },
        actionLabel:
          typeof actionButton.label === 'string'
            ? actionButton.label
            : 'View application',
      };
    }

    if (kind === 'OPEN_STEP') {
      if (!applicationId || typeof actionButton.stepId !== 'string') return {};
      return {
        actionType: 'OPEN_STEP',
        actionPayload: {
          applicationId,
          stepId: actionButton.stepId,
        },
        actionLabel:
          typeof actionButton.label === 'string'
            ? actionButton.label
            : 'Open step',
      };
    }

    return {};
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private parseCursorDate(cursor?: string): Date | null {
    if (typeof cursor !== 'string' || cursor.trim().length === 0) return null;
    const parsed = new Date(cursor);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  async processQueuedEmails(
    limit = MessagesService.EMAIL_SEND_BATCH_SIZE,
  ): Promise<{ attempted: number; sent: number; failed: number }> {
    const cappedLimit = Math.min(Math.max(limit, 1), 500);
    const retryCutoff = new Date(
      Date.now() - MessagesService.EMAIL_RETRY_COOLDOWN_MS,
    );

    const recipients = await this.prisma.message_recipients.findMany({
      where: {
        OR: [
          { delivery_email_status: EmailDeliveryStatus.QUEUED },
          {
            delivery_email_status: EmailDeliveryStatus.FAILED,
            AND: [
              {
                OR: [
                  { email_attempts: null },
                  {
                    email_attempts: {
                      lt: MessagesService.EMAIL_RETRY_MAX_ATTEMPTS,
                    },
                  },
                ],
              },
              {
                OR: [
                  { email_last_attempt_at: null },
                  { email_last_attempt_at: { lte: retryCutoff } },
                ],
              },
            ],
          },
        ],
      },
      orderBy: { created_at: 'asc' },
      take: cappedLimit,
      include: {
        users: { select: { email: true } },
        messages: {
          select: {
            title: true,
            body_rich: true,
            action_buttons: true,
          },
        },
      },
    });

    if (recipients.length === 0) {
      return { attempted: 0, sent: 0, failed: 0 };
    }

    const currentAttemptsById = new Map<string, number>(
      recipients.map((recipient) => [recipient.id, recipient.email_attempts ?? 0]),
    );
    const bodyHtmlByMessageId = new Map<string, string>();
    const buttonsByMessageId = new Map<
      string,
      Array<{ label: string; url: string }>
    >();

    for (const recipient of recipients) {
      if (!bodyHtmlByMessageId.has(recipient.message_id)) {
        bodyHtmlByMessageId.set(
          recipient.message_id,
          this.richToHtml(recipient.messages.body_rich),
        );
      }
      if (!buttonsByMessageId.has(recipient.message_id)) {
        buttonsByMessageId.set(
          recipient.message_id,
          this.normalizeActionButtons(recipient.messages.action_buttons),
        );
      }
    }

    const sentIds: string[] = [];
    const failures: Array<{ id: string; reason: string }> = [];
    const workerWidth = MessagesService.EMAIL_SEND_CONCURRENCY;

    for (let i = 0; i < recipients.length; i += workerWidth) {
      const batch = recipients.slice(i, i + workerWidth);
      const results = await Promise.all(
        batch.map(async (recipient) => {
          const email = recipient.users.email;
          if (!email) {
            return {
              id: recipient.id,
              status: EmailDeliveryStatus.FAILED as const,
              reason: 'Recipient email missing',
            };
          }

          try {
            await this.emailService.sendAnnouncement(
              email,
              recipient.messages.title,
              bodyHtmlByMessageId.get(recipient.message_id) ?? '',
              buttonsByMessageId.get(recipient.message_id) ?? [],
            );
            return { id: recipient.id, status: EmailDeliveryStatus.SENT as const };
          } catch (error) {
            return {
              id: recipient.id,
              status: EmailDeliveryStatus.FAILED as const,
              reason: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      for (const result of results) {
        if (result.status === EmailDeliveryStatus.SENT) {
          sentIds.push(result.id);
        } else {
          failures.push({ id: result.id, reason: result.reason });
        }
      }
    }

    const attemptedAt = new Date();
    if (sentIds.length > 0) {
      await this.prisma.message_recipients.updateMany({
        where: { id: { in: sentIds } },
        data: {
          delivery_email_status: EmailDeliveryStatus.SENT,
          email_attempts: { increment: 1 },
          email_last_attempt_at: attemptedAt,
          email_failure_reason: null,
        },
      });
    }

    if (failures.length > 0) {
      await Promise.all(
        failures.map((failure) => {
          const nextAttempts = (currentAttemptsById.get(failure.id) ?? 0) + 1;
          const nextStatus =
            nextAttempts >= MessagesService.EMAIL_RETRY_MAX_ATTEMPTS
              ? EmailDeliveryStatus.SUPPRESSED
              : EmailDeliveryStatus.FAILED;

          return this.prisma.message_recipients.update({
            where: { id: failure.id },
            data: {
              delivery_email_status: nextStatus,
              email_attempts: { increment: 1 },
              email_last_attempt_at: attemptedAt,
              email_failure_reason: failure.reason,
            },
          });
        }),
      );
    }

    return {
      attempted: recipients.length,
      sent: sentIds.length,
      failed: failures.length,
    };
  }

  private normalizeActionButtons(
    actionButtons: unknown,
  ): Array<{ label: string; url: string }> {
    if (!Array.isArray(actionButtons)) return [];

    return actionButtons
      .map((button) => {
        if (!button || typeof button !== 'object') return null;
        const raw = button as Record<string, unknown>;
        const urlCandidate =
          typeof raw.url === 'string'
            ? raw.url
            : typeof raw.href === 'string'
              ? raw.href
              : null;
        if (!urlCandidate || urlCandidate.trim().length === 0) return null;

        return {
          label:
            typeof raw.label === 'string' && raw.label.trim().length > 0
              ? raw.label
              : typeof raw.text === 'string' && raw.text.trim().length > 0
                ? raw.text
                : 'Open link',
          url: urlCandidate,
        };
      })
      .filter((button): button is { label: string; url: string } => !!button);
  }

  private richToHtml(richContent: any): string {
    if (!richContent || typeof richContent !== 'object') return '';
    const renderNode = (node: any): string => {
      if (node.type === 'text') return node.text || '';
      if (node.type === 'paragraph') {
        const inner = (node.content || []).map(renderNode).join('');
        return `<p>${inner}</p>`;
      }
      if (node.type === 'heading') {
        const level = node.attrs?.level || 2;
        const inner = (node.content || []).map(renderNode).join('');
        return `<h${level}>${inner}</h${level}>`;
      }
      if (node.type === 'bulletList' || node.type === 'orderedList') {
        const tag = node.type === 'bulletList' ? 'ul' : 'ol';
        const inner = (node.content || []).map(renderNode).join('');
        return `<${tag}>${inner}</${tag}>`;
      }
      if (node.type === 'listItem') {
        const inner = (node.content || []).map(renderNode).join('');
        return `<li>${inner}</li>`;
      }
      if (node.content) return (node.content as any[]).map(renderNode).join('');
      return '';
    };
    return renderNode(richContent);
  }

  private extractPlaintext(richContent: any): string {
    // Basic extraction from ProseMirror/TipTap JSON
    if (!richContent || typeof richContent !== 'object') return '';

    const extractText = (node: any): string => {
      if (node.text) return node.text;
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join('');
      }
      return '';
    };

    return extractText(richContent);
  }
}
