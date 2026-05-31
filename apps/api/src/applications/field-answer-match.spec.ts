import { matchesFieldAnswer } from '@event-platform/shared';

describe('matchesFieldAnswer', () => {
  it('any: single-value answer is one of the values', () => {
    expect(matchesFieldAnswer('python', 'any', ['python', 'go'])).toBe(true);
    expect(matchesFieldAnswer('rust', 'any', ['python', 'go'])).toBe(false);
  });

  it('any: array answer intersects values', () => {
    expect(matchesFieldAnswer(['a', 'b'], 'any', ['b', 'c'])).toBe(true);
    expect(matchesFieldAnswer(['a'], 'any', ['b', 'c'])).toBe(false);
  });

  it('all: array contains every value', () => {
    expect(matchesFieldAnswer(['a', 'b', 'c'], 'all', ['a', 'b'])).toBe(true);
    expect(matchesFieldAnswer(['a'], 'all', ['a', 'b'])).toBe(false);
  });

  it('none: answer has none of the values (including no answer)', () => {
    expect(matchesFieldAnswer(['x'], 'none', ['a', 'b'])).toBe(true);
    expect(matchesFieldAnswer(undefined, 'none', ['a'])).toBe(true);
    expect(matchesFieldAnswer(['a'], 'none', ['a'])).toBe(false);
  });

  it('equals: case-insensitive equality against any value', () => {
    expect(matchesFieldAnswer('Yes', 'equals', ['yes'])).toBe(true);
    expect(matchesFieldAnswer('No', 'equals', ['yes'])).toBe(false);
  });

  it('contains: case-insensitive substring against any value', () => {
    expect(matchesFieldAnswer('I love Rust', 'contains', ['rust'])).toBe(true);
    expect(matchesFieldAnswer('I love Go', 'contains', ['rust'])).toBe(false);
  });

  it('not_contains: none of the fragments are present', () => {
    expect(matchesFieldAnswer('hello world', 'not_contains', ['xyz'])).toBe(
      true,
    );
    expect(matchesFieldAnswer('hello world', 'not_contains', ['world'])).toBe(
      false,
    );
  });

  it('no answer never matches any/all', () => {
    expect(matchesFieldAnswer(undefined, 'any', ['a'])).toBe(false);
    expect(matchesFieldAnswer(null, 'all', ['a'])).toBe(false);
  });

  it('empty values never match', () => {
    expect(matchesFieldAnswer('a', 'any', [])).toBe(false);
  });
});
