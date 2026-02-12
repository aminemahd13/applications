import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  constructor(private readonly cls: ClsService) {
    super();
  }

  private toJson(
    level: string,
    message: any,
    context?: string,
    stack?: string,
  ) {
    const requestId = this.cls.getId();
    const actorId = this.cls.get('actorId');
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      requestId,
      actorId,
      context,
      message,
      stack,
    });
  }

  log(message: any, context?: string) {
    console.log(this.toJson('info', message, context));
  }

  error(message: any, stack?: string, context?: string) {
    console.error(this.toJson('error', message, context, stack));
  }

  warn(message: any, context?: string) {
    console.warn(this.toJson('warn', message, context));
  }

  debug(message: any, context?: string) {
    console.debug(this.toJson('debug', message, context));
  }

  verbose(message: any, context?: string) {
    console.debug(this.toJson('verbose', message, context));
  }
}
