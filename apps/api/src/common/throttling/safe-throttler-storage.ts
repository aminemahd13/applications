import { ThrottlerStorage } from '@nestjs/throttler';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

interface HitWindow {
  /** Times (ms) of the counted hits still inside the window, oldest first. */
  hits: number[];
  /** Time (ms) when the current block ends, or null when not blocked. */
  blockedUntil: number | null;
  /** Last ttl used for this key, so the sweep can tell when it is idle. */
  ttl: number;
}

export interface SafeThrottlerStorageOptions {
  /** Clock override for tests. */
  now?: () => number;
  /** Minimum time between two sweeps of idle keys. */
  sweepIntervalMs?: number;
  /** Hard cap on tracked keys; the oldest keys are forgotten beyond it. */
  maxKeys?: number;
}

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const DEFAULT_MAX_KEYS = 200_000;

/**
 * In-memory ThrottlerStorage with a per-key sliding window.
 *
 * Replaces @nestjs/throttler's ThrottlerStorageService (6.x). That storage
 * keeps its per-hit expiry timers per throttler name, not per key, and clears
 * all of them whenever any key's block expires; from then on every other
 * client's hit count never goes down again until the process restarts.
 *
 * Same semantics the library intends:
 * - each counted hit expires `ttl` ms after it happened;
 * - the hit that takes the count above `limit` blocks the key for
 *   `blockDuration` ms, and hits are not counted while blocked;
 * - when the block ends, the key starts over with that request as its first hit.
 *
 * No timers: expired hits are dropped when the key is used, and idle keys are
 * swept at most once per `sweepIntervalMs`, from inside `increment`.
 */
export class SafeThrottlerStorage implements ThrottlerStorage {
  private readonly windows = new Map<string, HitWindow>();
  private readonly now: () => number;
  private readonly sweepIntervalMs: number;
  private readonly maxKeys: number;
  private lastSweepAt: number;

  constructor(options: SafeThrottlerStorageOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.sweepIntervalMs = Math.max(
      options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS,
      0,
    );
    this.maxKeys = Math.max(options.maxKeys ?? DEFAULT_MAX_KEYS, 1);
    this.lastSweepAt = this.now();
  }

  /** Number of keys currently tracked. */
  get size(): number {
    return this.windows.size;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = this.now();
    this.sweepIfDue(now);

    const storageKey = `${throttlerName}:${key}`;
    let window = this.windows.get(storageKey);
    if (!window) {
      window = { hits: [], blockedUntil: null, ttl };
      this.windows.set(storageKey, window);
    }
    window.ttl = ttl;

    if (window.blockedUntil !== null && window.blockedUntil <= now) {
      // The block is over: this key (and only this key) starts over.
      window.hits = [];
      window.blockedUntil = null;
    }

    dropExpiredHits(window, now);

    let isBlocked = window.blockedUntil !== null;
    if (!isBlocked) {
      window.hits.push(now);
      if (window.hits.length > limit) {
        window.blockedUntil = now + Math.max(blockDuration, 0);
        isBlocked = true;
      }
    }

    const oldestHit = window.hits[0];
    return {
      totalHits: window.hits.length,
      timeToExpire:
        oldestHit === undefined ? 0 : toSeconds(oldestHit + window.ttl - now),
      isBlocked,
      timeToBlockExpire:
        isBlocked && window.blockedUntil !== null
          ? toSeconds(window.blockedUntil - now)
          : 0,
    };
  }

  private sweepIfDue(now: number) {
    if (
      now - this.lastSweepAt < this.sweepIntervalMs &&
      this.windows.size < this.maxKeys
    ) {
      return;
    }
    this.lastSweepAt = now;

    for (const [storageKey, window] of this.windows) {
      if (isIdle(window, now)) this.windows.delete(storageKey);
    }

    if (this.windows.size >= this.maxKeys) {
      // Still at the cap after dropping idle keys: forget the oldest ones.
      // Forgetting a key only makes its limit more lenient, never stricter.
      const target = Math.floor(this.maxKeys * 0.9);
      for (const storageKey of this.windows.keys()) {
        if (this.windows.size <= target) break;
        this.windows.delete(storageKey);
      }
    }
  }
}

function dropExpiredHits(window: HitWindow, now: number) {
  const cutoff = now - window.ttl;
  let expired = 0;
  while (expired < window.hits.length && window.hits[expired] <= cutoff) {
    expired++;
  }
  if (expired > 0) window.hits.splice(0, expired);
}

function isIdle(window: HitWindow, now: number): boolean {
  if (window.blockedUntil !== null && window.blockedUntil > now) return false;
  const newestHit = window.hits[window.hits.length - 1];
  return newestHit === undefined || newestHit + window.ttl <= now;
}

function toSeconds(ms: number): number {
  return Math.max(Math.ceil(ms / 1000), 0);
}
