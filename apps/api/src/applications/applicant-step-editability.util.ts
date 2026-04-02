import { StepModificationScope, StepStatus } from '@event-platform/shared';

export function normalizeStepModificationScope(
  scope: string | null | undefined,
): StepModificationScope {
  return scope === StepModificationScope.SUBMITTED_OR_APPROVED
    ? StepModificationScope.SUBMITTED_OR_APPROVED
    : StepModificationScope.SUBMITTED_ONLY;
}

export function canApplicantEditStep(
  status: string | null | undefined,
  allowApplicantModification: boolean | null | undefined,
  modificationScope: string | null | undefined,
): boolean {
  const normalizedStatus = String(status ?? '').toUpperCase();
  const normalizedScope = normalizeStepModificationScope(modificationScope);
  const allow = Boolean(allowApplicantModification);

  if (
    normalizedStatus === StepStatus.UNLOCKED ||
    normalizedStatus === StepStatus.NEEDS_REVISION ||
    normalizedStatus === 'UNLOCKED_DRAFT' ||
    normalizedStatus === 'READY_TO_SUBMIT'
  ) {
    return true;
  }

  if (normalizedStatus === StepStatus.SUBMITTED) {
    return allow;
  }

  if (normalizedStatus === StepStatus.APPROVED) {
    return allow && normalizedScope === StepModificationScope.SUBMITTED_OR_APPROVED;
  }

  return false;
}
