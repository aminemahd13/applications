import { Permission } from '@event-platform/shared';
import { ZodError } from 'zod';
import { PERMISSIONS_KEY } from '../common/decorators/require-permission.decorator';
import { ReviewsController } from './reviews.controller';

describe('ReviewsController reviewer-assignment endpoints', () => {
  it('requires event.step.review permission for claim/release queue routes', () => {
    const getMetadata = Reflect.getMetadata.bind(Reflect);

    const claimPermissions = getMetadata(
      PERMISSIONS_KEY,
      ReviewsController.prototype.claimReviewQueueItem,
    );
    const releasePermissions = getMetadata(
      PERMISSIONS_KEY,
      ReviewsController.prototype.releaseReviewQueueItem,
    );

    expect(claimPermissions).toEqual([Permission.EVENT_STEP_REVIEW]);
    expect(releasePermissions).toEqual([Permission.EVENT_STEP_REVIEW]);
  });

  it('requires event.update permission for reviewer-assignment routes', () => {
    const getMetadata = Reflect.getMetadata.bind(Reflect);

    const contextPermissions = getMetadata(
      PERMISSIONS_KEY,
      ReviewsController.prototype.getReviewerAssignmentContext,
    );
    const previewPermissions = getMetadata(
      PERMISSIONS_KEY,
      ReviewsController.prototype.previewReviewerAssignment,
    );
    const applyPermissions = getMetadata(
      PERMISSIONS_KEY,
      ReviewsController.prototype.applyReviewerAssignment,
    );
    const overridePermissions = getMetadata(
      PERMISSIONS_KEY,
      ReviewsController.prototype.overrideReviewerQueueItem,
    );
    const releasePermissions = getMetadata(
      PERMISSIONS_KEY,
      ReviewsController.prototype.releaseExpiredReviewerAssignments,
    );

    expect(contextPermissions).toEqual([Permission.EVENT_UPDATE]);
    expect(previewPermissions).toEqual([Permission.EVENT_UPDATE]);
    expect(applyPermissions).toEqual([Permission.EVENT_UPDATE]);
    expect(overridePermissions).toEqual([Permission.EVENT_UPDATE]);
    expect(releasePermissions).toEqual([Permission.EVENT_UPDATE]);
  });

  it('delegates reviewer-assignment actions to service', async () => {
    const assignmentService = {
      getContext: jest.fn().mockResolvedValue({ steps: [], reviewers: [] }),
      createPreview: jest.fn().mockResolvedValue({ previewId: 'preview-1' }),
      applyPreview: jest.fn().mockResolvedValue({ previewId: 'preview-1' }),
      overrideQueueItem: jest.fn().mockResolvedValue({ queueItemId: 'q-1' }),
      claimQueueItem: jest.fn().mockResolvedValue({ queueItemId: 'q-2' }),
      releaseQueueItem: jest.fn().mockResolvedValue({ queueItemId: 'q-2' }),
      releaseExpiredDirectAssignments: jest.fn().mockResolvedValue({ released: 2 }),
    };

    const controller = new ReviewsController(
      {} as any,
      {} as any,
      assignmentService as any,
      {} as any,
      {} as any,
    );

    const context = await controller.getReviewerAssignmentContext('event-1');
    const preview = await controller.previewReviewerAssignment('event-1', {
      mode: 'equal_distribution',
      reviewerPoolUserIds: ['00000000-0000-0000-0000-000000000000'],
      includeStepIds: [],
      excludeStepIds: [],
      runPolicy: 'reassign_all',
    });
    const apply = await controller.applyReviewerAssignment('event-1', {
      previewId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      idempotencyKey: 'idem-1',
    });
    const claim = await controller.claimReviewQueueItem('event-1', 'q-2');
    const releaseClaim = await controller.releaseReviewQueueItem('event-1', 'q-2');
    const override = await controller.overrideReviewerQueueItem(
      'event-1',
      'q-1',
      { action: 'release_shared' },
    );
    const release = await controller.releaseExpiredReviewerAssignments('event-1');

    expect(assignmentService.getContext).toHaveBeenCalledWith('event-1');
    expect(assignmentService.createPreview).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        mode: 'equal_distribution',
      }),
    );
    expect(assignmentService.applyPreview).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        idempotencyKey: 'idem-1',
      }),
    );
    expect(assignmentService.claimQueueItem).toHaveBeenCalledWith(
      'event-1',
      'q-2',
    );
    expect(assignmentService.releaseQueueItem).toHaveBeenCalledWith(
      'event-1',
      'q-2',
    );
    expect(assignmentService.overrideQueueItem).toHaveBeenCalledWith(
      'event-1',
      'q-1',
      expect.objectContaining({ action: 'release_shared' }),
    );
    expect(
      assignmentService.releaseExpiredDirectAssignments,
    ).toHaveBeenCalledWith('event-1');

    expect(context).toEqual({ data: { steps: [], reviewers: [] } });
    expect(preview).toEqual({ data: { previewId: 'preview-1' } });
    expect(apply).toEqual({ data: { previewId: 'preview-1' } });
    expect(claim).toEqual({ data: { queueItemId: 'q-2' } });
    expect(releaseClaim).toEqual({ data: { queueItemId: 'q-2' } });
    expect(override).toEqual({ data: { queueItemId: 'q-1' } });
    expect(release).toEqual({ data: { released: 2 } });
  });
});

