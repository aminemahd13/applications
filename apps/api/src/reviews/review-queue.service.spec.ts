import { Permission, StepStatus } from '@event-platform/shared';
import { ReviewQueueService } from './review-queue.service';

function buildQueueItem(params?: {
  id?: string;
  queueMode?: 'direct' | 'shared';
  assignedReviewerId?: string | null;
  updatedAt?: string;
  stepId?: string;
  submissionVersionId?: string;
  revisionCycleCount?: number;
  hasOpenNeedsInfo?: boolean;
}) {
  const stepId = params?.stepId ?? 'step-1';
  const updatedAt = new Date(params?.updatedAt ?? '2026-03-09T10:00:00.000Z');
  const submissionVersionId = params?.submissionVersionId ?? 'version-1';
  const queueMode = params?.queueMode ?? 'shared';
  const assignedReviewerId = params?.assignedReviewerId ?? null;
  const revisionCycleCount = params?.revisionCycleCount ?? 0;

  return {
    id: params?.id ?? 'queue-1',
    updated_at: updatedAt,
    queue_mode: queueMode,
    assignment_expires_at: null,
    assigned_reviewer_id: assignedReviewerId,
    application_id: 'app-1',
    step_id: stepId,
    submission_version_id: submissionVersionId,
    applications: {
      id: 'app-1',
      tags: ['vip'],
      users_applications_applicant_user_idTousers: {
        email: 'applicant@example.com',
        applicant_profiles: { full_name: 'Applicant Name' },
      },
      application_step_states: [
        {
          step_id: stepId,
          status: StepStatus.SUBMITTED,
          latest_submission_version_id: submissionVersionId,
          last_activity_at: updatedAt,
          revision_cycle_count: revisionCycleCount,
        },
      ],
      needs_info_requests: params?.hasOpenNeedsInfo
        ? [{ step_id: stepId }]
        : [],
    },
    workflow_steps: {
      id: stepId,
      title: 'Review Step',
      step_index: 1,
    },
    step_submission_versions: {
      id: submissionVersionId,
      form_version_id: 'form-version-1',
      answers_snapshot: { answer: 'value' },
      version_number: 2,
      submitted_at: updatedAt,
    },
  };
}

describe('ReviewQueueService', () => {
  let service: ReviewQueueService;
  let mockPrisma: any;
  let mockCls: any;
  let mockReviewerAssignmentService: any;

  beforeEach(() => {
    mockPrisma = {
      workflow_steps: {
        findMany: jest.fn().mockResolvedValue([{ id: 'step-1' }]),
      },
      review_queue_items: {
        findMany: jest.fn().mockResolvedValue([buildQueueItem()]),
        count: jest.fn(),
      },
      form_versions: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'form-version-1', schema: { fields: [] } }]),
      },
      review_queue_saved_views: {
        findMany: jest.fn(),
      },
      applications: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    mockCls = {
      get: jest.fn((key: string) => {
        if (key === 'actorId') return 'reviewer-1';
        if (key === 'permissions') return [Permission.EVENT_APPLICATION_LIST];
        if (key === 'isGlobalAdmin') return false;
        return undefined;
      }),
    };

    mockReviewerAssignmentService = {
      syncOpenQueueItemsForEvent: jest.fn().mockResolvedValue({ created: 0, completed: 0 }),
      releaseExpiredDirectAssignments: jest.fn().mockResolvedValue({ released: 0 }),
      listEligibleReviewers: jest.fn().mockResolvedValue([]),
    };

    service = new ReviewQueueService(
      mockPrisma,
      mockCls,
      mockReviewerAssignmentService,
    );
  });

  it('restricts non-organizer queue visibility to mine + shared', async () => {
    await service.getQueue('event-1', { limit: 20 } as any);

    const findManyArg = mockPrisma.review_queue_items.findMany.mock.calls[0][0];
    expect(findManyArg.where).toMatchObject({
      event_id: 'event-1',
      completed_at: null,
      OR: [
        {
          queue_mode: 'direct',
          assigned_reviewer_id: 'reviewer-1',
        },
        {
          queue_mode: 'shared',
        },
      ],
    });
  });

  it('allows organizer to query full queue when assignedTo is omitted', async () => {
    mockCls.get = jest.fn((key: string) => {
      if (key === 'actorId') return 'organizer-1';
      if (key === 'permissions') return [Permission.EVENT_UPDATE];
      if (key === 'isGlobalAdmin') return false;
      return undefined;
    });

    await service.getQueue('event-1', { limit: 20 } as any);

    const findManyArg = mockPrisma.review_queue_items.findMany.mock.calls[0][0];
    expect(findManyArg.where.OR).toBeUndefined();
  });

  it('applies assignedTo=me filter against direct assignments', async () => {
    await service.getQueue('event-1', {
      limit: 20,
      assignedTo: 'me',
    } as any);

    const findManyArg = mockPrisma.review_queue_items.findMany.mock.calls[0][0];
    expect(findManyArg.where).toMatchObject({
      queue_mode: 'direct',
      assigned_reviewer_id: 'reviewer-1',
    });
  });

  it('maps queue response with assignment metadata', async () => {
    const result = await service.getQueue('event-1', { limit: 20 } as any);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'queue-1',
      queueItemId: 'queue-1',
      queueMode: 'shared',
      assignedReviewerId: null,
      stepId: 'step-1',
      submissionVersionId: 'version-1',
    });
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
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
