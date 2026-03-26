import { z } from 'zod';
import { RecipientFilterSchema } from './messages.dto';

export enum MetricsFieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  EMAIL = 'email',
  PHONE = 'phone',
  DATE = 'date',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  CHECKBOX = 'checkbox',
}

export enum MetricsFilterOperator {
  EQ = 'eq',
  IN = 'in',
  RANGE = 'range',
}

export enum MetricsTimelineGranularity {
  WEEK = 'week',
}

export const MetricsFieldDescriptorSchema = z.object({
  stepId: z.string().uuid(),
  stepTitle: z.string(),
  stepIndex: z.number().int().nonnegative(),
  fieldKey: z.string().min(1),
  fieldLabel: z.string().min(1),
  fieldType: z.nativeEnum(MetricsFieldType),
  operators: z.array(z.nativeEnum(MetricsFilterOperator)).min(1),
  chartable: z.boolean(),
});

export type MetricsFieldDescriptor = z.infer<typeof MetricsFieldDescriptorSchema>;

export const MetricsFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export type MetricsFieldOption = z.infer<typeof MetricsFieldOptionSchema>;

export const MetricsFieldSchema = MetricsFieldDescriptorSchema.extend({
  options: z.array(MetricsFieldOptionSchema).optional(),
});

export type MetricsField = z.infer<typeof MetricsFieldSchema>;

export const MetricsFieldGroupSchema = z.object({
  stepId: z.string().uuid(),
  stepTitle: z.string(),
  stepIndex: z.number().int().nonnegative(),
  fields: z.array(MetricsFieldSchema),
});

export type MetricsFieldGroup = z.infer<typeof MetricsFieldGroupSchema>;

export const EventMetricsFieldsResponseSchema = z.object({
  steps: z.array(MetricsFieldGroupSchema),
});

export type EventMetricsFieldsResponse = z.infer<
  typeof EventMetricsFieldsResponseSchema
>;

export const MetricsResponseFilterSchema = z
  .object({
    stepId: z.string().uuid(),
    fieldKey: z.string().min(1),
    operator: z.nativeEnum(MetricsFilterOperator),
    value: z.any().optional(),
    values: z.array(z.any()).optional(),
    min: z.any().optional(),
    max: z.any().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.operator === MetricsFilterOperator.EQ &&
      value.value === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value is required for eq operator',
        path: ['value'],
      });
    }
    if (
      value.operator === MetricsFilterOperator.IN &&
      (!Array.isArray(value.values) || value.values.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'values is required for in operator',
        path: ['values'],
      });
    }
    if (
      value.operator === MetricsFilterOperator.RANGE &&
      value.min === undefined &&
      value.max === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'min or max is required for range operator',
        path: ['min'],
      });
    }
  });

export type MetricsResponseFilter = z.infer<typeof MetricsResponseFilterSchema>;

export const MetricsBreakdownFieldSchema = z.object({
  stepId: z.string().uuid(),
  fieldKey: z.string().min(1),
});

export type MetricsBreakdownField = z.infer<typeof MetricsBreakdownFieldSchema>;

export const MetricsTimelineConfigSchema = z.object({
  granularity: z
    .nativeEnum(MetricsTimelineGranularity)
    .default(MetricsTimelineGranularity.WEEK),
  periods: z.coerce.number().int().min(1).max(52).default(12),
});

export type MetricsTimelineConfig = z.infer<typeof MetricsTimelineConfigSchema>;

export const EventMetricsQuerySchema = z.object({
  recipientFilter: RecipientFilterSchema.optional().default({}),
  responseFilters: z.array(MetricsResponseFilterSchema).max(20).default([]),
  breakdownField: MetricsBreakdownFieldSchema.optional(),
  timeline: MetricsTimelineConfigSchema.default({
    granularity: MetricsTimelineGranularity.WEEK,
    periods: 12,
  }),
});

export type EventMetricsQueryDto = z.infer<typeof EventMetricsQuerySchema>;

export interface EventMetricsTotals {
  matchedApplications: number;
  submitted: number;
  inReview: number;
  accepted: number;
  waitlisted: number;
  rejected: number;
  confirmed: number;
  checkedIn: number;
}

export interface EventMetricsCountItem {
  key: string;
  label: string;
  count: number;
}

export interface EventMetricsCurrentStepItem {
  stepId: string | null;
  stepTitle: string;
  stepIndex: number | null;
  count: number;
}

export interface EventMetricsStepFunnelItem {
  stepId: string;
  stepTitle: string;
  stepIndex: number;
  total: number;
  submitted: number;
  approved: number;
  rejected: number;
}

export interface EventMetricsCountryItem {
  country: string;
  count: number;
}

export interface EventMetricsCityItem {
  city: string;
  country?: string;
  count: number;
}

export interface EventMetricsAgeBucket {
  key: string;
  label: string;
  count: number;
}

export interface EventMetricsFieldBreakdown {
  stepId: string;
  stepTitle: string;
  stepIndex: number;
  fieldKey: string;
  fieldLabel: string;
  fieldType: MetricsFieldType;
  values: Array<{ value: string; count: number }>;
  otherCount: number;
}

export interface EventMetricsTimelineItem {
  periodStart: string;
  periodEnd: string;
  applicationsStarted: number;
  submissions: number;
  decisionsPublished: number;
  checkedIn: number;
}

export interface EventMetricsQueryResponse {
  totals: EventMetricsTotals;
  decisionBreakdown: EventMetricsCountItem[];
  currentStepBreakdown: EventMetricsCurrentStepItem[];
  stepFunnel: EventMetricsStepFunnelItem[];
  geo: {
    countries: EventMetricsCountryItem[];
    cities: EventMetricsCityItem[];
  };
  ageBuckets: EventMetricsAgeBucket[];
  fieldBreakdown: EventMetricsFieldBreakdown | null;
  timeline: EventMetricsTimelineItem[];
}
