import * as crypto from 'crypto';
import { ConflictException } from '@nestjs/common';
import { ReviewerAssignmentService } from './reviewer-assignment.service';

type QueueMode = 'direct' | 'shared';

function deterministicReviewer(
  seed: string,
  submissionVersionId: string,
  reviewerIds: string[],
): string {
  let winner = reviewerIds[0] ?? '';
  let winnerHash = crypto
    .createHash('sha256')
    .update(`${seed}:${submissionVersionId}:${winner}`)
    .digest('hex');

  for (let index = 1; index < reviewerIds.length; index += 1) {
    const candidate = reviewerIds[index];
    const hash = crypto
      .createHash('sha256')
      .update(`${seed}:${submissionVersionId}:${candidate}`)
      .digest('hex');
    if (hash < winnerHash) {
      winner = candidate;
      winnerHash = hash;
    }
  }

  return winner;
}

function buildScopeItem(params: {
  id: string;
  submissionVersionId: string;
  queueMode?: QueueMode;
  assignedReviewerId?: string | null;
  updatedAt?: string;
}) {
  return {
    id: params.id,
    submission_version_id: params.submissionVersionId,
    assigned_reviewer_id:
      params.assignedReviewerId === undefined ? 'legacy-reviewer' : params.assignedReviewerId,
    queue_mode: params.queueMode ?? 'direct',
    assignment_expires_at: new Date('2026-04-02T09:00:00.000Z'),
    updated_at: new Date(params.updatedAt ?? '2026-04-02T10:00:00.000Z'),
  };
}

function buildMockPrisma() {
  return {
    event_role_assignments: {
      findMany: jest.fn().mockResolvedValue([
        {
          role: 'reviewer',
          users: {
            id: 'reviewer-b',
            email: 'b@example.com',
            applicant_profiles: { full_name: 'Reviewer B' },
          },
        },
        {
          role: 'reviewer',
          users: {
            id: 'reviewer-a',
            email: 'a@example.com',
            applicant_profiles: { full_name: 'Reviewer A' },
          },
        },
      ]),
    },
    workflow_steps: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'step-1' },
      ]),
    },
    application_step_states: {
      findMany: jest.fn().mockResolvedValue([
        {
          application_id: 'app-1',
          step_id: 'step-1',
          latest_submission_version_id: 'sub-1',
        },
        {
          application_id: 'app-2',
          step_id: 'step-1',
          latest_submission_version_id: 'sub-2',
        },
        {
          application_id: 'app-3',
          step_id: 'step-1',
          latest_submission_version_id: 'sub-3',
        },
      ]),
    },
    review_queue_items: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    review_assignment_previews: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    review_assignment_runs: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    review_records: {
      groupBy: jest.fn(),
    },
    audit_logs: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

function buildCls(overrides?: {
  actorId?: string;
  permissions?: string[];
  isGlobalAdmin?: boolean;
}) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'actorId') return overrides?.actorId ?? 'actor-1';
      if (key === 'permissions') return overrides?.permissions ?? ['event.update'];
      if (key === 'isGlobalAdmin') return overrides?.isGlobalAdmin ?? false;
      return undefined;
    }),
  };
}

