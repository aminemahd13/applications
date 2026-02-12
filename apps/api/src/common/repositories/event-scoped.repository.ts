/**
 * Event-Scoped Repository Helpers
 *
 * SECURITY: These helpers enforce that all queries for event-scoped entities
 * MUST include eventId in the WHERE clause. This prevents cross-event data leaks.
 *
 * Response Strategy:
 *   - Resource belongs to different event → NotFoundException (404) - prevents ID probing
 *   - User not authorized for event → ForbiddenException (403)
 */

import { PrismaClient } from '@event-platform/db';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

/**
 * Event-scoped query builder for applications
 */
export class ApplicationRepository {
  constructor(
    private prisma: PrismaClient,
    private eventId: string,
  ) {}

  async findById(id: string) {
    const result = await this.prisma.applications.findFirst({
      where: { id, event_id: this.eventId },
    });
    if (!result) throw new NotFoundException('Application not found');
    return result;
  }

  async findByApplicantUserId(applicantUserId: string) {
    return this.prisma.applications.findFirst({
      where: { applicant_user_id: applicantUserId, event_id: this.eventId },
    });
  }

  async findMany(filter: any = {}) {
    return this.prisma.applications.findMany({
      where: { ...filter, event_id: this.eventId },
    });
  }

  async count(filter: any = {}) {
    return this.prisma.applications.count({
      where: { ...filter, event_id: this.eventId },
    });
  }

  async create(data: any) {
    return this.prisma.applications.create({
      data: { ...data, event_id: this.eventId },
    });
  }

  async update(id: string, data: any) {
    await this.findById(id); // Verify ownership first
    return this.prisma.applications.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.applications.delete({ where: { id } });
  }
}

/**
 * Event-scoped query builder for workflow_steps
 */
export class WorkflowStepRepository {
  constructor(
    private prisma: PrismaClient,
    private eventId: string,
  ) {}

  async findById(id: string) {
    const result = await this.prisma.workflow_steps.findFirst({
      where: { id, event_id: this.eventId },
    });
    if (!result) throw new NotFoundException('Workflow step not found');
    return result;
  }

  async findMany(filter: any = {}) {
    return this.prisma.workflow_steps.findMany({
      where: { ...filter, event_id: this.eventId },
    });
  }
}

/**
 * Event-scoped query builder for file_objects
 */
export class FileObjectRepository {
  constructor(
    private prisma: PrismaClient,
    private eventId: string,
  ) {}

  async findById(id: string) {
    const result = await this.prisma.file_objects.findFirst({
      where: { id, event_id: this.eventId },
    });
    if (!result) throw new NotFoundException('File not found');
    return result;
  }

  async findMany(filter: any = {}) {
    return this.prisma.file_objects.findMany({
      where: { ...filter, event_id: this.eventId },
    });
  }
}

/**
 * Event-scoped query builder for checkin_records
 */
export class CheckinRecordRepository {
  constructor(
    private prisma: PrismaClient,
    private eventId: string,
  ) {}

  async findByApplicationId(applicationId: string) {
    return this.prisma.checkin_records.findMany({
      where: { application_id: applicationId, event_id: this.eventId },
    });
  }

  async create(data: any) {
    return this.prisma.checkin_records.create({
      data: { ...data, event_id: this.eventId },
    });
  }
}

/**
 * Main event-scoped repository factory.
 *
 * USAGE:
 *   const repo = new EventScopedRepository(prisma, eventId);
 *   const app = await repo.applications.findById(appId);
 */
export class EventScopedRepository {
  public readonly applications: ApplicationRepository;
  public readonly workflowSteps: WorkflowStepRepository;
  public readonly fileObjects: FileObjectRepository;
  public readonly checkinRecords: CheckinRecordRepository;

  constructor(prisma: PrismaClient, eventId: string) {
    if (!eventId) {
      throw new ForbiddenException(
        'Event ID is required for scoped operations',
      );
    }

    this.applications = new ApplicationRepository(prisma, eventId);
    this.workflowSteps = new WorkflowStepRepository(prisma, eventId);
    this.fileObjects = new FileObjectRepository(prisma, eventId);
    this.checkinRecords = new CheckinRecordRepository(prisma, eventId);
  }
}

/**
 * Factory function for creating event-scoped repositories.
 */
export function createEventScopedRepository(
  prisma: PrismaClient,
  eventId: string,
): EventScopedRepository {
  return new EventScopedRepository(prisma, eventId);
}

/**
 * Response Strategy Constants
 */
export const ISOLATION_RESPONSE = {
  RESOURCE_NOT_FOUND: 404, // Resource doesn't exist or belongs to different event
  NOT_AUTHORIZED: 403, // User lacks permission for this event entirely
} as const;
