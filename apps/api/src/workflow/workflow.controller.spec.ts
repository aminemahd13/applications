import { WorkflowController } from './workflow.controller';

describe('WorkflowController', () => {
  it('lists lightweight workflow steps for selectors', async () => {
    const workflowService = {
      getWorkflow: jest.fn().mockResolvedValue([
        {
          id: 'step-1',
          stepIndex: 0,
          title: 'Profile',
          category: 'APPLICATION',
          instructionsRich: {},
        },
        {
          id: 'step-2',
          stepIndex: 1,
          title: 'Confirmation',
          category: 'CONFIRMATION',
          instructionsRich: {},
        },
      ]),
    };

    const controller = new WorkflowController(workflowService as any);
    const result = await controller.listSteps('event-1');

    expect(workflowService.getWorkflow).toHaveBeenCalledWith('event-1');
    expect(result).toEqual({
      data: [
        {
          id: 'step-1',
          stepIndex: 0,
          title: 'Profile',
          category: 'APPLICATION',
        },
        {
          id: 'step-2',
          stepIndex: 1,
          title: 'Confirmation',
          category: 'CONFIRMATION',
        },
      ],
    });
  });

  it('parses and forwards applicant modification fields when creating a step', async () => {
    const workflowService = {
      createStep: jest.fn().mockResolvedValue({
        id: 'step-1',
        title: 'Profile',
        category: 'APPLICATION',
        stepIndex: 0,
        allowApplicantModification: true,
        modificationScope: 'SUBMITTED_OR_APPROVED',
      }),
    };

    const controller = new WorkflowController(workflowService as any);
    const result = await controller.createStep('event-1', {
      title: 'Profile',
      allowApplicantModification: true,
      modificationScope: 'SUBMITTED_OR_APPROVED',
    });

    expect(workflowService.createStep).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        title: 'Profile',
        allowApplicantModification: true,
        modificationScope: 'SUBMITTED_OR_APPROVED',
      }),
    );
    expect(result).toEqual({
      data: expect.objectContaining({
        allowApplicantModification: true,
        modificationScope: 'SUBMITTED_OR_APPROVED',
      }),
    });
  });
});
