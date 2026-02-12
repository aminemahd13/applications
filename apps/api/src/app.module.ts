import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ClsModule } from 'nestjs-cls';
import * as crypto from 'crypto';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ApplicationsModule } from './applications/applications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkflowSchedulerService } from './workflow/workflow-scheduler.service';
import { ReviewsModule } from './reviews/reviews.module';
import { FilesModule } from './reviews/files.module';
import { CheckinModule } from './checkin/checkin.module';
import { MessagesModule } from './messages/messages.module';
import { MicrositesModule } from './microsites/microsites.module';
import { AdminModule } from './admin/admin.module';
import { OrgSettingsModule } from './admin/org-settings.module';
import { EmailModule } from './common/email/email.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CsrfGuard } from './common/guards/csrf.guard';
import { EventScopeInterceptor } from './common/interceptors/event-scope.interceptor';
import { TestSecurityController } from './common/controllers/test-security.controller';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req) => req.headers['x-request-id'] ?? crypto.randomUUID(),
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 60, // 60 requests per minute general
      },
    ]),
    LoggerModule,
    PrismaModule,
    EmailModule,
    AuthModule,
    EventsModule,
    WorkflowModule,
    ApplicationsModule,
    ScheduleModule.forRoot(),
    ReviewsModule,
    FilesModule,
    CheckinModule,
    MessagesModule,
    MicrositesModule,
    AdminModule,
    OrgSettingsModule,
  ],
  controllers:
    process.env.NODE_ENV === 'production'
      ? [AppController]
      : [AppController, TestSecurityController],
  providers: [
    AppService,
    WorkflowSchedulerService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EventScopeInterceptor,
    },
  ],
})
export class AppModule {}
