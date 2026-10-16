import { EffectiveAnswersService } from './effective-answers.service';

describe('EffectiveAnswersService', () => {
  function createService(params: {
    states?: Array<{
      application_id: string;
      step_id: string;
      latest_submission_version_id: string | null;
    }>;
    submissions?: Array<{ id: string; answers_snapshot: unknown }>;
    patches?: Array<{ submission_version_id: string; ops: unknown }>;
  }) {
    const prisma = {
      application_step_states: {
        findMany: jest.fn().mockResolvedValue(params.states ?? []),
      },
      step_submission_versions: {
        findMany: jest.fn().mockResolvedValue(params.submissions ?? []),
      },
      admin_change_patches: {
        findMany: jest.fn().mockResolvedValue(params.patches ?? []),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    return { service: new EffectiveAnswersService(prisma as any), prisma };
  }

  describe('getEffectiveAnswersBySubmissionVersionIds', () => {
    it('returns an empty map without querying for no ids', async () => {
      const { service, prisma } = createService({});

      await expect(
        service.getEffectiveAnswersBySubmissionVersionIds([]),
      ).resolves.toEqual(new Map());
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('normalizes snapshots and applies replace/add/remove/escaped patches in order', async () => {
      const { service, prisma } = createService({
        submissions: [
          {
            id: 'v1',
            answers_snapshot: {
              data: { city: 'Rabat', school: 'Lycee', 'a/b': 'old' },
            },
          },
          { id: 'v2', answers_snapshot: { city: 'Fes' } },
        ],
        patches: [
          {
            submission_version_id: 'v1',
            ops: [{ op: 'replace', path: '/city', value: 'Casablanca' }],
          },
          {
            submission_version_id: 'v1',
            ops: [
              { op: 'add', path: '/track', value: 'olympiad' },
              { op: 'remove', path: '/school' },
              { op: 'replace', path: '/a~1b', value: 'new' },
              { op: 'replace', path: '/city', value: 'Tangier' },
            ],
          },
        ],
      });

      const result = await service.getEffectiveAnswersBySubmissionVersionIds([
        'v1',
        'v2',
      ]);

      expect(result.get('v1')).toEqual({
        city: 'Tangier',
        track: 'olympiad',
        'a/b': 'new',
      });
      expect(result.get('v2')).toEqual({ city: 'Fes' });
      expect(prisma.admin_change_patches.findMany).toHaveBeenCalledWith({
        where: { submission_version_id: { in: ['v1', 'v2'] }, is_active: true },
        select: { submission_version_id: true, ops: true },
        orderBy: { created_at: 'asc' },
      });
    });
  });

  describe('getEffectiveAnswersForApplications', () => {
    it('returns an empty map without querying when there is nothing to load', async () => {
      const { service, prisma } = createService({});

      await expect(
        service.getEffectiveAnswersForApplications([], ['step-1']),
      ).resolves.toEqual(new Map());
      await expect(
        service.getEffectiveAnswersForApplications(['app-1'], []),
      ).resolves.toEqual(new Map());
      expect(prisma.application_step_states.findMany).not.toHaveBeenCalled();
    });

    it('maps application -> step -> effective answers of the latest submission', async () => {
      const { service, prisma } = createService({
        states: [
          {
            application_id: 'app-1',
            step_id: 'step-1',
            latest_submission_version_id: 'v1',
          },
          {
            application_id: 'app-2',
            step_id: 'step-1',
            latest_submission_version_id: 'v-missing',
          },
        ],
        submissions: [{ id: 'v1', answers_snapshot: { level: 'senior' } }],
        patches: [
          {
            submission_version_id: 'v1',
            ops: [{ op: 'remove', path: '/level' }],
          },
        ],
      });

      const result = await service.getEffectiveAnswersForApplications(
        ['app-1', 'app-2'],
        ['step-1'],
      );

      expect(Array.from(result.keys())).toEqual(['app-1']);
      expect(result.get('app-1')?.get('step-1')).toEqual({});
      expect(prisma.application_step_states.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            application_id: { in: ['app-1', 'app-2'] },
            step_id: { in: ['step-1'] },
            latest_submission_version_id: { not: null },
          },
        }),
      );
    });
  });
});
