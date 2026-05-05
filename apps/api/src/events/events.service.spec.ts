import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

describe('EventsService.getOverview', () => {
  let service: EventsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      events: {
        findFirst: jest.fn(),
      },
      applications: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      application_step_states: {
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      attendance_records: {
        count: jest.fn(),
      },
      workflow_steps: {
        findMany: jest.fn(),
      },
    };

    service = new EventsService(
      mockPrisma,
      { deleteObject: jest.fn() } as any,
      { get: jest.fn() } as any,
    );
  });

  it('throws NotFoundException when event does not exist', async () => {
    mockPrisma.events.findFirst.mockResolvedValue(null);

    await expect(service.getOverview('missing-event')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('aggregates truthful KPI counts for started/submitted/review/decisions', async () => {
    mockPrisma.events.findFirst.mockResolvedValue({ id: 'event-1' });
    mockPrisma.applications.count.mockResolvedValue(6);
    mockPrisma.applications.groupBy.mockResolvedValue([
      { decision_status: 'NONE', _count: { id: 3 } },
      { decision_status: 'ACCEPTED', _count: { id: 1 } },
      { decision_status: 'WAITLISTED', _count: { id: 1 } },
      { decision_status: 'REJECTED', _count: { id: 1 } },
    ]);
    mockPrisma.application_step_states.groupBy
      .mockResolvedValueOnce([
        { application_id: 'app-2', _count: { id: 1 } },
        { application_id: 'app-3', _count: { id: 2 } },
        { application_id: 'app-4', _count: { id: 1 } },
        { application_id: 'app-5', _count: { id: 2 } },
      ])
      .mockResolvedValueOnce([
        { application_id: 'app-2', _count: { id: 1 } },
        { application_id: 'app-5', _count: { id: 2 } },
      ]);
    mockPrisma.application_step_states.count.mockResolvedValue(3);
    mockPrisma.attendance_records.count.mockResolvedValue(1);
    mockPrisma.workflow_steps.findMany.mockResolvedValue([
      {
        title: 'Step 1',
        step_index: 1,
        application_step_states: [
          { status: 'UNLOCKED' },
          { status: 'SUBMITTED' },
          { status: 'APPROVED' },
          { status: 'REJECTED_FINAL' },
          { status: 'SUBMITTED' },
          { status: 'LOCKED' },
        ],
      },
      {
        title: 'Step 2',
        step_index: 2,
        application_step_states: [
          { status: 'LOCKED' },
          { status: 'NEEDS_REVISION' },
          { status: 'APPROVED' },
          { status: 'LOCKED' },
          { status: 'SUBMITTED' },
          { status: 'LOCKED' },
        ],
      },
    ]);

    const overview = await service.getOverview('event-1');

    expect(overview.totalApplications).toBe(6);
    expect(overview.submitted).toBe(4);
    expect(overview.inReview).toBe(2);
    expect(overview.pendingReviews).toBe(3);
    expect(overview.accepted).toBe(1);
    expect(overview.waitlisted).toBe(1);
    expect(overview.rejected).toBe(1);
    expect(overview.checkedIn).toBe(1);
  });

  it('uses reached-step denominator and submission statuses for funnel metrics', async () => {
    mockPrisma.events.findFirst.mockResolvedValue({ id: 'event-1' });
    mockPrisma.applications.count.mockResolvedValue(0);
    mockPrisma.applications.groupBy.mockResolvedValue([]);
    mockPrisma.application_step_states.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.application_step_states.count.mockResolvedValue(0);
    mockPrisma.attendance_records.count.mockResolvedValue(0);
    mockPrisma.workflow_steps.findMany.mockResolvedValue([
      {
        title: 'Step A',
        step_index: 1,
        application_step_states: [
          { status: 'LOCKED' },
          { status: 'UNLOCKED' },
          { status: 'SUBMITTED' },
          { status: 'NEEDS_REVISION' },
          { status: 'APPROVED' },
          { status: 'REJECTED_FINAL' },
        ],
      },
    ]);

    const overview = await service.getOverview('event-1');
    expect(overview.stepFunnel).toEqual([
      {
        stepTitle: 'Step A',
        total: 5,
        submitted: 4,
        approved: 1,
        rejected: 1,
      },
    ]);

    const submissionGroupByArgs =
      mockPrisma.application_step_states.groupBy.mock.calls[0][0];
    expect(submissionGroupByArgs.where.status).toEqual({
      in: ['SUBMITTED', 'NEEDS_REVISION', 'APPROVED', 'REJECTED_FINAL'],
    });
  });

  it('keeps pending review task count separate from in-review application count', async () => {
    mockPrisma.events.findFirst.mockResolvedValue({ id: 'event-1' });
    mockPrisma.applications.count.mockResolvedValue(2);
    mockPrisma.applications.groupBy.mockResolvedValue([]);
    mockPrisma.application_step_states.groupBy
      .mockResolvedValueOnce([
        { application_id: 'app-1', _count: { id: 2 } },
        { application_id: 'app-2', _count: { id: 1 } },
      ])
      .mockResolvedValueOnce([{ application_id: 'app-1', _count: { id: 3 } }]);
    mockPrisma.application_step_states.count.mockResolvedValue(3);
    mockPrisma.attendance_records.count.mockResolvedValue(0);
    mockPrisma.workflow_steps.findMany.mockResolvedValue([]);

    const overview = await service.getOverview('event-1');

    expect(overview.submitted).toBe(2);
    expect(overview.inReview).toBe(1);
    expect(overview.pendingReviews).toBe(3);
  });
});

describe('EventsService.unarchive', () => {
  let service: EventsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      events: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new EventsService(
      mockPrisma,
      { deleteObject: jest.fn() } as any,
      { get: jest.fn() } as any,
    );
  });

  it('throws NotFoundException when event does not exist', async () => {
    mockPrisma.events.findUnique.mockResolvedValue(null);

    await expect(service.unarchive('missing-event')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockPrisma.events.update).not.toHaveBeenCalled();
  });

  it('throws ConflictException when event is not archived', async () => {
    mockPrisma.events.findUnique.mockResolvedValue({
      id: 'event-1',
      status: 'draft',
    });

    await expect(service.unarchive('event-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mockPrisma.events.update).not.toHaveBeenCalled();
  });

  it('restores archived event back to draft', async () => {
    const baseEvent = {
      id: 'event-1',
      title: 'Sample Event',
      slug: 'sample-event',
      series_key: null,
      edition_label: null,
      status: 'archived',
      application_open_at: null,
      application_close_at: null,
      timezone: 'UTC',
      start_at: null,
      end_at: null,
      venue_name: null,
      venue_address: null,
      venue_map_url: null,
      description: null,
      capacity: null,
      requires_email_verification: false,
      format: 'in_person',
      decision_config: {},
      checkin_config: {},
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-02T00:00:00.000Z'),
    };

    mockPrisma.events.findUnique.mockResolvedValue(baseEvent);
    mockPrisma.events.update.mockResolvedValue({
      ...baseEvent,
      status: 'draft',
      updated_at: new Date('2026-01-03T00:00:00.000Z'),
    });

    const result = await service.unarchive('event-1');

    expect(mockPrisma.events.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { status: 'draft' },
    });
    expect(result).toMatchObject({
      id: 'event-1',
      status: 'draft',
      slug: 'sample-event',
    });
  });
});
