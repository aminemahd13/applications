import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { ReviewsService } from './reviews.service';

describe('ReviewsService revision deadline resolution', () => {
  function createService() {
    return new ReviewsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('uses step revision deadline when reviewer deadline is missing', () => {
    const service = createService();
    const stepDeadline = new Date('2026-05-10T10:00:00.000Z');

    const resolved = (service as any).resolveEffectiveRevisionDeadline(
      stepDeadline,
      undefined,
    );

    expect(resolved).toEqual(stepDeadline);
  });

  it('allows reviewer deadline when no step revision deadline is configured', () => {
    const service = createService();
    const reviewerDeadline = new Date('2026-05-05T10:00:00.000Z');

    const resolved = (service as any).resolveEffectiveRevisionDeadline(
      null,
      reviewerDeadline,
    );

    expect(resolved).toEqual(reviewerDeadline);
  });

  it('throws when reviewer deadline extends configured step revision deadline', () => {
    const service = createService();
    const stepDeadline = new Date('2026-05-10T10:00:00.000Z');
    const reviewerDeadline = new Date('2026-05-11T10:00:00.000Z');

    expect(() =>
      (service as any).resolveEffectiveRevisionDeadline(
        stepDeadline,
        reviewerDeadline,
      ),
    ).toThrow(BadRequestException);
  });

  it('uses reviewer deadline when it shortens configured step revision deadline', () => {
    const service = createService();
    const stepDeadline = new Date('2026-05-10T10:00:00.000Z');
    const reviewerDeadline = new Date('2026-05-08T10:00:00.000Z');

    const resolved = (service as any).resolveEffectiveRevisionDeadline(
      stepDeadline,
      reviewerDeadline,
    );

    expect(resolved).toEqual(reviewerDeadline);
  });
});
