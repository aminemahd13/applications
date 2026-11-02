import { BadRequestException } from '@nestjs/common';

/**
 * The deadline for a revision request (reviewer "Request revision" or the staff
 * bulk action). A requested deadline may only shorten the step's configured
 * revision deadline; without one, the step's deadline applies.
 */
export function resolveEffectiveRevisionDeadline(
  stepRevisionDeadlineAt: Date | null | undefined,
  requestedDeadlineAt?: Date,
): Date | null {
  if (!requestedDeadlineAt) {
    return stepRevisionDeadlineAt ?? null;
  }

  if (
    stepRevisionDeadlineAt &&
    new Date(requestedDeadlineAt).getTime() >
      new Date(stepRevisionDeadlineAt).getTime()
  ) {
    throw new BadRequestException(
      'Review deadline can only shorten the configured revision deadline for this step',
    );
  }

  return requestedDeadlineAt;
}
