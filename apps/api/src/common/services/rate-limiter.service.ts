import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis-based rate limiter for per-email throttling.
 * This supplements @nestjs/throttler (IP-based) with email-keyed limits.
 */
@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private redis: Redis;
  private static readonly USER_SESSION_PREFIX = 'user_sessions:';
  private static readonly SESSION_KEY_PREFIX = 'sess:';
  private static readonly SESSION_OWNER_PREFIX = 'session_user:';
  private static readonly SESSION_TRACK_TTL_SECONDS = 14 * 24 * 60 * 60;
  private static readonly LEGACY_SCAN_ENABLED =
    process.env.SESSION_REVOKE_SCAN_FALLBACK === 'true';
  private static readonly LEGACY_SCAN_MAX_KEYS = Math.max(
    Number(process.env.SESSION_REVOKE_SCAN_MAX_KEYS ?? 5000),
    500,
  );

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private getUserSessionIndexKey(userId: string): string {
    return `${RateLimiterService.USER_SESSION_PREFIX}${userId}`;
  }

  private getRedisSessionKey(sessionId: string): string {
    return `${RateLimiterService.SESSION_KEY_PREFIX}${sessionId}`;
  }

  private getSessionOwnerKey(sessionId: string): string {
    return `${RateLimiterService.SESSION_OWNER_PREFIX}${sessionId}`;
  }

  async trackUserSession(userId: string, sessionId: string): Promise<void> {
    if (!userId || !sessionId) return;
    const sessionIndexKey = this.getUserSessionIndexKey(userId);
    await this.redis
      .multi()
      .sadd(sessionIndexKey, sessionId)
      .expire(sessionIndexKey, RateLimiterService.SESSION_TRACK_TTL_SECONDS)
      .set(
        this.getSessionOwnerKey(sessionId),
        userId,
        'EX',
        RateLimiterService.SESSION_TRACK_TTL_SECONDS,
      )
      .exec();
  }

  /**
   * Check if an action is allowed for a given key (e.g., email).
   * Returns true if allowed, false if rate limit exceeded.
   *
   * @param key - Unique key for rate limiting (e.g., normalized email)
   * @param limit - Max allowed requests in the window
   * @param windowMs - Time window in milliseconds
   */
  async isAllowed(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;

    const multi = this.redis.multi();
    multi.incr(redisKey);
    multi.pttl(redisKey);

    const results = await multi.exec();
    const count = results![0][1] as number;
    const ttl = results![1][1] as number;

    // Set expiry on first request
    if (ttl === -1) {
      await this.redis.pexpire(redisKey, windowMs);
    }

    return count <= limit;
  }

  /**
   * Get remaining attempts for a key
   */
  async getRemainingAttempts(key: string, limit: number): Promise<number> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.get(redisKey);
    if (!count) return limit;
    return Math.max(0, limit - parseInt(count, 10));
  }

  /**
   * Check password reset rate limit (max 3 per email per hour)
   */
  async checkPasswordResetLimit(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.isAllowed(`pwreset:${normalizedEmail}`, 3, 60 * 60 * 1000);
  }

  /**
   * Check email verification rate limit (max 3 per email per hour)
   */
  async checkEmailVerificationLimit(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.isAllowed(`emailverify:${normalizedEmail}`, 3, 60 * 60 * 1000);
  }

  /**
   * Check login rate limit (max 10 per email per 15 minutes)
   */
  async checkLoginLimit(email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.isAllowed(`login:${normalizedEmail}`, 10, 15 * 60 * 1000);
  }

  /**
   * Revoke all sessions for a user by scanning Redis for session keys.
   * Sessions are stored with prefix 'sess:' and contain user.id in the session data.
   * This is called after password reset to log out everywhere.
   */
  async revokeUserSessions(userId: string): Promise<number> {
    const sessionIndexKey = this.getUserSessionIndexKey(userId);
    const trackedSessionIds = await this.redis.smembers(sessionIndexKey);

    if (trackedSessionIds.length > 0) {
      const pipeline = this.redis.multi();
      for (const sessionId of trackedSessionIds) {
        pipeline.del(this.getRedisSessionKey(sessionId));
        pipeline.del(this.getSessionOwnerKey(sessionId));
      }
      pipeline.del(sessionIndexKey);

      const results = await pipeline.exec();
      const deletedCount = results
        ? results
            .slice(0, trackedSessionIds.length * 2)
            .reduce(
              (count, row, index) =>
                index % 2 === 0 ? count + Number(row?.[1] ?? 0) : count,
              0,
            )
        : 0;
      console.log(
        `[SESSION] Revoked ${deletedCount} sessions for user ${userId} (indexed)`,
      );
      return deletedCount;
    }

    if (!RateLimiterService.LEGACY_SCAN_ENABLED) {
      await this.redis.del(sessionIndexKey);
      console.log(
        `[SESSION] No indexed sessions found for user ${userId}; skipped legacy scan fallback`,
      );
      return 0;
    }

    // Backward-compat fallback for sessions created before session-index tracking.
    let cursor = '0';
    let deletedCount = 0;
    let scannedKeys = 0;

    do {
      // Scan for session keys
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'sess:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length === 0) {
        continue;
      }

      const remainingBudget =
        RateLimiterService.LEGACY_SCAN_MAX_KEYS - scannedKeys;
      if (remainingBudget <= 0) break;

      const keysToInspect = keys.slice(0, remainingBudget);
      scannedKeys += keysToInspect.length;

      const payloads = await this.redis.mget(keysToInspect);
      const keysToDelete: string[] = [];

      for (let i = 0; i < keysToInspect.length; i++) {
        const key = keysToInspect[i];
        const sessionData = payloads[i];
        try {
          if (sessionData) {
            // Session data is JSON with user object
            const parsed = JSON.parse(sessionData);
            if (parsed.user?.id === userId) {
              keysToDelete.push(key);
            }
          }
        } catch (e) {
          // Ignore parse errors for malformed sessions
        }
      }

      if (keysToDelete.length > 0) {
        const pipeline = this.redis.multi();
        for (const key of keysToDelete) {
          pipeline.del(key);
        }
        const results = await pipeline.exec();
        deletedCount += results
          ? results.reduce((count, row) => count + Number(row?.[1] ?? 0), 0)
          : 0;
      }

      if (scannedKeys >= RateLimiterService.LEGACY_SCAN_MAX_KEYS) {
        break;
      }
    } while (cursor !== '0');

    await this.redis.del(sessionIndexKey);
    console.log(
      `[SESSION] Revoked ${deletedCount} sessions for user ${userId} (scan fallback, scanned ${scannedKeys} keys)`,
    );
    return deletedCount;
  }
}
