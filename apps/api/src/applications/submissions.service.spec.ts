import { BadRequestException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { StepStatus } from '@event-platform/shared';
import {
  ConditionMode,
  ConditionOperator,
  FieldType,
  FormDefinition,
} from '@event-platform/schemas';

function buildFormDefinition(): FormDefinition {
  return {
    sections: [
      {
        id: 'section-1',
        title: 'Experience',
        fields: [
          {
            id: 'field-root',
            key: 'previously_participated_to_MM',
            type: FieldType.SELECT,
            label: 'Previously participated',
          },
          {
            id: 'field-year',
            key: 'previous_participation_year',
            type: FieldType.TEXT,
            label: 'Participation year',
            logic: {
              showWhen: {
                mode: ConditionMode.ALL,
                rules: [
                  {
                    fieldKey: 'previously_participated_to_MM',
                    operator: ConditionOperator.EQ,
                    value: 'yes',
                  },
                ],
              },
            },
          },
          {
            id: 'field-details',
            key: 'previous_participation_details',
            type: FieldType.TEXTAREA,
            label: 'Participation details',
            logic: {
              showWhen: {
                mode: ConditionMode.ALL,
                rules: [
                  {
                    fieldKey: 'previous_participation_year',
                    operator: ConditionOperator.EXISTS,
                  },
                ],
              },
            },
          },
          {
            id: 'field-unrelated',
            key: 'favorite_color',
            type: FieldType.TEXT,
            label: 'Favorite color',
          },
        ],
      },
    ],
  };
}

describe('SubmissionsService targeted needs-info gating', () => {
  function createService() {
    const prisma = {
      needs_info_requests: {
        findMany: jest.fn(),
      },
      step_submission_versions: {
        findFirst: jest.fn(),
      },
    };

    const service = new SubmissionsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, prisma };
  }

  it('allows changes to conditional child fields of targeted fields', async () => {
    const { service, prisma } = createService();

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: ['previously_participated_to_MM'] },
    ]);
    prisma.step_submission_versions.findFirst.mockResolvedValue({
      answers_snapshot: {
        previously_participated_to_MM: 'no',
        previous_participation_year: '',
        previous_participation_details: '',
      },
    });

    await expect(
      (service as any).ensureNeedsInfoTargetFieldEditsAllowed(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        {
          previously_participated_to_MM: 'yes',
          previous_participation_year: '2024',
          previous_participation_details: 'Participated in edition 2024',
        },
        buildFormDefinition(),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects unrelated field edits even when target field and cascade fields are changed', async () => {
    const { service, prisma } = createService();

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: ['previously_participated_to_MM'] },
    ]);
    prisma.step_submission_versions.findFirst.mockResolvedValue({
      answers_snapshot: {
        previously_participated_to_MM: 'no',
        previous_participation_year: '',
        previous_participation_details: '',
        favorite_color: 'red',
      },
    });

    await expect(
      (service as any).ensureNeedsInfoTargetFieldEditsAllowed(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        {
          previously_participated_to_MM: 'yes',
          previous_participation_year: '2024',
          previous_participation_details: 'Participated in edition 2024',
          favorite_color: 'blue',
        },
        buildFormDefinition(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('supports target field ids stored as field.id aliases', async () => {
    const { service, prisma } = createService();

    prisma.needs_info_requests.findMany.mockResolvedValue([
      { target_field_ids: ['field-root'] },
    ]);
    prisma.step_submission_versions.findFirst.mockResolvedValue({
      answers_snapshot: {
        previously_participated_to_MM: 'no',
      },
    });

    await expect(
      (service as any).ensureNeedsInfoTargetFieldEditsAllowed(
        'app-1',
        'step-1',
        StepStatus.NEEDS_REVISION,
        {
          previously_participated_to_MM: 'yes',
        },
        buildFormDefinition(),
      ),
    ).resolves.toBeUndefined();
  });
});
