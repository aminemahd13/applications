import { Injectable } from '@nestjs/common';
import {
  ApplicantDeadlineContext,
  DeadlineRule,
  resolveStepDeadline,
} from '@event-platform/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { EffectiveAnswersService } from '../messages/effective-answers.service';

interface StepStateLike {
  step_id: string;
  latest_submission_version_id: string | null;
}

/**
 * Resolves the *effective* deadline of a workflow step for a specific applicant.
 *
 * A step's `deadline_rules` (ordered, first-match-wins) can override its base
 * `deadline_at` based on the applicant's profile or an answer they gave in an
 * earlier step. The condition is evaluated against the applicant's profile and
 * their **submitted** (effective) answers — drafts never trigger a rule — so the
 * value is identical at every surface (submission gate, applicant/staff detail,
 * dashboard). When a step has no rules this is a no-op returning the base date.
 */
@Injectable()
export class StepDeadlineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveAnswers: EffectiveAnswersService,
  ) {}

  /**
   * Build the condition-evaluation context for ONE application: the applicant's
   * profile fields plus their effective (submitted) answers keyed by step id.
   * Steps the applicant hasn't submitted yet are simply absent.
   */
  async buildContext(
    applicantUserId: string | null | undefined,
    stepStates: StepStateLike[],
  ): Promise<ApplicantDeadlineContext> {
    const [profileRow, answersByStep] = await Promise.all([
      applicantUserId
        ? this.prisma.applicant_profiles.findUnique({
            where: { user_id: applicantUserId },
            select: {
              education_level: true,
              country: true,
              city: true,
              institution: true,
            },
          })
        : Promise.resolve(null),
      this.loadAnswersByStep(stepStates),
    ]);

    return {
      profile: {
        education_level: profileRow?.education_level ?? null,
        country: profileRow?.country ?? null,
        city: profileRow?.city ?? null,
        institution: profileRow?.institution ?? null,
      },
      answersByStep,
    };
  }

  private async loadAnswersByStep(
    stepStates: StepStateLike[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const versionIdByStep = new Map<string, string>();
    for (const s of stepStates) {
      if (s.latest_submission_version_id) {
        versionIdByStep.set(s.step_id, s.latest_submission_version_id);
      }
    }

    const answersByStep = new Map<string, Record<string, unknown>>();
    if (versionIdByStep.size === 0) return answersByStep;

    const answersByVersion =
      await this.effectiveAnswers.getEffectiveAnswersBySubmissionVersionIds(
        Array.from(new Set(versionIdByStep.values())),
      );
    for (const [stepId, versionId] of versionIdByStep) {
      const answers = answersByVersion.get(versionId);
      if (answers) answersByStep.set(stepId, answers);
    }
    return answersByStep;
  }

  /** Pure resolver: first matching rule's deadline, else the base deadline. */
  resolve(
    rules: DeadlineRule[] | null | undefined,
    baseDeadline: Date | string | null | undefined,
    ctx: ApplicantDeadlineContext,
  ): Date | null {
    return resolveStepDeadline(rules, baseDeadline, ctx);
  }

  /** True when a step actually carries conditional rules worth resolving. */
  hasRules(rules: unknown): rules is DeadlineRule[] {
    return Array.isArray(rules) && rules.length > 0;
  }
}
