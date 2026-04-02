import {
  classifyEmailSendError,
  EmailFailureClass,
} from './email-error-classifier';

describe('classifyEmailSendError', () => {
  it('classifies provider throttling text as RATE_LIMIT', () => {
    const result = classifyEmailSendError({
      message: 'Too many requests, please try again later',
      responseCode: 500,
    });

    expect(result.classification).toBe(EmailFailureClass.RATE_LIMIT);
  });

  it('classifies SMTP 4xx transient responses as RETRYABLE', () => {
    const result = classifyEmailSendError({
      message: 'Temporary mailbox unavailable',
      responseCode: 425,
    });

    expect(result.classification).toBe(EmailFailureClass.RETRYABLE);
  });

  it('classifies SMTP 5xx responses as PERMANENT', () => {
    const result = classifyEmailSendError({
      message: 'Mailbox not found',
      responseCode: 550,
    });

    expect(result.classification).toBe(EmailFailureClass.PERMANENT);
  });

  it('classifies transient network transport errors as RETRYABLE', () => {
    const result = classifyEmailSendError({
      message: 'Connection timed out',
      code: 'ETIMEDOUT',
    });

    expect(result.classification).toBe(EmailFailureClass.RETRYABLE);
  });

  it('parses retryAfter hints from structured fields', () => {
    const result = classifyEmailSendError({
      message: 'Rate limit exceeded',
      responseCode: 429,
      retryAfterSeconds: 120,
    });

    expect(result.classification).toBe(EmailFailureClass.RATE_LIMIT);
    expect(result.retryAfterMs).toBe(120_000);
  });

  it('parses retryAfter hints from provider response text', () => {
    const result = classifyEmailSendError({
      message: '4.7.0 Temporarily deferred. Retry-After: 90',
      responseCode: 451,
    });

    expect(result.classification).toBe(EmailFailureClass.RATE_LIMIT);
    expect(result.retryAfterMs).toBe(90_000);
  });
});
