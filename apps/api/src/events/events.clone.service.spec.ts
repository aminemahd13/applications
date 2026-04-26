import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventsService } from './events.service';

const SOURCE_EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

function makeEventRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'event-id',
    series_key: null,
    edition_label: null,
    title: 'Source Event',
    slug: 'source-event',
    timezone: 'UTC',
    start_at: null,
    end_at: null,
    venue_name: null,
    venue_address: null,
    venue_map_url: null,
    description: null,
    capacity: null,
    requires_email_verification: false,
    format: 'in_person',
    application_open_at: null,
    application_close_at: null,
    status: 'published',
    decision_config: {},
    checkin_config: {},
    created_at: now,
    updated_at: now,
    is_system_site: true,
    ...overrides,
  };
}

function createHarness() {
  const tx = {
    events: { create: jest.fn() },
    forms: { create: jest.fn() },
    form_versions: { create: jest.fn() },
    workflow_steps: { create: jest.fn() },
    microsites: { create: jest.fn() },
    microsite_pages: { createMany: jest.fn() },
    file_objects: { createMany: jest.fn() },
    event_role_assignments: { createMany: jest.fn() },
  };

  tx.events.create.mockImplementation(async (input: any) =>
    makeEventRecord(input.data),
  );
  tx.forms.create.mockResolvedValue(undefined);
  tx.form_versions.create.mockResolvedValue(undefined);
  tx.workflow_steps.create.mockResolvedValue(undefined);
  tx.microsites.create.mockResolvedValue({ id: 'microsite-clone' });
  tx.microsite_pages.createMany.mockResolvedValue({ count: 0 });
  tx.file_objects.createMany.mockResolvedValue({ count: 0 });

  const prisma = {
    events: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    forms: {
      findMany: jest.fn(),
    },
    workflow_steps: {
      findMany: jest.fn(),
    },
    microsites: {
      findUnique: jest.fn(),
    },
    file_objects: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };

  prisma.events.findUnique.mockResolvedValue(
    makeEventRecord({
      id: SOURCE_EVENT_ID,
      title: 'Original',
      slug: 'original',
      status: 'published',
      is_system_site: true,
      requires_email_verification: true,
      decision_config: { autoPublish: true },
      checkin_config: { enabled: true },
    }),
  );
  prisma.events.findFirst.mockResolvedValue(null);
  prisma.forms.findMany.mockResolvedValue([]);
  prisma.workflow_steps.findMany.mockResolvedValue([]);
  prisma.microsites.findUnique.mockResolvedValue(null);
  prisma.file_objects.findMany.mockResolvedValue([]);

  const storage = {
    getObjectBuffer: jest.fn(async (key: string) => Buffer.from(`buf:${key}`)),
    putObjectBuffer: jest.fn(async () => undefined),
    deleteObject: jest.fn(async () => undefined),
  };

  const cls = {
    get: jest.fn((key: string) => (key === 'actorId' ? ACTOR_ID : undefined)),
  };

  const service = new EventsService(prisma as any, storage as any, cls as any);

  return { service, prisma, tx, storage, cls };
}

