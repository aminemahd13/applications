import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { E2EAppHandle, createE2EApp } from './test-app.factory';

describe('Security Protection (e2e)', () => {
  let appHandle: E2EAppHandle;
  let eventsService: EventsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    appHandle = await createE2EApp();
    eventsService = appHandle.app.get(EventsService);
    prisma = appHandle.app.get(PrismaService);
  });

  afterAll(async () => {
    await appHandle.close();
  });

  it('should prevent modification of system sites', async () => {
    const testSlug = 'system-site-test-' + Date.now();

    // Manually create event (prisma.events.create)
    const event = await prisma.events.create({
      data: {
        id: randomUUID(),
        title: 'Protected System Site',
        slug: testSlug,
        is_system_site: true,
        status: 'published',
        timezone: 'UTC',
        format: 'in_person',
      },
    });

    // Test 1: Update Slug
    await expect(
      eventsService.update(event.id, { slug: testSlug + '-changed' }),
    ).rejects.toThrow(ConflictException);

    // Test 2: Archive
    await expect(eventsService.archive(event.id)).rejects.toThrow(
      ConflictException,
    );

    // Test 3: Delete (Soft)
    await expect(eventsService.softDelete(event.id)).rejects.toThrow(
      ConflictException,
    );

    // Cleanup
    await prisma.events.delete({ where: { id: event.id } });
  });
});
