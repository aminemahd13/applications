import * as argon2 from 'argon2';
import {
  ARGON2_OPTIONS,
  hashPassword,
  verifyPassword,
  passwordNeedsRehash,
} from './password.util';

describe('password.util', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('s3cret-password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 's3cret-password')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('uses the configured OWASP-baseline parameters', async () => {
    expect(ARGON2_OPTIONS.memoryCost).toBe(19456);
    expect(ARGON2_OPTIONS.timeCost).toBe(2);
    const hash = await hashPassword('x');
    expect(passwordNeedsRehash(hash)).toBe(false);
  });

  it('flags a legacy heavy-parameter hash as needing rehash, but still verifies it', async () => {
    const legacy = await argon2.hash('x', {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    expect(passwordNeedsRehash(legacy)).toBe(true);
    expect(await verifyPassword(legacy, 'x')).toBe(true);
  });

  it('passwordNeedsRehash is safe on a malformed hash', () => {
    expect(passwordNeedsRehash('not-a-real-hash')).toBe(false);
  });
});
