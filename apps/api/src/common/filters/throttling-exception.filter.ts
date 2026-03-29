import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { RateLimitExceededException } from '../exceptions/rate-limit-exceeded.exception';
import { Request, Response } from 'express';

type ThrottleResponsePayload = {
  statusCode?: unknown;
  message?: unknown;
  retryAfter?: unknown;
  retryAfterSeconds?: unknown;
};

const DEFAULT_RATE_LIMIT_MESSAGE =
  'Too many requests. Please wait a moment and try again.';

function extractMessage(payload: ThrottleResponsePayload): string | null {
  if (typeof payload.message === 'string') return payload.message.trim();
  if (Array.isArray(payload.message)) {
    const first = payload.message.find((entry) => typeof entry === 'string');
    if (typeof first === 'string') return first.trim();
  }
  return null;
}

function sanitizeRateLimitMessage(message: string | null): string {
  if (!message) return DEFAULT_RATE_LIMIT_MESSAGE;
  const normalized = message.toLowerCase();
  if (
    normalized.includes('throttlerexception') ||
    normalized === 'too many requests'
  ) {
    return DEFAULT_RATE_LIMIT_MESSAGE;
  }
  return message;
}

function parseRetryAfterSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.ceil(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.ceil(parsed);
    }
  }
  return null;
}

@Catch(ThrottlerException, RateLimitExceededException)
export class ThrottlingExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const raw = exception.getResponse();
    const payload =
      raw && typeof raw === 'object' ? (raw as ThrottleResponsePayload) : {};

    const message = sanitizeRateLimitMessage(extractMessage(payload));
    const retryAfterFromBody =
      parseRetryAfterSeconds(payload.retryAfterSeconds) ??
      parseRetryAfterSeconds(payload.retryAfter);
    const retryAfterFromHeader = parseRetryAfterSeconds(
      response.getHeader('Retry-After'),
    );
    const retryAfterSeconds = retryAfterFromBody ?? retryAfterFromHeader;

    // Keep throttling events visible in logs without leaking raw framework errors to users.
    console.warn('[RateLimit]', {
      method: request?.method,
      path: request?.originalUrl ?? request?.url,
      message,
      retryAfterSeconds,
    });

    if (retryAfterSeconds && !response.getHeader('Retry-After')) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: 'RATE_LIMITED',
      message,
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    });
  }
}
