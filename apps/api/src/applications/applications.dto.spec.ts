import {
  ApplicationsQueryRequestSchema,
  ApplicationsAssignedReviewerConditionSchema,
} from '@event-platform/shared';

describe('ApplicationsQueryRequestSchema validation', () => {
  it('rejects filter trees deeper than 3 levels', () => {
    const payload = {
      limit: 10,
      order: 'desc',
      filterTree: {
        type: 'group',
        mode: 'all',
        children: [
          {
            type: 'group',
            mode: 'all',
            children: [
              {
                type: 'group',
                mode: 'all',
                children: [
                  {
                    type: 'group',
                    mode: 'all',
                    children: [{ type: 'search_text', value: 'ada' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = ApplicationsQueryRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('depth'))).toBe(
      true,
    );
  });

  it('rejects more than 40 conditions', () => {
    const payload = {
      limit: 10,
      order: 'desc',
      filterTree: {
        type: 'group',
        mode: 'all',
        children: Array.from({ length: 41 }, (_, index) => ({
          type: 'search_text',
          value: `query-${index + 1}`,
        })),
      },
    };

    const result = ApplicationsQueryRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((issue) =>
        issue.message.includes('more than 40 conditions'),
      ),
    ).toBe(true);
  });
});

describe('ApplicationsAssignedReviewerConditionSchema validation', () => {
  it('requires reviewerId when matcher is specific', () => {
    const result = ApplicationsAssignedReviewerConditionSchema.safeParse({
      type: 'assigned_reviewer',
      matcher: 'specific',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reviewerId when matcher is not specific', () => {
    const result = ApplicationsAssignedReviewerConditionSchema.safeParse({
      type: 'assigned_reviewer',
      matcher: 'any',
      reviewerId: '37a2125b-fdd0-42e2-a273-89d2f8010e4c',
    });
    expect(result.success).toBe(false);
  });
});