describe('ReviewerAssignmentService', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let cls: ReturnType<typeof buildCls>;
  let service: ReviewerAssignmentService;

  beforeEach(() => {
    prisma = buildMockPrisma();
    cls = buildCls();
    service = new ReviewerAssignmentService(prisma as any, cls as any);
  });

  function mockQueueForPreview(scopeItems: Array<ReturnType<typeof buildScopeItem>>) {
    prisma.review_queue_items.findMany
      .mockResolvedValueOnce(
        scopeItems.map((item) => ({
          id: item.id,
          submission_version_id: item.submission_version_id,
        })),
      )
      .mockResolvedValueOnce(scopeItems);
  }

  it('allocates equal distribution deterministically', async () => {
    const scopeItems = [
      buildScopeItem({ id: 'q1', submissionVersionId: 'sub-1' }),
      buildScopeItem({ id: 'q2', submissionVersionId: 'sub-2' }),
      buildScopeItem({ id: 'q3', submissionVersionId: 'sub-3' }),
    ];
    mockQueueForPreview(scopeItems);

    await service.createPreview('event-1', {
      mode: 'equal_distribution',
      reviewerPoolUserIds: ['reviewer-b', 'reviewer-a'],
      includeStepIds: ['step-1'],
      excludeStepIds: [],
      runPolicy: 'reassign_all',
      hybridTargets: [],
    } as any);

    const createArg = prisma.review_assignment_previews.create.mock.calls[0][0];
    const operations = createArg.data.snapshot_payload.operations as Array<{
      queueItemId: string;
      desiredAssignedReviewerId: string | null;
      desiredQueueMode: QueueMode;
    }>;
    const desiredByItemId = new Map(
      operations.map((operation) => [operation.queueItemId, operation]),
    );

    expect(desiredByItemId.get('q1')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: 'reviewer-a',
    });
    expect(desiredByItemId.get('q2')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: 'reviewer-b',
    });
    expect(desiredByItemId.get('q3')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: 'reviewer-a',
    });
  });

  it('allocates fixed_per_reviewer and sends overflow to shared', async () => {
    const scopeItems = [
      buildScopeItem({ id: 'q1', submissionVersionId: 'sub-1' }),
      buildScopeItem({ id: 'q2', submissionVersionId: 'sub-2' }),
      buildScopeItem({ id: 'q3', submissionVersionId: 'sub-3' }),
    ];
    mockQueueForPreview(scopeItems);

    await service.createPreview('event-1', {
      mode: 'fixed_per_reviewer',
      reviewerPoolUserIds: ['reviewer-b', 'reviewer-a'],
      includeStepIds: ['step-1'],
      excludeStepIds: [],
      runPolicy: 'reassign_all',
      fixedReviewsPerReviewer: 1,
      hybridTargets: [],
    } as any);

    const createArg = prisma.review_assignment_previews.create.mock.calls[0][0];
    const operations = createArg.data.snapshot_payload.operations as Array<{
      queueItemId: string;
      desiredAssignedReviewerId: string | null;
      desiredQueueMode: QueueMode;
    }>;
    const desiredByItemId = new Map(
      operations.map((operation) => [operation.queueItemId, operation]),
    );

    expect(desiredByItemId.get('q1')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: 'reviewer-a',
    });
    expect(desiredByItemId.get('q2')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: 'reviewer-b',
    });
    expect(desiredByItemId.get('q3')).toMatchObject({
      desiredQueueMode: 'shared',
      desiredAssignedReviewerId: null,
    });
  });

  it('allocates hybrid manual targets then random remainder deterministically', async () => {
    const scopeItems = [
      buildScopeItem({ id: 'q1', submissionVersionId: 'sub-1' }),
      buildScopeItem({ id: 'q2', submissionVersionId: 'sub-2' }),
      buildScopeItem({ id: 'q3', submissionVersionId: 'sub-3' }),
    ];
    mockQueueForPreview(scopeItems);

    const preview = await service.createPreview('event-1', {
      mode: 'hybrid_manual_then_random',
      reviewerPoolUserIds: ['reviewer-b', 'reviewer-a'],
      includeStepIds: ['step-1'],
      excludeStepIds: [],
      runPolicy: 'reassign_all',
      hybridTargets: [{ reviewerId: 'reviewer-a', count: 1 }],
    } as any);

    const createArg = prisma.review_assignment_previews.create.mock.calls[0][0];
    const operations = createArg.data.snapshot_payload.operations as Array<{
      queueItemId: string;
      desiredAssignedReviewerId: string | null;
      desiredQueueMode: QueueMode;
    }>;
    const desiredByItemId = new Map(
      operations.map((operation) => [operation.queueItemId, operation]),
    );
    const sortedReviewers = ['reviewer-a', 'reviewer-b'];
    const seed = preview.previewId;

    expect(desiredByItemId.get('q1')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: 'reviewer-a',
    });
    expect(desiredByItemId.get('q2')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: deterministicReviewer(
        seed,
        'sub-2',
        sortedReviewers,
      ),
    });
    expect(desiredByItemId.get('q3')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: deterministicReviewer(
        seed,
        'sub-3',
        sortedReviewers,
      ),
    });
  });

  it('allocates pure_random deterministically from preview seed', async () => {
    const scopeItems = [
      buildScopeItem({ id: 'q1', submissionVersionId: 'sub-1' }),
      buildScopeItem({ id: 'q2', submissionVersionId: 'sub-2' }),
      buildScopeItem({ id: 'q3', submissionVersionId: 'sub-3' }),
    ];
    mockQueueForPreview(scopeItems);

    const preview = await service.createPreview('event-1', {
      mode: 'pure_random',
      reviewerPoolUserIds: ['reviewer-b', 'reviewer-a'],
      includeStepIds: ['step-1'],
      excludeStepIds: [],
      runPolicy: 'reassign_all',
      hybridTargets: [],
    } as any);

    const createArg = prisma.review_assignment_previews.create.mock.calls[0][0];
    const operations = createArg.data.snapshot_payload.operations as Array<{
      queueItemId: string;
      desiredAssignedReviewerId: string | null;
      desiredQueueMode: QueueMode;
    }>;
    const desiredByItemId = new Map(
      operations.map((operation) => [operation.queueItemId, operation]),
    );
    const sortedReviewers = ['reviewer-a', 'reviewer-b'];
    const seed = preview.previewId;

    expect(desiredByItemId.get('q1')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: deterministicReviewer(
        seed,
        'sub-1',
        sortedReviewers,
      ),
    });
    expect(desiredByItemId.get('q2')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: deterministicReviewer(
        seed,
        'sub-2',
        sortedReviewers,
      ),
    });
    expect(desiredByItemId.get('q3')).toMatchObject({
      desiredQueueMode: 'direct',
      desiredAssignedReviewerId: deterministicReviewer(
        seed,
        'sub-3',
        sortedReviewers,
      ),
    });

    const queueItemIds = operations.map((operation) => operation.queueItemId);
    expect(new Set(queueItemIds).size).toBe(queueItemIds.length);
  });

  it('supports runPolicy=unassigned_only and skips currently direct assignments', async () => {
    const scopeItems = [
      buildScopeItem({
        id: 'q-direct',
        submissionVersionId: 'sub-1',
        queueMode: 'direct',
        assignedReviewerId: 'reviewer-x',
      }),
      buildScopeItem({
        id: 'q-shared',
        submissionVersionId: 'sub-2',
        queueMode: 'shared',
        assignedReviewerId: null,
      }),
    ];
    mockQueueForPreview(scopeItems);

    const preview = await service.createPreview('event-1', {
      mode: 'equal_distribution',
      reviewerPoolUserIds: ['reviewer-b', 'reviewer-a'],
      includeStepIds: ['step-1'],
      excludeStepIds: [],
      runPolicy: 'unassigned_only',
      hybridTargets: [],
    } as any);

    expect(preview.totalCandidates).toBe(1);
    expect(preview.operationCount).toBe(1);

    const createArg = prisma.review_assignment_previews.create.mock.calls[0][0];
    const operations = createArg.data.snapshot_payload.operations as Array<{
      queueItemId: string;
    }>;
    expect(operations).toHaveLength(1);
    expect(operations[0].queueItemId).toBe('q-shared');
  });

  it('releases expired direct assignments to shared queue', async () => {
    prisma.review_queue_items.updateMany.mockResolvedValueOnce({ count: 4 });

    const result = await service.releaseExpiredDirectAssignments('event-1');

    expect(result).toEqual({ released: 4 });
    expect(prisma.review_queue_items.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event_id: 'event-1',
          queue_mode: 'direct',
          completed_at: null,
        }),
        data: expect.objectContaining({
          queue_mode: 'shared',
          assigned_reviewer_id: null,
        }),
      }),
    );
  });

  it('returns PREVIEW_STALE when queue state changed since preview', async () => {
    prisma.review_assignment_runs.findFirst.mockResolvedValue(null);
    prisma.review_assignment_previews.findFirst.mockResolvedValue({
      id: 'preview-1',
      event_id: 'event-1',
      created_by: 'actor-1',
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
      applied_at: null,
      snapshot_payload: {
        seed: 'preview-1',
        stepIds: ['step-1'],
        operations: [
          {
            queueItemId: 'q-1',
            expectedUpdatedAt: '2026-04-02T10:00:00.000Z',
            expectedQueueMode: 'shared',
            expectedAssignedReviewerId: null,
            expectedAssignmentExpiresAt: null,
            desiredQueueMode: 'direct',
            desiredAssignedReviewerId: 'reviewer-a',
            desiredAssignmentExpiresAt: '2026-04-02T12:00:00.000Z',
          },
        ],
      },
    });
    prisma.review_queue_items.findMany.mockResolvedValue([
      {
        id: 'q-1',
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        updated_at: new Date('2026-04-02T10:01:00.000Z'),
      },
    ]);

    let error: any;
    try {
      await service.applyPreview('event-1', {
        previewId: 'preview-1',
        idempotencyKey: 'idem-1',
      } as any);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'PREVIEW_STALE',
    });
  });

  it('is idempotent for repeated apply calls with same idempotency key', async () => {
    const applyResult = {
      previewId: 'preview-1',
      appliedAt: new Date('2026-04-02T10:30:00.000Z'),
      updatedItems: 1,
      sharedQueueAfter: 2,
    };

    prisma.review_assignment_runs.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        result_payload: applyResult,
      });

    prisma.review_assignment_previews.findFirst.mockResolvedValue({
      id: 'preview-1',
      event_id: 'event-1',
      created_by: 'actor-1',
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
      applied_at: null,
      snapshot_payload: {
        seed: 'preview-1',
        stepIds: ['step-1'],
        operations: [
          {
            queueItemId: 'q-1',
            expectedUpdatedAt: '2026-04-02T10:00:00.000Z',
            expectedQueueMode: 'shared',
            expectedAssignedReviewerId: null,
            expectedAssignmentExpiresAt: null,
            desiredQueueMode: 'direct',
            desiredAssignedReviewerId: 'reviewer-a',
            desiredAssignmentExpiresAt: '2026-04-02T12:00:00.000Z',
          },
        ],
      },
    });

    prisma.review_queue_items.findMany.mockResolvedValue([
      {
        id: 'q-1',
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        updated_at: new Date('2026-04-02T10:00:00.000Z'),
      },
    ]);

    const tx = {
      review_queue_items: {
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(2),
      },
      review_assignment_previews: {
        update: jest.fn().mockResolvedValue({}),
      },
      review_assignment_runs: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    const first = await service.applyPreview('event-1', {
      previewId: 'preview-1',
      idempotencyKey: 'idem-1',
    } as any);
    const second = await service.applyPreview('event-1', {
      previewId: 'preview-1',
      idempotencyKey: 'idem-1',
    } as any);

    expect(first.previewId).toBe('preview-1');
    expect(second).toEqual(applyResult);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('claims a shared queue item for the current reviewer', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst.mockResolvedValueOnce({
      id: 'q-1',
      queue_mode: 'shared',
      assigned_reviewer_id: null,
      assignment_expires_at: null,
      completed_at: null,
    });
    prisma.review_queue_items.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.claimQueueItem('event-1', 'q-1');

    expect(result).toMatchObject({
      queueItemId: 'q-1',
      queueMode: 'direct',
      assignedReviewerId: 'reviewer-a',
    });
    expect(prisma.review_queue_items.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'q-1',
          event_id: 'event-1',
          queue_mode: 'shared',
          completed_at: null,
        }),
        data: expect.objectContaining({
          queue_mode: 'direct',
          assigned_reviewer_id: 'reviewer-a',
        }),
      }),
    );
  });

  it('claim is idempotent when queue item is already assigned to caller', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst.mockResolvedValueOnce({
      id: 'q-1',
      queue_mode: 'direct',
      assigned_reviewer_id: 'reviewer-a',
      assignment_expires_at: new Date('2026-04-02T12:00:00.000Z'),
      completed_at: null,
    });

    const result = await service.claimQueueItem('event-1', 'q-1');

    expect(result).toMatchObject({
      queueItemId: 'q-1',
      queueMode: 'direct',
      assignedReviewerId: 'reviewer-a',
    });
    expect(prisma.review_queue_items.updateMany).not.toHaveBeenCalled();
  });

  it('claim fails when queue item is already assigned to another reviewer', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst.mockResolvedValueOnce({
      id: 'q-1',
      queue_mode: 'direct',
      assigned_reviewer_id: 'reviewer-b',
      assignment_expires_at: new Date('2026-04-02T12:00:00.000Z'),
      completed_at: null,
    });

    let error: any;
    try {
      await service.claimQueueItem('event-1', 'q-1');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'QUEUE_ITEM_ALREADY_CLAIMED',
    });
  });

  it('retries claim when item is still shared after a contention miss', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst
      .mockResolvedValueOnce({
        id: 'q-1',
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        completed_at: null,
      })
      .mockResolvedValueOnce({
        id: 'q-1',
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        completed_at: null,
      });
    prisma.review_queue_items.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.claimQueueItem('event-1', 'q-1');

    expect(result).toMatchObject({
      queueItemId: 'q-1',
      queueMode: 'direct',
      assignedReviewerId: 'reviewer-a',
    });
    expect(prisma.review_queue_items.updateMany).toHaveBeenCalledTimes(2);
  });

  it('claim returns QUEUE_ITEM_NOT_AVAILABLE when concurrent updates keep item shared', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst
      .mockResolvedValueOnce({
        id: 'q-1',
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        completed_at: null,
      })
      .mockResolvedValueOnce({
        id: 'q-1',
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        completed_at: null,
      })
      .mockResolvedValueOnce({
        id: 'q-1',
        queue_mode: 'shared',
        assigned_reviewer_id: null,
        assignment_expires_at: null,
        completed_at: null,
      });
    prisma.review_queue_items.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    let error: any;
    try {
      await service.claimQueueItem('event-1', 'q-1');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'QUEUE_ITEM_NOT_AVAILABLE',
    });
  });

  it('releases a direct queue item when assigned to caller', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst.mockResolvedValueOnce({
      id: 'q-1',
      queue_mode: 'direct',
      assigned_reviewer_id: 'reviewer-a',
      completed_at: null,
    });
    prisma.review_queue_items.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.releaseQueueItem('event-1', 'q-1');

    expect(result).toEqual({
      queueItemId: 'q-1',
      queueMode: 'shared',
      assignedReviewerId: null,
      assignmentExpiresAt: null,
    });
    expect(prisma.review_queue_items.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'q-1',
          queue_mode: 'direct',
          assigned_reviewer_id: 'reviewer-a',
        }),
        data: expect.objectContaining({
          queue_mode: 'shared',
          assigned_reviewer_id: null,
        }),
      }),
    );
  });

  it('release fails when queue item is assigned to another reviewer', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst.mockResolvedValueOnce({
      id: 'q-1',
      queue_mode: 'direct',
      assigned_reviewer_id: 'reviewer-b',
      completed_at: null,
    });

    let error: any;
    try {
      await service.releaseQueueItem('event-1', 'q-1');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(error.getResponse()).toMatchObject({
      code: 'QUEUE_ITEM_NOT_ASSIGNED_TO_YOU',
    });
  });

  it('requires claim before non-organizer review submission on shared items', async () => {
    cls = buildCls({
      actorId: 'reviewer-a',
      permissions: ['event.step.review'],
    });
    service = new ReviewerAssignmentService(prisma as any, cls as any);
    jest
      .spyOn(service, 'syncOpenQueueItemsForEvent')
      .mockResolvedValue({ created: 0, completed: 0 });
    jest
      .spyOn(service, 'releaseExpiredDirectAssignments')
      .mockResolvedValue({ released: 0 });

    prisma.review_queue_items.findFirst.mockResolvedValueOnce({
      queue_mode: 'shared',
      assigned_reviewer_id: null,
      completed_at: null,
    });

    let error: any;
    try {
      await service.assertQueueAccessForReview(
        'event-1',
        'submission-1',
        'reviewer-a',
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'CLAIM_REQUIRED',
    });
  });
});
