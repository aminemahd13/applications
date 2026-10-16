import {
  DATE_OF_BIRTH_INVALID_MESSAGE,
  todayIsoDate,
  validateDateOfBirthInput,
} from "./date-of-birth";

describe("todayIsoDate", () => {
  it("formats the local date with zero padding", () => {
    expect(todayIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("validateDateOfBirthInput", () => {
  const now = new Date(2026, 9, 16, 12, 0); // 2026-10-16 local

  it("accepts real dates from 1900-01-01 up to today", () => {
    expect(validateDateOfBirthInput("2009-01-30", now)).toBeNull();
    expect(validateDateOfBirthInput("1900-01-01", now)).toBeNull();
    expect(validateDateOfBirthInput("2026-10-16", now)).toBeNull();
    expect(validateDateOfBirthInput("2000-02-29", now)).toBeNull();
  });

  it("allows an empty value (nothing to save)", () => {
    expect(validateDateOfBirthInput("", now)).toBeNull();
    expect(validateDateOfBirthInput("  ", now)).toBeNull();
    expect(validateDateOfBirthInput(undefined, now)).toBeNull();
    expect(validateDateOfBirthInput(null, now)).toBeNull();
  });

  it.each([
    "20009-01-30", // the production 500
    "2009-02-30",
    "2001-02-29",
    "1899-12-31",
    "2026-10-17", // tomorrow
    "0000-01-01",
    "2009-1-30",
    "30/01/2009",
  ])("rejects %p", (value) => {
    expect(validateDateOfBirthInput(value, now)).toBe(
      DATE_OF_BIRTH_INVALID_MESSAGE,
    );
  });
});
