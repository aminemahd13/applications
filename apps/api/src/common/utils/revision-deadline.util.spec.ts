import { BadRequestException } from '@nestjs/common';
import { resolveEffectiveRevisionDeadline } from './revision-deadline.util';

describe('resolveEffectiveRevisionDeadline', () => {
  const stepDeadline = new Date('2026-12-15T00:00:00.000Z');

  it('has no deadline when neither the step nor the request sets one', () => {
    expect(resolveEffectiveRevisionDeadline(null)).toBeNull();
    expect(resolveEffectiveRevisionDeadline(undefined)).toBeNull();
  });

  it("falls back to the step's deadline", () => {
    expect(resolveEffectiveRevisionDeadline(stepDeadline)).toBe(stepDeadline);
  });

  it('uses the requested deadline when the step has none', () => {
    const requested = new Date('2027-01-01T00:00:00.000Z');
    expect(resolveEffectiveRevisionDeadline(null, requested)).toBe(requested);
  });

  it("may shorten the step's deadline, or match it", () => {
    const earlier = new Date('2026-12-01T00:00:00.000Z');
    expect(resolveEffectiveRevisionDeadline(stepDeadline, earlier)).toBe(earlier);
    const same = new Date(stepDeadline.getTime());
    expect(resolveEffectiveRevisionDeadline(stepDeadline, same)).toBe(same);
  });

  it("refuses to extend the step's deadline", () => {
    expect(() =>
      resolveEffectiveRevisionDeadline(
        stepDeadline,
        new Date('2026-12-20T00:00:00.000Z'),
      ),
    ).toThrow(BadRequestException);
  });
});
