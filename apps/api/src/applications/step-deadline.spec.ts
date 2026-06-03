import {
  evaluateApplicantCondition,
  resolveStepDeadline,
  type ApplicantConditionGroup,
  type ApplicantDeadlineContext,
  type DeadlineRule,
} from '@event-platform/shared';

function ctx(
  profile: ApplicantDeadlineContext['profile'],
  answers: Record<string, Record<string, unknown>> = {},
): ApplicantDeadlineContext {
  return {
    profile,
    answersByStep: new Map(Object.entries(answers)),
  };
}

const LATER = new Date('2026-09-01T00:00:00.000Z');
const BASE = new Date('2026-06-01T00:00:00.000Z');

describe('evaluateApplicantCondition', () => {
  it('matches a profile leaf (education_level any-of)', () => {
    const tree: ApplicantConditionGroup = {
      type: 'group',
      mode: 'all',
      children: [
        {
          kind:'profile',
          field: 'education_level',
          matcher: 'any',
          values: ['Undergraduate', 'Graduate'],
        } as any,
      ],
    };
    expect(
      evaluateApplicantCondition(tree, ctx({ education_level: 'Undergraduate' })),
    ).toBe(true);
    expect(
      evaluateApplicantCondition(tree, ctx({ education_level: 'PhD' })),
    ).toBe(false);
  });

  it('matches a free-text profile leaf (institution contains)', () => {
    const tree: ApplicantConditionGroup = {
      type: 'group',
      mode: 'all',
      children: [
        {
          kind:'profile',
          field: 'institution',
          matcher: 'contains',
          values: ['polytech'],
        } as any,
      ],
    };
    expect(
      evaluateApplicantCondition(
        tree,
        ctx({ institution: 'Mohammed VI Polytechnic' }),
      ),
    ).toBe(true);
    expect(
      evaluateApplicantCondition(tree, ctx({ institution: 'Other Univ' })),
    ).toBe(false);
  });

  it('matches a field_answer leaf, and is false until the step is submitted', () => {
    const tree: ApplicantConditionGroup = {
      type: 'group',
      mode: 'all',
      children: [
        {
          kind:'field_answer',
          stepId: 'step-1',
          fieldKey: 'track',
          matcher: 'any',
          values: ['advanced'],
        } as any,
      ],
    };
    // submitted with matching answer
    expect(
      evaluateApplicantCondition(
        tree,
        ctx({}, { 'step-1': { track: 'advanced' } }),
      ),
    ).toBe(true);
    // submitted with a different answer
    expect(
      evaluateApplicantCondition(
        tree,
        ctx({}, { 'step-1': { track: 'beginner' } }),
      ),
    ).toBe(false);
    // not submitted yet -> no answer present -> false
    expect(evaluateApplicantCondition(tree, ctx({}))).toBe(false);
  });

  it('combines children with AND (all) and OR (any)', () => {
    const leafEdu = {
      kind:'profile',
      field: 'education_level',
      matcher: 'any',
      values: ['Undergraduate'],
    };
    const leafCountry = {
      kind:'profile',
      field: 'country',
      matcher: 'equals',
      values: ['Morocco'],
    };
    const all: ApplicantConditionGroup = {
      type: 'group',
      mode: 'all',
      children: [leafEdu as any, leafCountry as any],
    };
    const any: ApplicantConditionGroup = {
      type: 'group',
      mode: 'any',
      children: [leafEdu as any, leafCountry as any],
    };

    const onlyEdu = ctx({ education_level: 'Undergraduate', country: 'France' });
    expect(evaluateApplicantCondition(all, onlyEdu)).toBe(false);
    expect(evaluateApplicantCondition(any, onlyEdu)).toBe(true);
  });

  it('honors negate (NOT)', () => {
    const tree: ApplicantConditionGroup = {
      type: 'group',
      mode: 'all',
      negate: true,
      children: [
        {
          kind:'profile',
          field: 'education_level',
          matcher: 'any',
          values: ['PhD'],
        } as any,
      ],
    };
    expect(
      evaluateApplicantCondition(tree, ctx({ education_level: 'PhD' })),
    ).toBe(false);
    expect(
      evaluateApplicantCondition(tree, ctx({ education_level: 'Undergraduate' })),
    ).toBe(true);
  });
});

describe('resolveStepDeadline', () => {
  const undergradRule: DeadlineRule = {
    condition: {
      type: 'group',
      mode: 'all',
      children: [
        {
          kind:'profile',
          field: 'education_level',
          matcher: 'any',
          values: ['Undergraduate'],
        },
      ],
    } as any,
    deadlineAt: LATER,
  };

  it('returns the base deadline when there are no rules', () => {
    expect(
      resolveStepDeadline([], BASE, ctx({ education_level: 'Undergraduate' })),
    ).toEqual(BASE);
    expect(
      resolveStepDeadline(undefined, BASE, ctx({})),
    ).toEqual(BASE);
  });

  it('returns the first matching rule deadline (first-match-wins)', () => {
    const result = resolveStepDeadline(
      [undergradRule],
      BASE,
      ctx({ education_level: 'Undergraduate' }),
    );
    expect(result).toEqual(LATER);
  });

  it('falls back to the base deadline when no rule matches', () => {
    const result = resolveStepDeadline(
      [undergradRule],
      BASE,
      ctx({ education_level: 'PhD' }),
    );
    expect(result).toEqual(BASE);
  });

  it('skips rules whose condition has no criteria (incomplete)', () => {
    const emptyRule: DeadlineRule = {
      condition: { type: 'group', mode: 'all', children: [] } as any,
      deadlineAt: LATER,
    };
    const result = resolveStepDeadline(
      [emptyRule],
      BASE,
      ctx({ education_level: 'Undergraduate' }),
    );
    expect(result).toEqual(BASE);
  });

  it('normalizes string/Date inputs to a Date', () => {
    const result = resolveStepDeadline(
      [{ ...undergradRule, deadlineAt: LATER.toISOString() as any }],
      BASE.toISOString(),
      ctx({ education_level: 'Undergraduate' }),
    );
    expect(result).toEqual(LATER);
  });

  it('returns null when base is null and no rule matches', () => {
    expect(resolveStepDeadline([undergradRule], null, ctx({}))).toBeNull();
  });
});
