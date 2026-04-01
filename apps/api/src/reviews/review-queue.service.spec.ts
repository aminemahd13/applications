import { StepStatus } from '@event-platform/shared';
import { ReviewQueueService } from './review-queue.service';

function buildApp(params: {
  id: string;
  updatedAt: string;
  stepId?: string;
  stepStatus?: StepStatus;
}) {
  const stepId = params.stepId ?? 'step-1';
  const stepStatus = params.stepStatus ?? StepStatus.SUBMITTED;
  return {
    id: params.id,
    event_id: 'event-1',
    updated_at: new Date(params.updatedAt),
    assigned_reviewer_id: null,
    tags: [],
    users_applications_applicant_user_idTousers: {
      email: `${params.id}@example.com`,
      applicant_profiles: { full_name: params.id },
    },
    application_step_states: [
      {
        step_id: stepId,
        status: stepStatus,
        revision_cycle_count: 0,
        latest_submission_version_id: null,
        last_activity_at: new Date(params.updatedAt),
        workflow_steps: {
          id: stepId,
          title: 'Review Step',
          step_index: 1,
        },
      },
    ],
    needs_info_requests: [],
  };
}

describe('ReviewQueueService', () => {
  let service: ReviewQueueService;
  let mockPrisma: any;
  let mockCls: any;

  beforeEach(() => {
    mockPrisma = {
      workflow_steps: {
        findMany: jest.fn(),
      },
      applications: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      step_submission_versions: {
        findMany: jest.fn(),
      },
      form_versions: {
        findMany: jest.fn(),
      },
      review_queue_saved_views: {
        findMany: jest.fn(),
      },
    };
    mockCls = {
      get: jest.fn().mockReturnValue('reviewer-1'),
    };
    service = new ReviewQueueService(mockPrisma, mockCls);
  });

  it('applies DB-level queue eligibility filter before pagination', async () => {
    mockPrisma.workflow_steps.findMany.mockResolvedValue([{ id: 'step-1' }]);
    mockPrisma.applications.findMany.mockResolvedValue([
      buildApp({
        id: 'app-matching',
        updatedAt: '2026-03-09T10:00:00.000Z',
      }),
    ]);
    mockPrisma.step_submission_versions.findMany.mockResolvedValue([]);

    const result = await service.getQueue('event-1', {
      limit: 50,
    } as any);

    const findManyArg = mockPrisma.applications.findMany.mock.calls[0][0];
    expect(findManyArg.where).toMatchObject({
      event_id: 'event-1',
      application_step_states: {
        some: {
          status: { in: [StepStatus.SUBMITTED, StepStatus.NEEDS_REVISION] },
          step_id: { in: ['step-1'] },
        },
      },
    });
    expect(findManyArg.orderBy).toEqual([
      { updated_at: 'desc' },
      { id: 'desc' },
    ]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].applicationId).toBe('app-matching');
  });

  it('uses composite cursor pagination without duplicates when timestamps are equal', async () => {
    const sharedUpdatedAt = '2026-03-09T10:00:00.000Z';
    const firstPageTop = buildApp({
      id: 'app-b',
      updatedAt: sharedUpdatedAt,
    });
    const firstPageNext = buildApp({
      id: 'app-a',
      updatedAt: sharedUpdatedAt,
    });

    mockPrisma.workflow_steps.findMany.mockResolvedValue([{ id: 'step-1' }]);
    mockPrisma.step_submission_versions.findMany.mockResolvedValue([]);
    mockPrisma.applications.findMany
      .mockResolvedValueOnce([firstPageTop, firstPageNext])
      .mockResolvedValueOnce([firstPageNext]);

    const first = await service.getQueue('event-1', {
      limit: 1,
    } as any);
    expect(first.meta.hasMore).toBe(true);
    expect(typeof first.meta.nextCursor).toBe('string');
    expect(first.data).toHaveLength(1);

    const second = await service.getQueue('event-1', {
      limit: 1,
      cursor: first.meta.nextCursor!,
    } as any);

    const secondWhere = mockPrisma.applications.findMany.mock.calls[1][0].where;
    expect(secondWhere.AND[0]).toEqual({
      OR: [
        { updated_at: { lt: new Date(sharedUpdatedAt) } },
        {
          updated_at: new Date(sharedUpdatedAt),
          id: { lt: 'app-b' },
        },
      ],
    });

    const allQueueIds = [...first.data, ...second.data].map((item) => item.id);
    expect(new Set(allQueueIds).size).toBe(allQueueIds.length);
    expect(second.data).toHaveLength(1);
    expect(second.data[0].applicationId).toBe('app-a');
  });

  it('supports legacy id-only cursor by resolving anchor application first', async () => {
    mockPrisma.workflow_steps.findMany.mockResolvedValue([{ id: 'step-1' }]);
    mockPrisma.step_submission_versions.findMany.mockResolvedValue([]);
    mockPrisma.applications.findFirst.mockResolvedValue({
      id: 'legacy-app-id',
      updated_at: new Date('2026-03-08T08:00:00.000Z'),
    });
    mockPrisma.applications.findMany.mockResolvedValue([
      buildApp({
        id: 'app-older',
        updatedAt: '2026-03-07T08:00:00.000Z',
      }),
    ]);

    const result = await service.getQueue('event-1', {
      limit: 10,
      cursor: 'legacy-app-id',
    } as any);

    expect(mockPrisma.applications.findFirst).toHaveBeenCalledWith({
      where: { id: 'legacy-app-id', event_id: 'event-1' },
      select: { id: true, updated_at: true },
    });
    const whereArg = mockPrisma.applications.findMany.mock.calls[0][0].where;
    expect(whereArg.AND[0]).toEqual({
      OR: [
        { updated_at: { lt: new Date('2026-03-08T08:00:00.000Z') } },
        {
          updated_at: new Date('2026-03-08T08:00:00.000Z'),
          id: { lt: 'legacy-app-id' },
        },
      ],
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].applicationId).toBe('app-older');
  });

  it('ignores application-filter saved view payloads in review queue list', async () => {
    mockPrisma.review_queue_saved_views.findMany.mockResolvedValue([
      {
        id: 'rv-1',
        event_id: 'event-1',
        name: 'Review',
        user_id: 'reviewer-1',
        is_default: false,
        created_at: new Date('2026-03-10T10:00:00.000Z'),
        updated_at: new Date('2026-03-10T10:00:00.000Z'),
        filters: {
          kind: 'review_queue',
          version: 1,
          filters: { status: 'pending' },
        },
      },
      {
        id: 'rv-2',
        event_id: 'event-1',
        name: 'Applications view',
        user_id: 'reviewer-1',
        is_default: false,
        created_at: new Date('2026-03-10T10:00:00.000Z'),
        updated_at: new Date('2026-03-10T10:00:00.000Z'),
        filters: {
          kind: 'applications',
          version: 1,
          mode: 'advanced',
          filterTree: { type: 'group', mode: 'all', children: [] },
        },
      },
    ]);

    const views = await service.listSavedViews('event-1');
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('rv-1');
  });
});
