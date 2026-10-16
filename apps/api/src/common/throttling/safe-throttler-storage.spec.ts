import { Reflector } from '@nestjs/core';
import {
  Throttle,
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { SafeThrottlerStorage } from './safe-throttler-storage';

describe('SafeThrottlerStorage', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function manualClock(start = 1_000_000) {
    let current = start;
    return {
      now: () => current,
      advance: (ms: number) => {
        current += ms;
      },
    };
  }

  /**
   * Port of the production reproduction (scratchpad throttle-repro.js): once
   * client A's block expires, @nestjs/throttler 6.5.0's in-memory storage
   * cancels the expiry timers of every key under the same throttler name, so
   * client B's count never decays and B gets blocked days later.
   */
  async function runReproScenario(storage: ThrottlerStorage) {
    const TTL = 300;
    const LIMIT = 3;
    const NAME = 'default';
    const hit = (key: string) =>
      storage.increment(key, TTL, LIMIT, TTL, NAME);

    await hit('B');
    await hit('B');
    for (let i = 0; i < 4; i++) await hit('A');
    jest.advanceTimersByTime(TTL + 50);

    await hit('B');
    await hit('B');
    await hit('A'); // A's block has expired.
    jest.advanceTimersByTime(TTL * 4);

    const bAfterIdle = await hit('B');
    const bNext = await hit('B');
    return { bAfterIdle, bNext };
  }

  it("does not freeze other clients' counts when one client's block expires", async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const { bAfterIdle, bNext } = await runReproScenario(
      new SafeThrottlerStorage(),
    );

    expect(bAfterIdle).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(bNext).toMatchObject({ totalHits: 2, isBlocked: false });
  });

  it('blocks the hit that exceeds the limit and reports the block in seconds', async () => {
    const clock = manualClock();
    const storage = new SafeThrottlerStorage({ now: clock.now });

    for (let i = 1; i <= 3; i++) {
      const record = await storage.increment('k', 60_000, 3, 30_000, 'default');
      expect(record).toEqual({
        totalHits: i,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    }

    await expect(
      storage.increment('k', 60_000, 3, 30_000, 'default'),
    ).resolves.toEqual({
      totalHits: 4,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
  });

  it('does not count hits while blocked and starts over once the block ends', async () => {
    const clock = manualClock();
    const storage = new SafeThrottlerStorage({ now: clock.now });
    const hit = () => storage.increment('k', 900_000, 2, 60_000, 'default');

    await hit();
    await hit();
    await expect(hit()).resolves.toMatchObject({ isBlocked: true });

    clock.advance(59_500);
    await expect(hit()).resolves.toEqual(
      expect.objectContaining({
        totalHits: 3,
        isBlocked: true,
        timeToBlockExpire: 1,
      }),
    );

    // Block over (shorter than the window): fresh budget, as in the library.
    clock.advance(500);
    await expect(hit()).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    await expect(hit()).resolves.toMatchObject({
      totalHits: 2,
      isBlocked: false,
    });
  });

  it('expires each hit ttl after it happened (sliding window)', async () => {
    const clock = manualClock();
    const storage = new SafeThrottlerStorage({ now: clock.now });
    const hit = () => storage.increment('k', 1_000, 5, 1_000, 'default');

    await hit(); // t=0
    clock.advance(400);
    await hit(); // t=400
    clock.advance(600); // t=1000: first hit expired, second still counted

    await expect(hit()).resolves.toMatchObject({
      totalHits: 2,
      timeToExpire: 1, // the t=400 hit expires in 400 ms
    });

    clock.advance(1_000);
    await expect(hit()).resolves.toMatchObject({ totalHits: 1 });
  });

  it('keeps keys and throttler names independent', async () => {
    const clock = manualClock();
    const storage = new SafeThrottlerStorage({ now: clock.now });

    await storage.increment('a', 60_000, 1, 60_000, 'default');
    await expect(
      storage.increment('a', 60_000, 1, 60_000, 'default'),
    ).resolves.toMatchObject({ isBlocked: true });

    await expect(
      storage.increment('b', 60_000, 1, 60_000, 'default'),
    ).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
    await expect(
      storage.increment('a', 60_000, 1, 60_000, 'other'),
    ).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('sweeps idle keys but keeps active and blocked ones', async () => {
    const clock = manualClock();
    const storage = new SafeThrottlerStorage({
      now: clock.now,
      sweepIntervalMs: 10_000,
    });

    await storage.increment('idle', 1_000, 10, 1_000, 'default');
    await storage.increment('blocked', 1_000, 0, 60_000, 'default');
    await storage.increment('active', 30_000, 10, 1_000, 'default');
    expect(storage.size).toBe(3);

    clock.advance(10_000);
    await storage.increment('trigger', 1_000, 10, 1_000, 'default');

    expect(storage.size).toBe(3); // 'idle' removed, 'trigger' added
    await expect(
      storage.increment('blocked', 1_000, 0, 60_000, 'default'),
    ).resolves.toMatchObject({ isBlocked: true });
    await expect(
      storage.increment('active', 30_000, 10, 1_000, 'default'),
    ).resolves.toMatchObject({ totalHits: 2 });
  });

  it('caps the number of tracked keys', async () => {
    const clock = manualClock();
    const storage = new SafeThrottlerStorage({
      now: clock.now,
      sweepIntervalMs: 60_000,
      maxKeys: 10,
    });

    for (let i = 0; i < 25; i++) {
      await storage.increment(`k${i}`, 60_000, 100, 60_000, 'default');
    }

    expect(storage.size).toBeLessThanOrEqual(10);
    // The newest key is still tracked.
    await expect(
      storage.increment('k24', 60_000, 100, 60_000, 'default'),
    ).resolves.toMatchObject({ totalHits: 2 });
  });

  describe('with ThrottlerGuard', () => {
    class TestController {
      @Throttle({ default: { limit: 2, ttl: 60_000, blockDuration: 30_000 } })
      limited() {
        return 'ok';
      }
    }

    async function makeGuard(storage: ThrottlerStorage) {
      const guard = new ThrottlerGuard(
        {
          throttlers: [{ name: 'default', ttl: 60_000, limit: 1000 }],
          storage,
        },
        storage,
        new Reflector(),
      );
      await guard.onModuleInit();
      return guard;
    }

    function makeContext(ip: string) {
      const headers: Record<string, unknown> = {};
      const res = {
        header: jest.fn((name: string, value: unknown) => {
          headers[name] = value;
        }),
      };
      const context = {
        getHandler: () => Reflect.get(TestController.prototype, 'limited'),
        getClass: () => TestController,
        switchToHttp: () => ({
          getRequest: () => ({ ip, headers: {} }),
          getResponse: () => res,
        }),
      } as any;
      return { context, headers };
    }

    it('keeps rate-limit headers and 429s working', async () => {
      const clock = manualClock();
      const guard = await makeGuard(new SafeThrottlerStorage({ now: clock.now }));

      const first = makeContext('203.0.113.1');
      await expect(guard.canActivate(first.context)).resolves.toBe(true);
      expect(first.headers).toEqual({
        'X-RateLimit-Limit': 2,
        'X-RateLimit-Remaining': 1,
        'X-RateLimit-Reset': 60,
      });

      await expect(
        guard.canActivate(makeContext('203.0.113.1').context),
      ).resolves.toBe(true);

      const blocked = makeContext('203.0.113.1');
      await expect(guard.canActivate(blocked.context)).rejects.toBeInstanceOf(
        ThrottlerException,
      );
      expect(blocked.headers['Retry-After']).toBe(30);

      // Another client is unaffected.
      await expect(
        guard.canActivate(makeContext('203.0.113.2').context),
      ).resolves.toBe(true);

      clock.advance(30_000);
      await expect(
        guard.canActivate(makeContext('203.0.113.1').context),
      ).resolves.toBe(true);
    });
  });
});