describe('ReviewsController review-queue item context endpoint', () => {
  const QUEUE_ITEM_ID = '9b2f6f4e-2f0c-4d8a-9b1e-3c4d5e6f7a8b';

  it('requires event.application.read_full permission (not read_basic)', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ReviewsController.prototype,
      'getReviewQueueItemContext',
    )?.value as object;
    const permissions: unknown = Reflect.getMetadata(PERMISSIONS_KEY, handler);

    expect(permissions).toEqual([Permission.EVENT_APPLICATION_READ_FULL]);
  });

  it('delegates to the queue service and wraps the result in { data }', async () => {
    const context = { queueItemId: QUEUE_ITEM_ID, steps: [], files: [] };
    const queueService = {
      getQueueItemContext: jest.fn().mockResolvedValue(context),
    };
    const controller = new ReviewsController(
      {} as any,
      queueService as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await controller.getReviewQueueItemContext(
      'event-1',
      QUEUE_ITEM_ID,
    );

    expect(queueService.getQueueItemContext).toHaveBeenCalledWith(
      'event-1',
      QUEUE_ITEM_ID,
    );
    expect(result).toEqual({ data: context });
  });

  it('rejects a non-uuid queue item id before calling the service', async () => {
    const queueService = { getQueueItemContext: jest.fn() };
    const controller = new ReviewsController(
      {} as any,
      queueService as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      controller.getReviewQueueItemContext('event-1', 'not-a-uuid'),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      controller.getReviewQueueItemContext('event-1', `${QUEUE_ITEM_ID}x`),
    ).rejects.toBeInstanceOf(ZodError);
    expect(queueService.getQueueItemContext).not.toHaveBeenCalled();
  });
});

describe('ReviewsController needs-info read permissions', () => {
  function permissionsOf(name: string): unknown {
    const handler = Object.getOwnPropertyDescriptor(
      ReviewsController.prototype,
      name,
    )?.value as object;
    return Reflect.getMetadata(PERMISSIONS_KEY, handler);
  }

  it('requires event.application.read_full or self application read (not read_basic)', () => {
    expect(permissionsOf('getNeedsInfo')).toEqual([
      Permission.EVENT_APPLICATION_READ_FULL,
      Permission.SELF_APPLICATION_READ,
    ]);
  });

  it('grants no route on read_basic alone (check-in staff)', () => {
    const readBasicHandlers = Object.getOwnPropertyNames(
      ReviewsController.prototype,
    ).filter((name) => {
      const permissions = permissionsOf(name);
      return (
        Array.isArray(permissions) &&
        permissions.includes(Permission.EVENT_APPLICATION_READ_BASIC)
      );
    });

    expect(readBasicHandlers).toEqual([]);
  });
});
