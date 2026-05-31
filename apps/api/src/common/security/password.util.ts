import * as argon2 from 'argon2';

function envInt(name: string, fallback: number, min: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

/**
 * Argon2id parameters for password hashing.
 *
 * node-argon2's defaults (memoryCost 64 MiB, timeCost 3) are heavier than
 * necessary and were the dominant cost on the shared libuv threadpool, capping
 * concurrent-login throughput and causing timeouts during deadline traffic
 * spikes. These values follow the OWASP Password Storage baseline for argon2id
 * (m = 19 MiB, t = 2, p = 1) — still strong, but ~3x cheaper on memory and
 * meaningfully faster, so a burst of logins clears the threadpool quickly.
 *
 * Tunable via env (ARGON2_MEMORY_KIB / ARGON2_TIME_COST / ARGON2_PARALLELISM)
 * so ops can adjust the cost/throughput tradeoff without a redeploy.
 */
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: envInt('ARGON2_MEMORY_KIB', 19456, 8192),
  timeCost: envInt('ARGON2_TIME_COST', 2, 1),
  parallelism: envInt('ARGON2_PARALLELISM', 1, 1),
};

/** Hash a plaintext password with the configured argon2id parameters. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** Verify a plaintext password against a stored hash (params read from hash). */
export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * True when a stored hash was produced with stronger/different parameters than
 * the current target — i.e. it should be re-hashed on the next successful login
 * to migrate the user onto the cheaper parameters.
 */
export function passwordNeedsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
