import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import {
  AssignRoleDto,
  BulkRolesDto,
  PaginatedResponse,
  PaginationDto,
} from '@event-platform/shared';

export interface RoleAssignment {
  id: string;
  userId: string;
  eventId: string;
  role: string;
  createdAt: Date;
  user?: { id: string; email: string };
}

@Injectable()
export class RoleAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * List role assignments for an event (paginated)
   */
  async findAll(
    eventId: string,
    filter: PaginationDto,
  ): Promise<PaginatedResponse<RoleAssignment>> {
    const { cursor, limit, order } = filter;

    const where: any = { event_id: eventId };
    if (cursor) where.id = { lt: cursor };

    const assignments = await this.prisma.event_role_assignments.findMany({
      where,
      orderBy: { created_at: order },
      take: limit + 1,
      include: { users: { select: { id: true, email: true } } },
    });

    const hasMore = assignments.length > limit;
    const data = hasMore ? assignments.slice(0, -1) : assignments;

    return {
      data: data.map((a) => ({
        id: a.id,
        userId: a.user_id,
        eventId: a.event_id,
        role: a.role,
        createdAt: a.created_at,
        user: a.users,
      })),
      meta: {
        nextCursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  /**
   * Assign a single role (idempotent - no-op if exists)
   */
  async assign(eventId: string, dto: AssignRoleDto): Promise<RoleAssignment> {
    // Check if assignment already exists (idempotent)
    const existing = await this.prisma.event_role_assignments.findFirst({
      where: {
        event_id: eventId,
        user_id: dto.userId,
        role: dto.role,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        userId: existing.user_id,
        eventId: existing.event_id,
        role: existing.role,
        createdAt: existing.created_at,
      };
    }

    const [user, event] = await Promise.all([
      this.prisma.users.findUnique({
        where: { id: dto.userId },
        select: { id: true },
      }),
      this.prisma.events.findFirst({
        where: { id: eventId },
        select: { id: true },
      }),
    ]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const assignment = await this.prisma.event_role_assignments.create({
      data: {
        id: crypto.randomUUID(),
        event_id: eventId,
        user_id: dto.userId,
        role: dto.role,
      },
    });

    return {
      id: assignment.id,
      userId: assignment.user_id,
      eventId: assignment.event_id,
      role: assignment.role,
      createdAt: assignment.created_at,
    };
  }

  /**
   * Bulk assign/remove roles (idempotent)
   */
  async bulk(
    eventId: string,
    dto: BulkRolesDto,
  ): Promise<{ assigned: number; removed: number }> {
    let assigned = 0;
    let removed = 0;

    const uniqueAssign = dto.assign;
    if (uniqueAssign.length > 0) {
      const event = await this.prisma.events.findFirst({
        where: { id: eventId },
        select: { id: true },
      });
      if (!event) {
        throw new NotFoundException('Event not found');
      }

      const requestedUserIds = Array.from(
        new Set(uniqueAssign.map((item) => item.userId)),
      );
      const existingUsers = await this.prisma.users.findMany({
        where: { id: { in: requestedUserIds } },
        select: { id: true },
      });
      const validUserIds = new Set(existingUsers.map((user) => user.id));

      const validAssignItems = uniqueAssign.filter((item) =>
        validUserIds.has(item.userId),
      );
      assigned = validAssignItems.length;

      if (validAssignItems.length > 0) {
        const requestedRoles = Array.from(
          new Set(validAssignItems.map((item) => item.role)),
        );
        const existingAssignments = await this.prisma.event_role_assignments.findMany(
          {
            where: {
              event_id: eventId,
              user_id: { in: Array.from(validUserIds) },
              role: { in: requestedRoles },
            },
            select: { user_id: true, role: true },
          },
        );
        const existingKeys = new Set(
          existingAssignments.map((row) => `${row.user_id}:${row.role}`),
        );

        const rowsToCreate = validAssignItems
          .filter((item) => !existingKeys.has(`${item.userId}:${item.role}`))
          .map((item) => ({
            id: crypto.randomUUID(),
            event_id: eventId,
            user_id: item.userId,
            role: item.role,
          }));

        if (rowsToCreate.length > 0) {
          await this.prisma.event_role_assignments.createMany({
            data: rowsToCreate,
            skipDuplicates: true,
          });
        }
      }
    }

    // Process removals
    const removeIds = Array.from(
      new Set(dto.remove.map((item) => item.assignmentId)),
    );
    if (removeIds.length > 0) {
      const result = await this.prisma.event_role_assignments.deleteMany({
        where: {
          id: { in: removeIds },
          event_id: eventId, // Ensure scoped to this event
        },
      });
      removed = result.count;
    }

    return { assigned, removed };
  }

  /**
   * Remove a specific role assignment
   */
  async remove(eventId: string, assignmentId: string): Promise<void> {
    const assignment = await this.prisma.event_role_assignments.findFirst({
      where: { id: assignmentId, event_id: eventId },
    });

    if (!assignment) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.event_role_assignments.delete({
      where: { id: assignmentId },
    });
  }
}
