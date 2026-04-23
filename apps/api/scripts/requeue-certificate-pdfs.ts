import * as crypto from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

function readFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readOption(name: string): string | undefined {
  const inline = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1).trim() || undefined;
  }

  const index = process.argv.findIndex((entry) => entry === name);
  if (index < 0) {
    return undefined;
  }

  const next = process.argv[index + 1];
  if (!next || next.startsWith('--')) {
    return undefined;
  }
  return next.trim() || undefined;
}

async function run() {
  const eventId = readOption('--eventId');
  const batchSize = Math.max(Number(readOption('--batchSize') ?? 250), 1);
  const resetTimestamps = readFlag('--reset-generated-at');

  console.log(
    `Requeueing certificate PDF renders${eventId ? ` for event ${eventId}` : ''} in batches of ${batchSize}.`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);

  try {
    let totalQueued = 0;
    let cursorId: string | undefined;

    while (true) {
      const rows = await (prisma as any).issued_certificates.findMany({
        where: eventId ? { event_id: eventId } : undefined,
        select: {
          id: true,
          event_id: true,
        },
        orderBy: [{ id: 'asc' }],
        take: batchSize,
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
      });

      if (!rows.length) {
        break;
      }

      const now = new Date();
      const ids = rows.map((row: { id: string }) => row.id);

      await (prisma as any).certificate_render_jobs.deleteMany({
        where: {
          issued_certificate_id: {
            in: ids,
          },
        },
      });

      await (prisma as any).issued_certificates.updateMany({
        where: {
          id: {
            in: ids,
          },
        },
        data: {
          render_status: 'PENDING',
          render_error: null,
          ...(resetTimestamps
            ? {
                pdf_generated_at: null,
              }
            : {}),
          updated_at: now,
        },
      });

      await (prisma as any).certificate_render_jobs.createMany({
        data: rows.map((row: { id: string; event_id: string }) => ({
          id: crypto.randomUUID(),
          event_id: row.event_id,
          issued_certificate_id: row.id,
          status: 'PENDING',
          attempts: 0,
          max_attempts: Math.max(
            Number(process.env.CERTIFICATE_RENDER_MAX_ATTEMPTS ?? 5),
            1,
          ),
          next_retry_at: now,
          created_at: now,
          updated_at: now,
        })),
      });

      totalQueued += rows.length;
      cursorId = rows[rows.length - 1]?.id;
    }

    console.log(`Queued ${totalQueued} certificate render job(s).`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(
    `Failed to requeue certificate PDFs: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
