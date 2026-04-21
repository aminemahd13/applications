import { Permission } from '@event-platform/shared';
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
