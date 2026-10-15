import { NotFoundException } from '@nestjs/common';
import {
  DecisionStatus,
  MetricsFilterOperator,
  MetricsTimelineGranularity,
  StepStatus,
} from '@event-platform/shared';
import { EventMetricsService } from './event-metrics.service';

describe('EventMetricsService', () => {
  let service: EventMetricsService;
  let mockPrisma: any;

  const eventId = '11111111-1111-4111-8111-111111111111';
  const step1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const step2Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const workflowSteps = [
    {
      id: step1Id,
      title: 'Profile',
      step_index: 0,
      form_versions: {
        schema: {
          sections: [
            {
              id: 'sec-1',
              title: 'Main',
              fields: [
                {
                  id: 'age-id',
                  key: 'age',
                  type: 'number',
                  label: 'Age',
                },
                {
                  id: 'region-id',
                  key: 'region',
                  type: 'select',
                  label: 'Region',
                  ui: {
                    options: [
                      { value: 'north', label: 'North' },
                      { value: 'south', label: 'South' },
                    ],
                  },
                },
                {
                  id: 'interests-id',
                  key: 'interests',
                  type: 'multiselect',
                  label: 'Interests',
                  ui: {
                    options: [
                      { value: 'math', label: 'Math' },
                      { value: 'science', label: 'Science' },
                      { value: 'art', label: 'Art' },
                    ],
                  },
                },
                {
                  id: 'consent-id',
                  key: 'consent',
                  type: 'checkbox',
                  label: 'Consent',
                },
              ],
            },
          ],
        },
      },
    },
    {
      id: step2Id,
      title: 'Review',
      step_index: 1,
      form_versions: {
        schema: {
          sections: [
            {
              id: 'sec-2',
              title: 'Review',
              fields: [
                {
                  id: 'score-id',
                  key: 'score',
                  type: 'number',
                  label: 'Score',
                },
                {
                  id: 'notes-id',
                  key: 'notes',
                  type: 'text',
                  label: 'Notes',
                },
              ],
            },
          ],
        },
      },
    },
  ];

  const applications = [
    {
      id: 'app-1',
      decision_status: DecisionStatus.ACCEPTED,
      decision_published_at: new Date('2026-03-21T10:00:00.000Z'),
      created_at: new Date('2026-03-20T10:00:00.000Z'),
      tags: ['alpha'],
      attendance_records: {
        status: 'CHECKED_IN',
        confirmed_at: new Date('2026-03-21T11:00:00.000Z'),
        checked_in_at: new Date('2026-03-22T11:00:00.000Z'),
      },
      users_applications_applicant_user_idTousers: {
        applicant_profiles: {
          country: 'MA',
          city: 'Rabat',
          education_level: 'University',
          date_of_birth: new Date('2005-01-01'),
        },
      },
      application_step_states: [
        {
          step_id: step1Id,
          status: StepStatus.APPROVED,
          latest_submission_version_id: 'v1',
          workflow_steps: { title: 'Profile', step_index: 0 },
        },
        {
          step_id: step2Id,
          status: StepStatus.SUBMITTED,
          latest_submission_version_id: 'v2',
          workflow_steps: { title: 'Review', step_index: 1 },
        },
      ],
    },
    {
      id: 'app-2',
      decision_status: DecisionStatus.NONE,
      decision_published_at: null,
      created_at: new Date('2026-03-10T09:00:00.000Z'),
      tags: ['beta'],
      attendance_records: null,
      users_applications_applicant_user_idTousers: {
        applicant_profiles: {
          country: 'FR',
          city: 'Paris',
          education_level: 'High school',
          date_of_birth: new Date('2010-06-15'),
        },
      },
      application_step_states: [
        {
          step_id: step1Id,
          status: StepStatus.NEEDS_REVISION,
          latest_submission_version_id: 'v3',
          workflow_steps: { title: 'Profile', step_index: 0 },
        },
        {
          step_id: step2Id,
          status: StepStatus.LOCKED,
          latest_submission_version_id: null,
          workflow_steps: { title: 'Review', step_index: 1 },
        },
      ],
    },
    {
      id: 'app-3',
      decision_status: DecisionStatus.REJECTED,
      decision_published_at: new Date('2026-03-01T14:00:00.000Z'),
      created_at: new Date('2026-02-05T14:00:00.000Z'),
      tags: ['alpha', 'vip'],
      attendance_records: {
        status: 'CONFIRMED',
        confirmed_at: new Date('2026-03-03T08:00:00.000Z'),
        checked_in_at: null,
      },
      users_applications_applicant_user_idTousers: {
        applicant_profiles: {
          country: 'MA',
          city: 'Casablanca',
          education_level: 'University',
          date_of_birth: new Date('1990-03-10'),
        },
      },
      application_step_states: [
        {
          step_id: step1Id,
          status: StepStatus.REJECTED_FINAL,
          latest_submission_version_id: 'v4',
          workflow_steps: { title: 'Profile', step_index: 0 },
        },
        {
          step_id: step2Id,
          status: StepStatus.LOCKED,
          latest_submission_version_id: null,
          workflow_steps: { title: 'Review', step_index: 1 },
        },
      ],
    },
  ];

  const submissionSnapshots = [
    {
      id: 'v1',
      answers_snapshot: {
        age: 21,
        region: 'north',
        interests: ['math', 'science'],
        consent: true,
      },
    },
    {
      id: 'v2',
      answers_snapshot: {
        score: 88,
        notes: 'great',
      },
    },
    {
      id: 'v3',
      answers_snapshot: {
        age: 15,
        region: 'south',
        interests: ['art'],
        consent: false,
      },
    },
    {
      id: 'v4',
      answers_snapshot: {
        age: 35,
        region: 'north',
        interests: ['math', 'art'],
        consent: true,
      },
    },
  ];

  const submissionTimeline = [
    { submitted_at: new Date('2026-03-19T09:00:00.000Z') },
    { submitted_at: new Date('2026-03-12T09:00:00.000Z') },
    { submitted_at: new Date('2026-03-05T09:00:00.000Z') },
    { submitted_at: new Date('2026-02-20T09:00:00.000Z') },
    { submitted_at: new Date('2026-02-12T09:00:00.000Z') },
  ];

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-26T12:00:00.000Z'));

    mockPrisma = {
      events: {
        findUnique: jest.fn().mockResolvedValue({ id: eventId }),
      },
      workflow_steps: {
        findMany: jest.fn().mockResolvedValue(workflowSteps),
      },
      applications: {
        findMany: jest.fn().mockResolvedValue(applications),
      },
      step_submission_versions: {
        findMany: jest.fn((args: any) => {
          if (args?.where?.id?.in) {
            const ids = new Set(args.where.id.in as string[]);
            return Promise.resolve(
              submissionSnapshots.filter((submission) => ids.has(submission.id)),
            );
          }
          if (args?.where?.application_id?.in) {
            return Promise.resolve(submissionTimeline);
          }
          return Promise.resolve([]);
        }),
      },
      admin_change_patches: {
        findMany: jest.fn((args: any) => {
          const ids = new Set(args?.where?.submission_version_id?.in ?? []);
          if (!ids.has('v3')) return Promise.resolve([]);
          return Promise.resolve([
            {
              submission_version_id: 'v3',
              ops: [{ op: 'replace', path: '/region', value: 'north' }],
            },
          ]);
        }),
      },
    };

    service = new EventMetricsService(mockPrisma as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('throws NotFoundException when event does not exist', async () => {
    mockPrisma.events.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.query(eventId, {
        recipientFilter: {},
        responseFilters: [],
        timeline: {
          granularity: MetricsTimelineGranularity.WEEK,
          periods: 12,
        },
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds base filter parity conditions (decision/step/current-step/demographics/tags/checkin)', async () => {
    mockPrisma.applications.findMany.mockResolvedValueOnce([]);

    await service.query(eventId, {
      recipientFilter: {
        decisionStatus: [DecisionStatus.ACCEPTED],
        stepId: step1Id,
        stepStatus: [StepStatus.APPROVED],
        currentStepId: step2Id,
        needsInfoOpen: true,
        confirmed: true,
        checkedIn: true,
        tagsAny: ['alpha'],
        tagsAll: ['vip'],
        country: ['MA'],
        city: ['Rabat'],
        educationLevel: ['University'],
        ageMin: 18,
        ageMax: 30,
        applicationIds: ['00000000-0000-4000-8000-000000000001'],
        userIds: ['00000000-0000-4000-8000-000000000002'],
        emails: ['person@example.com'],
      },
      responseFilters: [],
      timeline: {
        granularity: MetricsTimelineGranularity.WEEK,
        periods: 12,
      },
    } as any);

    const where = mockPrisma.applications.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ event_id: eventId });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { decision_status: { in: [DecisionStatus.ACCEPTED] } },
        {
          application_step_states: {
            some: {
              step_id: step1Id,
              status: { in: [StepStatus.APPROVED] },
            },
          },
        },
        {
          application_step_states: {
            some: {
              step_id: step2Id,
              status: { notIn: [StepStatus.APPROVED, StepStatus.REJECTED_FINAL] },
            },
          },
        },
        { needs_info_requests: { some: { status: 'OPEN' } } },
        { tags: { hasSome: ['alpha'] } },
        { tags: { hasEvery: ['vip'] } },
      ]),
    );
  });

  it('supports exact, in, and range response filters on effective answers', async () => {
    const result = await service.query(eventId, {
      recipientFilter: {},
      responseFilters: [
        {
          stepId: step1Id,
          fieldKey: 'region',
          operator: MetricsFilterOperator.EQ,
          value: 'north',
        },
        {
          stepId: step1Id,
          fieldKey: 'interests',
          operator: MetricsFilterOperator.IN,
          values: ['science'],
        },
        {
          stepId: step1Id,
          fieldKey: 'age',
          operator: MetricsFilterOperator.RANGE,
          min: 20,
          max: 30,
        },
      ],
      timeline: {
        granularity: MetricsTimelineGranularity.WEEK,
        periods: 12,
      },
    } as any);

    expect(result.totals.matchedApplications).toBe(1);
    expect(result.totals.accepted).toBe(1);
    expect(result.fieldBreakdown).toBeNull();
  });

  it('allows text fields for filtering but excludes text breakdown charts', async () => {
    const result = await service.query(eventId, {
      recipientFilter: {},
      responseFilters: [
        {
          stepId: step2Id,
          fieldKey: 'notes',
          operator: MetricsFilterOperator.EQ,
          value: 'great',
        },
      ],
      breakdownField: { stepId: step2Id, fieldKey: 'notes' },
      timeline: {
        granularity: MetricsTimelineGranularity.WEEK,
        periods: 12,
      },
    } as any);

    expect(result.totals.matchedApplications).toBe(1);
    expect(result.fieldBreakdown).toBeNull();
  });

  it('returns correct totals/breakdowns/funnel/geo/age/field distribution', async () => {
    const result = await service.query(eventId, {
      recipientFilter: {},
      responseFilters: [],
      breakdownField: { stepId: step1Id, fieldKey: 'region' },
      timeline: {
        granularity: MetricsTimelineGranularity.WEEK,
        periods: 12,
      },
    } as any);

    expect(result.totals).toEqual({
      matchedApplications: 3,
      submitted: 3,
      inReview: 1,
      accepted: 1,
      waitlisted: 0,
      rejected: 1,
      confirmed: 2,
      checkedIn: 1,
    });

    const stepOneCurrent = result.currentStepBreakdown.find(
      (item) => item.stepId === step1Id,
    );
    const stepTwoCurrent = result.currentStepBreakdown.find(
      (item) => item.stepId === step2Id,
    );
    expect(stepOneCurrent?.count).toBe(2);
    expect(stepTwoCurrent?.count).toBe(1);

    expect(result.stepFunnel).toEqual(
      expect.arrayContaining([
        {
          stepId: step1Id,
          stepTitle: 'Profile',
          stepIndex: 0,
          total: 3,
          submitted: 3,
          approved: 1,
          rejected: 1,
        },
        {
          stepId: step2Id,
          stepTitle: 'Review',
          stepIndex: 1,
          total: 1,
          submitted: 1,
          approved: 0,
          rejected: 0,
        },
      ]),
    );

    expect(result.geo.countries).toEqual([
      { country: 'MA', count: 2 },
      { country: 'FR', count: 1 },
    ]);

    const ageByKey = new Map(result.ageBuckets.map((bucket) => [bucket.key, bucket.count]));
    expect(ageByKey.get('13_17')).toBe(1);
    expect(ageByKey.get('18_24')).toBe(1);
    expect(ageByKey.get('35_44')).toBe(1);

    expect(result.fieldBreakdown?.fieldKey).toBe('region');
    expect(result.fieldBreakdown?.values).toEqual([{ value: 'North', count: 3 }]);
  });

  it('returns exactly 12 weekly timeline buckets with correct bucketing', async () => {
    const result = await service.query(eventId, {
      recipientFilter: {},
      responseFilters: [],
      timeline: {
        granularity: MetricsTimelineGranularity.WEEK,
        periods: 12,
      },
    } as any);

    expect(result.timeline).toHaveLength(12);

    for (let i = 0; i < result.timeline.length; i += 1) {
      const bucket = result.timeline[i];
      const start = new Date(bucket.periodStart).getTime();
      const end = new Date(bucket.periodEnd).getTime();
      expect(end - start).toBe(7 * 24 * 60 * 60 * 1000);
      if (i > 0) {
        const prevStart = new Date(result.timeline[i - 1].periodStart).getTime();
        expect(start - prevStart).toBe(7 * 24 * 60 * 60 * 1000);
      }
    }

    const totals = result.timeline.reduce(
      (acc, bucket) => {
        acc.started += bucket.applicationsStarted;
        acc.submissions += bucket.submissions;
        acc.decisions += bucket.decisionsPublished;
        acc.checkedIn += bucket.checkedIn;
        return acc;
      },
      { started: 0, submissions: 0, decisions: 0, checkedIn: 0 },
    );

    expect(totals).toEqual({
      started: 3,
      submissions: submissionTimeline.length,
      decisions: 2,
      checkedIn: 1,
    });
  });
});
