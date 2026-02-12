import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';

describe('Security Protection (e2e)', () => {
  let app: any;
  let eventsService: EventsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    eventsService = app.get(EventsService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should prevent modification of system sites', async () => {
    const testSlug = 'system-site-test-' + Date.now();
    console.log('Creating test System Site: ' + testSlug);

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
    console.log('Test 1: Update Slug');
    await expect(
      eventsService.update(event.id, { slug: testSlug + '-changed' }),
    ).rejects.toThrow(ConflictException);

    // Test 2: Archive
    console.log('Test 2: Archive');
    await expect(eventsService.archive(event.id)).rejects.toThrow(
      ConflictException,
    );

    // Test 3: Delete (Soft)
    console.log('Test 3: Soft Delete');
    await expect(eventsService.softDelete(event.id)).rejects.toThrow(
      ConflictException,
    );

    // Cleanup
    await prisma.events.delete({ where: { id: event.id } });
  });
});
