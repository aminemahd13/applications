import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Loads the *effective* answers for submitted form steps — i.e. the submission
 * snapshot with active admin change-patches applied. Mirrors the equivalent
 * logic in ApplicationsService so messaging audience filtering reads the same
 * values staff see on the applications page.
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

    const patchesByVersionId = new Map<string, Array<{ ops: any }>>();
    for (const patch of patches) {
      const list = patchesByVersionId.get(patch.submission_version_id) ?? [];
      list.push({ ops: patch.ops });
      patchesByVersionId.set(patch.submission_version_id, list);
    }

    const effectiveByVersionId = new Map<string, Record<string, any>>();
    for (const submission of submissions) {
      const baseAnswers = this.normalizeAnswersShape(
        submission.answers_snapshot as Record<string, any>,
      );
      const effectiveAnswers = this.applyPatches(
        baseAnswers,
        patchesByVersionId.get(submission.id) ?? [],
      );
      effectiveByVersionId.set(submission.id, effectiveAnswers);
    }

    return effectiveByVersionId;
  }

  private applyPatches(
    baseAnswers: Record<string, any>,
    patches: Array<{ ops: any }>,
  ): Record<string, any> {
    const effective = { ...this.normalizeAnswersShape(baseAnswers) };

    for (const patch of patches) {
      const ops = Array.isArray(patch.ops) ? patch.ops : [];
      for (const op of ops) {
        if (!op || op.op !== 'replace' || typeof op.path !== 'string') continue;
        const fieldPath = op.path.replace(/^\//, '');
        if (!fieldPath) continue;
        effective[fieldPath] = op.value;
      }
    }

    return this.normalizeAnswersShape(effective);
  }

  /** Unwrap legacy answer envelopes shaped as { data: {...} }. */
  private normalizeAnswersShape(
    answers: Record<string, any> | null | undefined,
  ): Record<string, any> {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return {};
    }
    const normalized = { ...answers };
    const nestedData = normalized.data;
    if (
      nestedData &&
      typeof nestedData === 'object' &&
      !Array.isArray(nestedData)
    ) {
      Object.assign(normalized, nestedData as Record<string, any>);
    }
    if (
      'data' in normalized &&
      Object.keys(normalized).some((key) => key !== 'data')
    ) {
      delete normalized.data;
    }
    return normalized;
  }
}
