import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  groupPatchOpsByVersionId,
  resolveEffectiveAnswers,
} from '../common/utils/effective-answers.util';

/**
 * Loads the *effective* answers for submitted form steps — i.e. the submission
 * snapshot with active admin change-patches applied (shared
 * `resolveEffectiveAnswers` util: replace/add/remove, JSON-pointer decoding) —
 * so messaging audience filtering and conditional step deadlines read the same
 * values staff see on the applications page and in the review queue.
 */
@Injectable()
export class EffectiveAnswersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Effective answers for a set of applications, limited to the given steps.
   * Returns applicationId -> (stepId -> answers).
   */
  async getEffectiveAnswersForApplications(
    applicationIds: string[],
    stepIds: string[],
  ): Promise<Map<string, Map<string, Record<string, any>>>> {
    const result = new Map<string, Map<string, Record<string, any>>>();
    if (applicationIds.length === 0 || stepIds.length === 0) return result;

    const states = await this.prisma.application_step_states.findMany({
      where: {
        application_id: { in: applicationIds },
        step_id: { in: stepIds },
        latest_submission_version_id: { not: null },
      },
      select: {
        application_id: true,
        step_id: true,
        latest_submission_version_id: true,
      },
    });

    const versionIds = Array.from(
      new Set(
        states
          .map((s) => s.latest_submission_version_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const answersByVersion =
      await this.getEffectiveAnswersBySubmissionVersionIds(versionIds);

    for (const state of states) {
      const versionId = state.latest_submission_version_id;
      if (!versionId) continue;
      const answers = answersByVersion.get(versionId);
      if (!answers) continue;
      let byStep = result.get(state.application_id);
      if (!byStep) {
        byStep = new Map();
        result.set(state.application_id, byStep);
      }
      byStep.set(state.step_id, answers);
    }

    return result;
  }

  async getEffectiveAnswersBySubmissionVersionIds(
    submissionVersionIds: string[],
  ): Promise<Map<string, Record<string, any>>> {
    if (submissionVersionIds.length === 0) return new Map();

    const [submissions, patches] = await this.prisma.$transaction([
      this.prisma.step_submission_versions.findMany({
        where: { id: { in: submissionVersionIds } },
        select: { id: true, answers_snapshot: true },
      }),
      this.prisma.admin_change_patches.findMany({
        where: {
          submission_version_id: { in: submissionVersionIds },
          is_active: true,
        },
        select: { submission_version_id: true, ops: true },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    const patchOpsByVersionId = groupPatchOpsByVersionId(patches);

    const effectiveByVersionId = new Map<string, Record<string, any>>();
    for (const submission of submissions) {
      effectiveByVersionId.set(
        submission.id,
        resolveEffectiveAnswers(
          submission.answers_snapshot,
          patchOpsByVersionId.get(submission.id),
        ).answers,
      );
    }

    return effectiveByVersionId;
  }
}
