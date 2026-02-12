import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { PublishStatus } from '@event-platform/shared';

async function run() {
    console.log('Initializing Application Context...');
    // Initialize Nest without listening to HTTP
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const eventsService = app.get(EventsService);
    const prisma = app.get(PrismaService);

    const testSlug = 'system-site-test-' + Date.now();
    console.log(`Creating test System Site: ${testSlug}`);

    // Manually create a system site via Prisma (since service.create doesn't support setting is_system_site)
    const event = await prisma.events.create({
        data: {
            id: crypto.randomUUID(),
            title: 'Protected System Site',
            slug: testSlug,
            is_system_site: true,
            status: 'published',
            timezone: 'UTC',
            format: 'in_person'
        }
    });

    let passed = true;

    // Test 1: Update Slug - Should Fail
    try {
        console.log('Test 1: Attempting to change slug...');
        await eventsService.update(event.id, { slug: testSlug + '-changed' });
        console.error('❌ FAILED: Slug update should have been blocked.');
        passed = false;
    } catch (e) {
        if (e instanceof ConflictException && e.message.includes('Cannot change slug')) {
            console.log('✅ PASSED: Slug update blocked.');
        } else {
            console.error('❌ FAILED: Unexpected error:', e);
            passed = false;
        }
    }

    // Test 2: Archive - Should Fail
    try {
        console.log('Test 2: Attempting to archive...');
        await eventsService.archive(event.id);
        console.error('❌ FAILED: Archive should have been blocked.');
        passed = false;
    } catch (e) {
        if (e instanceof ConflictException && e.message.includes('Cannot archive')) {
            console.log('✅ PASSED: Archive blocked.');
        } else {
            console.error('❌ FAILED: Unexpected error:', e);
            passed = false;
        }
    }

    // Test 3: Delete (via Soft Delete) - Should Fail
    try {
        console.log('Test 3: Attempting to soft delete...');
        await eventsService.softDelete(event.id);
        console.error('❌ FAILED: Soft delete should have been blocked.');
        passed = false;
    } catch (e) {
        if (e instanceof ConflictException && e.message.includes('Cannot delete') || e.message.includes('Cannot archive')) {
            console.log('✅ PASSED: Delete blocked.');
        } else {
            console.error('❌ FAILED: Unexpected error:', e);
            passed = false;
        }
    }

    // Clean up
    console.log('Cleaning up test data...');
    // We have to forcefully delete it using Prisma since Service is blocked
    await prisma.events.delete({ where: { id: event.id } });

    await app.close();

    if (!passed) {
        console.error('VERIFICATION FAILED');
        process.exit(1);
    } else {
        console.log('ALL SECURITY CHECKS PASSED');
        process.exit(0);
    }
}

run();
