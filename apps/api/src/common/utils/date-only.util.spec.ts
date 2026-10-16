import { parseDateOnlyStrict } from './date-only.util';

describe('parseDateOnlyStrict', () => {
  it('parses a calendar date to UTC midnight', () => {
    expect(parseDateOnlyStrict('2009-01-30')?.toISOString()).toBe(
      '2009-01-30T00:00:00.000Z',
    );
    expect(parseDateOnlyStrict('2000-02-29')?.toISOString()).toBe(
      '2000-02-29T00:00:00.000Z',
    );
  });

  it.each([
    '20009-01-30', // expanded year that new Date() accepts
    '2009-02-30', // not a real day (new Date() rolls it to March)
    '2001-02-29', // not a leap year
    '2009-13-01',
    '2009-00-10',
    '2009-01-00',
    '0000-01-01', // no year 0
    '0099-01-01', // Date.UTC would map it to 1999
    '2009-1-30',
    '2009-01-30T00:00:00.000Z',
    ' 2009-01-30',
    '',
    'not a date',
  ])('rejects %p', (value) => {
    expect(parseDateOnlyStrict(value)).toBeNull();
  });
});
