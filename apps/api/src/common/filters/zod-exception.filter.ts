import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { Request, Response } from 'express';

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const errors = exception.issues.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    // Keep this concise so validation failures are visible in container logs.
    console.warn('[ZodValidation]', {
      method: request?.method,
      path: request?.originalUrl ?? request?.url,
      errors,
    });

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors,
    });
  }
}
