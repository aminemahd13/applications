import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import { UuidSchema } from '@event-platform/shared';

@Injectable()
export class EventScopeInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const eventIdParam = request.params.eventId;
    const bodyEventId = request.body?.eventId;

    if (eventIdParam) {
      // Validate format
      const result = UuidSchema.safeParse(eventIdParam);
      if (!result.success) {
        throw new BadRequestException('Invalid eventId format');
      }

      // Check consistency checking
      if (bodyEventId && bodyEventId !== eventIdParam) {
        throw new BadRequestException('Event ID in body does not match route');
      }

      // Set context
      this.cls.set('eventId', eventIdParam);
    }

    // If no eventId in route, we don't set it. Logic mostly happens in PermissionGuard.

    return next.handle();
  }
}
