import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@event-platform/db';
import { ClsServiceManager } from 'nestjs-cls';

// Sensitive fields that should NEVER be logged
const REDACTED_FIELDS = new Set([
  'password_hash',
  'token',
  'token_hash', // Password reset / email verification tokens
  'reset_token',
  'reset_token_hash',
  'session_id',
  'csrf_token',
  'checkin_token',
  'checkin_token_hash',
  'qr_token_hash',
  'secret',
  'api_key',
  'signed_url',
]);

// Large JSON fields that should be summarized, not logged in full
const LARGE_FIELD_THRESHOLD = 5000; // 5KB
const LARGE_FIELDS = new Set([
  'answers_snapshot',
  'schema',
  'ui',
  'blocks',
  'branding',
  'security',
  'email',
  'storage',
  'retention',
]);

type AuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type AuditJob = {
  params: any;
  before: any;
  after: any;
  ctx: AuditContext;
  retryCount: number;
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly auditQueue: AuditJob[] = [];
  private auditQueueWorkerRunning = false;
  private readonly maxAuditQueueSize = Math.max(
    Number(process.env.AUDIT_QUEUE_MAX_SIZE ?? 2000),
    200,
  );
  private readonly maxAuditJobRetries = Math.max(
    Number(process.env.AUDIT_MAX_RETRIES ?? 2),
    0,
  );
  private readonly eventLookupCacheTtlMs = Math.max(
    Number(process.env.AUDIT_EVENT_LOOKUP_CACHE_TTL_MS ?? 120_000),
    30_000,
  );
  private readonly applicationEventCache = new Map<
    string,
    { eventId: string; expiresAt: number }
  >();
  private readonly submissionEventCache = new Map<
    string,
    { eventId: string; expiresAt: number }
  >();

  constructor() {
    super();
  }

  async onModuleInit() {
    await this.$connect();

    this.$use(async (params, next) => {
      // Exclude audit_logs to prevent loops
      if (params.model === 'audit_logs') {
        return next(params);
      }

      // Only audit mutating actions
      const mutatingActions = [
        'create',
        'update',
        'delete',
        'upsert',
        'createMany',
        'updateMany',
        'deleteMany',
      ];
      if (!mutatingActions.includes(params.action)) {
        return next(params);
      }

      const cls = ClsServiceManager.getClsService();
      const actorId = cls.get('actorId');
      const requestId = cls.getId();
      const ip = cls.get('ip');
      const userAgent = cls.get('ua');

      // Prepare audit payload
      let before = null;
      if (this.shouldCaptureBeforeSnapshot(params)) {
        try {
          if (params.args?.where) {
            // @ts-ignore - dynamic model access
            before = await this[params.model].findUnique({
              where: params.args.where,
            });
          }
        } catch (e) {
          // Ignore retrieval errors
        }
      }

      const result = await next(params);

      const queued = this.enqueueAuditJob({
        params: {
          model: params.model,
          action: params.action,
          args: params.args,
        },
        before,
        after: result,
        ctx: {
          actorId,
          requestId,
          ip,
          userAgent,
        },
        retryCount: 0,
      });
      if (!queued) {
        // Queue is saturated: apply backpressure rather than dropping audits.
        try {
          await this.logAudit(
            { model: params.model, action: params.action, args: params.args },
            before,
            result,
            {
              actorId,
              requestId,
              ip,
              userAgent,
            },
          );
        } catch (e) {
          console.error('Failed to log audit (sync fallback):', e);
        }
      }

      return result;
    });
  }

  async onModuleDestroy() {
    await this.waitForAuditQueueDrain();
    await this.$disconnect();
  }

  private shouldCaptureBeforeSnapshot(params: any): boolean {
    if (!['update', 'delete'].includes(params?.action)) return false;

    const where = params?.args?.where;
    if (!where || typeof where !== 'object' || Array.isArray(where)) {
      return false;
    }

    const keys = Object.keys(where);
    if (keys.length === 0 || keys.length > 3) return false;

    return keys.some((key) => {
      const value = where[key];
      return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      );
    });
  }

  private enqueueAuditJob(job: AuditJob): boolean {
    if (this.auditQueue.length >= this.maxAuditQueueSize) {
      return false;
    }

    this.auditQueue.push(job);
    void this.drainAuditQueue();
    return true;
  }

  private async drainAuditQueue() {
    if (this.auditQueueWorkerRunning) return;
    this.auditQueueWorkerRunning = true;

    try {
      let processed = 0;
      while (this.auditQueue.length > 0) {
        const job = this.auditQueue.shift();
        if (!job) break;

        try {
          await this.logAudit(job.params, job.before, job.after, job.ctx);
        } catch (error) {
          if (job.retryCount < this.maxAuditJobRetries) {
            job.retryCount += 1;
            this.auditQueue.push(job);
          } else {
            console.error('Failed to persist audit log:', error);
          }
        }

        processed += 1;
        if (processed % 50 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
    } finally {
      this.auditQueueWorkerRunning = false;
      if (this.auditQueue.length > 0) {
        void this.drainAuditQueue();
      }
    }
  }

  private async waitForAuditQueueDrain(timeoutMs = 5000) {
    const startedAt = Date.now();

    while (
      (this.auditQueueWorkerRunning || this.auditQueue.length > 0) &&
      Date.now() - startedAt < timeoutMs
    ) {
      if (!this.auditQueueWorkerRunning && this.auditQueue.length > 0) {
        void this.drainAuditQueue();
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }

  /**
   * Redact sensitive fields and summarize large JSON fields
   */
  private redactAndSummarize(obj: any): { data: any; redacted: boolean } {
    if (!obj || typeof obj !== 'object') return { data: obj, redacted: false };

    const copy: any = Array.isArray(obj) ? [...obj] : { ...obj };
    let redacted = false;

    for (const key of Object.keys(copy)) {
      // Redact sensitive fields
      if (REDACTED_FIELDS.has(key)) {
        copy[key] = '[REDACTED]';
        redacted = true;
        continue;
      }

      // Summarize large JSON fields
      if (LARGE_FIELDS.has(key) && copy[key]) {
        const serialized = this.safeStringify(copy[key]) || '';
        if (serialized.length > LARGE_FIELD_THRESHOLD) {
          copy[key] = {
            _summary: true,
            size: serialized.length,
            type: typeof copy[key],
            hash: this.simpleHash(serialized),
          };
          redacted = true;
          continue;
        }
      }

      // Recurse into nested objects
      if (typeof copy[key] === 'object' && copy[key] !== null) {
        const nested = this.redactAndSummarize(copy[key]);
        copy[key] = nested.data;
        if (nested.redacted) redacted = true;
      }
    }

    return { data: copy, redacted };
  }

  /**
   * Simple hash for large field identification (not cryptographic)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * JSON.stringify that tolerates BigInt and other non-plain values.
   */
  private safeStringify(value: any): string | undefined {
    try {
      return JSON.stringify(value, (_key, current) => {
        if (typeof current === 'bigint') return current.toString();
        if (current instanceof Date) return current.toISOString();
        if (current instanceof Map)
          return Object.fromEntries(current.entries());
        if (current instanceof Set) return Array.from(current.values());
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(current)) {
          return { _type: 'Buffer', base64: current.toString('base64') };
        }
        return current;
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Normalize any value into JSON-compatible data for audit storage.
   */
  private toJsonSafe(value: any): any {
    const serialized = this.safeStringify(value);
    if (serialized === undefined) return null;
    try {
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  }

  /**
   * Compute diff between before and after states (for updates)
   */
  private computeDiff(before: any, after: any): any {
    if (!before || !after) return null;

    const diff: any = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const beforeVal = this.safeStringify(before[key]);
      const afterVal = this.safeStringify(after[key]);
      if (beforeVal !== afterVal) {
        diff[key] = {
          from: this.toJsonSafe(before[key]),
          to: this.toJsonSafe(after[key]),
        };
      }
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }

  private pickString(...candidates: unknown[]): string | undefined {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
    return undefined;
  }

  private getCachedEventId(
    cache: Map<string, { eventId: string; expiresAt: number }>,
    key: string,
  ): string | undefined {
    const cached = cache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return cached.eventId;
  }

  private setCachedEventId(
    cache: Map<string, { eventId: string; expiresAt: number }>,
    key: string,
    eventId: string,
  ) {
    const now = Date.now();
    cache.set(key, {
      eventId,
      expiresAt: now + this.eventLookupCacheTtlMs,
    });

    if (cache.size > 20_000) {
      for (const [cacheKey, cached] of cache) {
        if (cached.expiresAt <= now) {
          cache.delete(cacheKey);
        }
        if (cache.size <= 10_000) break;
      }
    }
  }

  private async resolveEventId(params: any, before: any, after: any) {
    let eventId = this.pickString(
      params.args?.data?.event_id,
      params.args?.where?.event_id,
      after?.event_id,
      before?.event_id,
    );
    if (eventId) return eventId;

    const applicationId = this.pickString(
      params.args?.data?.application_id,
      params.args?.where?.application_id,
      after?.application_id,
      before?.application_id,
    );
    if (applicationId) {
      const cachedEventId = this.getCachedEventId(
        this.applicationEventCache,
        applicationId,
      );
      if (cachedEventId) return cachedEventId;

      const application = await this.applications.findUnique({
        where: { id: applicationId },
        select: { event_id: true },
      });
      eventId = this.pickString(application?.event_id);
      if (eventId) {
        this.setCachedEventId(
          this.applicationEventCache,
          applicationId,
          eventId,
        );
        return eventId;
      }
    }

    const submissionVersionId = this.pickString(
      params.args?.data?.submission_version_id,
      params.args?.where?.submission_version_id,
      after?.submission_version_id,
      before?.submission_version_id,
    );
    if (submissionVersionId) {
      const cachedEventId = this.getCachedEventId(
        this.submissionEventCache,
        submissionVersionId,
      );
      if (cachedEventId) return cachedEventId;

      const version = await this.step_submission_versions.findUnique({
        where: { id: submissionVersionId },
        select: {
          application_id: true,
          applications: {
            select: {
              event_id: true,
            },
          },
        },
      });
      eventId = this.pickString(version?.applications?.event_id);
      if (eventId) {
        this.setCachedEventId(
          this.submissionEventCache,
          submissionVersionId,
          eventId,
        );
        const linkedApplicationId = this.pickString(version?.application_id);
        if (linkedApplicationId) {
          this.setCachedEventId(
            this.applicationEventCache,
            linkedApplicationId,
            eventId,
          );
        }
        return eventId;
      }
    }

    return undefined;
  }

  private async logAudit(params: any, before: any, after: any, ctx: any) {
    const eventId = await this.resolveEventId(params, before, after);

    // Redact sensitive fields
    const beforeResult = this.redactAndSummarize(before);
    const afterResult = this.redactAndSummarize(after);
    const redactionApplied = beforeResult.redacted || afterResult.redacted;

    // For updates, log diff instead of full snapshots (smaller)
    let logBefore = beforeResult.data;
    let logAfter = afterResult.data;

    if (params.action === 'update' && before && after) {
      const diff = this.computeDiff(beforeResult.data, afterResult.data);
      if (diff) {
        logBefore = null; // Don't log full before
        logAfter = { _diff: true, changes: diff };
      }
    }

    logBefore = this.toJsonSafe(logBefore);
    logAfter = this.toJsonSafe(logAfter);

    const rawEntityId = after?.id ?? before?.id ?? 'unknown';
    const entityId =
      rawEntityId === null || rawEntityId === undefined
        ? 'unknown'
        : String(rawEntityId);

    await this.audit_logs.create({
      data: {
        id: crypto.randomUUID(),
        action: params.action,
        entity_type: params.model,
        entity_id: entityId,
        actor_user_id: ctx.actorId || null,
        event_id: eventId || null,
        request_id: ctx.requestId || null,
        ip_address: ctx.ip || null,
        user_agent: ctx.userAgent || null,
        before: logBefore,
        after: logAfter,
        redaction_applied: redactionApplied,
      },
    });
  }
}