describe('EventsService.clone', () => {
  it('clones event settings and forces draft + non-system-site', async () => {
    const { service, tx } = createHarness();

    const result = await service.clone({
      sourceEventId: SOURCE_EVENT_ID,
      title: 'Cloned Event',
      slug: 'cloned-event',
    });

    expect(tx.events.create).toHaveBeenCalledTimes(1);
    const createData = tx.events.create.mock.calls[0][0].data;
    expect(createData.title).toBe('Cloned Event');
    expect(createData.slug).toBe('cloned-event');
    expect(createData.status).toBe('draft');
    expect(createData.is_system_site).toBe(false);
    expect(createData.requires_email_verification).toBe(true);
    expect(createData.decision_config).toEqual({ autoPublish: true });
    expect(createData.checkin_config).toEqual({ enabled: true });
    expect(result.status).toBe('draft');
  });

  it('clones forms with latest-version policy and draft-only fallback', async () => {
    const { service, prisma, tx } = createHarness();

    prisma.forms.findMany.mockResolvedValue([
      {
        id: 'form-with-versions',
        name: 'Profile',
        draft_schema: { sections: ['old-draft'] },
        draft_ui: { old: true },
        form_versions: [
          {
            id: 'version-2',
            version_number: 2,
            schema: { sections: ['latest'] },
            ui: { latest: true },
          },
          {
            id: 'version-1',
            version_number: 1,
            schema: { sections: ['old'] },
            ui: { old: true },
          },
        ],
      },
      {
        id: 'form-draft-only',
        name: 'Consent',
        draft_schema: { sections: ['draft-only'] },
        draft_ui: { draftOnly: true },
        form_versions: [],
      },
    ]);

    await service.clone({
      sourceEventId: SOURCE_EVENT_ID,
      title: 'Clone Forms',
      slug: 'clone-forms',
    });

    expect(tx.forms.create).toHaveBeenCalledTimes(2);
    expect(tx.forms.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        name: 'Profile',
        draft_schema: { sections: ['latest'] },
        draft_ui: { latest: true },
      }),
    );
    expect(tx.forms.create.mock.calls[1][0].data).toEqual(
      expect.objectContaining({
        name: 'Consent',
        draft_schema: { sections: ['draft-only'] },
        draft_ui: { draftOnly: true },
      }),
    );

    expect(tx.form_versions.create).toHaveBeenCalledTimes(1);
    expect(tx.form_versions.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        version_number: 1,
        schema: { sections: ['latest'] },
        ui: { latest: true },
        published_by: ACTOR_ID,
      }),
    );
  });

  it('maps workflow form links to cloned latest form versions and nulls unmapped links', async () => {
    const { service, prisma, tx } = createHarness();

    prisma.forms.findMany.mockResolvedValue([
      {
        id: 'form-a',
        name: 'Form A',
        draft_schema: {},
        draft_ui: {},
        form_versions: [
          { id: 'form-a-v2', version_number: 2, schema: { s: 2 }, ui: { u: 2 } },
          { id: 'form-a-v1', version_number: 1, schema: { s: 1 }, ui: { u: 1 } },
        ],
      },
    ]);
    prisma.workflow_steps.findMany.mockResolvedValue([
      {
        step_index: 0,
        category: 'APPLICATION',
        title: 'Mapped step',
        instructions_rich: {},
        unlock_policy: 'AUTO_AFTER_PREV_SUBMITTED',
        unlock_at: null,
        review_required: false,
        reviewer_roles_allowed: ['reviewer'],
        reject_behavior: 'reject_resubmit_allowed',
        strict_gating: true,
        allow_next_steps_while_revising: true,
        revision_deadline_at: null,
        sensitivity_level: 'NORMAL',
        hidden: false,
        allow_applicant_modification: false,
        modification_scope: 'SUBMITTED_ONLY',
        deadline_at: null,
        max_revision_cycles: null,
        form_version_id: 'form-a-v1',
      },
      {
        step_index: 1,
        category: 'APPLICATION',
        title: 'Unmapped step',
        instructions_rich: {},
        unlock_policy: 'AUTO_AFTER_PREV_SUBMITTED',
        unlock_at: null,
        review_required: false,
        reviewer_roles_allowed: ['reviewer'],
        reject_behavior: 'reject_resubmit_allowed',
        strict_gating: true,
        allow_next_steps_while_revising: true,
        revision_deadline_at: null,
        sensitivity_level: 'NORMAL',
        hidden: false,
        allow_applicant_modification: false,
        modification_scope: 'SUBMITTED_ONLY',
        deadline_at: null,
        max_revision_cycles: null,
        form_version_id: 'missing-version',
      },
    ]);

    await service.clone({
      sourceEventId: SOURCE_EVENT_ID,
      title: 'Clone Workflow',
      slug: 'clone-workflow',
    });

    const clonedLatestVersionId = tx.form_versions.create.mock.calls[0][0].data.id;
    expect(tx.workflow_steps.create).toHaveBeenCalledTimes(2);
    expect(tx.workflow_steps.create.mock.calls[0][0].data.form_version_id).toBe(
      clonedLatestVersionId,
    );
    expect(tx.workflow_steps.create.mock.calls[1][0].data.form_version_id).toBe(
      null,
    );
  });

  it('clones microsite draft/pages as unpublished and rewrites media storage keys', async () => {
    const { service, prisma, tx, storage } = createHarness();

    const oldKeyA = `events/${SOURCE_EVENT_ID}/microsite/hero.jpg`;
    const oldKeyB = `events/${SOURCE_EVENT_ID}/microsite/gallery/image-2.png`;

    prisma.file_objects.findMany.mockResolvedValue([
      {
        id: 'file-a',
        storage_key: oldKeyA,
        original_filename: 'hero.jpg',
        mime_type: 'image/jpeg',
        size_bytes: BigInt(42),
        sha256: 'sha-a',
        sensitivity: 'normal',
        virus_scan_status: 'clean',
        expires_at: null,
        status: 'COMMITTED',
        media_optimization_status: 'DONE',
        media_optimization_attempts: 0,
        media_optimized_at: null,
        media_optimization_last_error: null,
      },
      {
        id: 'file-b',
        storage_key: oldKeyB,
        original_filename: 'image-2.png',
        mime_type: 'image/png',
        size_bytes: BigInt(99),
        sha256: 'sha-b',
        sensitivity: 'normal',
        virus_scan_status: 'pending',
        expires_at: new Date('2026-02-01T00:00:00.000Z'),
        status: 'STAGED',
        media_optimization_status: 'PENDING',
        media_optimization_attempts: 3,
        media_optimized_at: null,
        media_optimization_last_error: 'retry',
      },
    ]);
    prisma.microsites.findUnique.mockResolvedValue({
      id: 'mic-1',
      event_id: SOURCE_EVENT_ID,
      settings: {
        branding: {
          heroImageUrl: oldKeyA,
          logoUrl: `/${oldKeyB}`,
        },
      },
      microsite_pages: [
        {
          slug: '',
          title: 'Home',
          position: 0,
          blocks: [{ type: 'IMAGE', data: { assetKey: oldKeyA } }],
          seo: { image: `/${oldKeyA}` },
          visibility: 'PUBLIC',
        },
      ],
    });

    await service.clone({
      sourceEventId: SOURCE_EVENT_ID,
      title: 'Clone Microsite',
      slug: 'clone-microsite',
    });

    const clonedEventId = tx.events.create.mock.calls[0][0].data.id as string;
    const newKeyA = `events/${clonedEventId}/microsite/hero.jpg`;
    const newKeyB = `events/${clonedEventId}/microsite/gallery/image-2.png`;

    expect(storage.putObjectBuffer).toHaveBeenCalledWith(
      newKeyA,
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(storage.putObjectBuffer).toHaveBeenCalledWith(
      newKeyB,
      expect.any(Buffer),
      'image/png',
    );

    expect(tx.microsites.create).toHaveBeenCalledWith({
      data: {
        event_id: clonedEventId,
        settings: {
          branding: {
            heroImageUrl: newKeyA,
            logoUrl: `/${newKeyB}`,
          },
        },
        published_version: 0,
      },
    });
    expect(tx.microsite_pages.createMany).toHaveBeenCalledWith({
      data: [
        {
          microsite_id: 'microsite-clone',
          slug: '',
          title: 'Home',
          position: 0,
          blocks: [{ type: 'IMAGE', data: { assetKey: newKeyA } }],
          seo: { image: `/${newKeyA}` },
          visibility: 'PUBLIC',
        },
      ],
    });

    expect(tx.file_objects.createMany).toHaveBeenCalledTimes(1);
    const clonedRows = tx.file_objects.createMany.mock.calls[0][0].data;
    expect(clonedRows).toHaveLength(2);
    expect(clonedRows[0]).toEqual(
      expect.objectContaining({
        event_id: clonedEventId,
        storage_key: newKeyA,
        created_by: ACTOR_ID,
        status: 'COMMITTED',
      }),
    );
    expect(clonedRows[1]).toEqual(
      expect.objectContaining({
        event_id: clonedEventId,
        storage_key: newKeyB,
        created_by: ACTOR_ID,
        status: 'STAGED',
      }),
    );
  });

  it('rejects duplicate target slug', async () => {
    const { service, prisma, storage } = createHarness();
    prisma.events.findFirst.mockResolvedValue({ id: 'existing-event' });

    await expect(
      service.clone({
        sourceEventId: SOURCE_EVENT_ID,
        title: 'Clone',
        slug: 'duplicate-slug',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storage.getObjectBuffer).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not clone event role assignments', async () => {
    const { service, tx } = createHarness();

    await service.clone({
      sourceEventId: SOURCE_EVENT_ID,
      title: 'Clone No Roles',
      slug: 'clone-no-roles',
    });

    expect(tx.event_role_assignments.createMany).not.toHaveBeenCalled();
  });

  it('best-effort cleans copied storage objects when transaction fails', async () => {
    const { service, prisma, storage } = createHarness();

    const oldKey = `events/${SOURCE_EVENT_ID}/microsite/hero.jpg`;
    prisma.file_objects.findMany.mockResolvedValue([
      {
        id: 'file-a',
        storage_key: oldKey,
        original_filename: 'hero.jpg',
        mime_type: 'image/jpeg',
        size_bytes: BigInt(10),
        sha256: null,
        sensitivity: 'normal',
        virus_scan_status: 'pending',
        expires_at: null,
        status: 'STAGED',
        media_optimization_status: 'PENDING',
        media_optimization_attempts: 0,
        media_optimized_at: null,
        media_optimization_last_error: null,
      },
    ]);
    prisma.$transaction.mockRejectedValue(new Error('tx-failed'));

    await expect(
      service.clone({
        sourceEventId: SOURCE_EVENT_ID,
        title: 'Clone Failure',
        slug: 'clone-failure',
      }),
    ).rejects.toThrow('tx-failed');

    expect(storage.putObjectBuffer).toHaveBeenCalledTimes(1);
    const copiedKey = storage.putObjectBuffer.mock.calls[0][0];
    expect(storage.deleteObject).toHaveBeenCalledWith(copiedKey);
  });

  it('requires actor identity from CLS context', async () => {
    const { service, cls } = createHarness();
    cls.get.mockReturnValue(undefined);

    await expect(
      service.clone({
        sourceEventId: SOURCE_EVENT_ID,
        title: 'Clone',
        slug: 'clone-no-actor',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
