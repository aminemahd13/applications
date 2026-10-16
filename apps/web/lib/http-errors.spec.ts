import {
  DEFAULT_RATE_LIMIT_MESSAGE,
  formatRetryWait,
  resolveHttpErrorMessage,
} from "./http-errors";

describe("resolveHttpErrorMessage", () => {
  it("normalizes raw throttler messages for 429 responses", () => {
    expect(
      resolveHttpErrorMessage(429, {
        message: "ThrottlerException: Too Many Requests",
      })
    ).toBe(DEFAULT_RATE_LIMIT_MESSAGE);

    expect(resolveHttpErrorMessage(429, { message: "Too Many Requests" })).toBe(
      DEFAULT_RATE_LIMIT_MESSAGE
    );
  });

  it("preserves explicit 429 messages from the API", () => {
    expect(
      resolveHttpErrorMessage(429, {
        message: "Too many signup attempts. Please wait before trying again.",
      })
    ).toBe("Too many signup attempts. Please wait before trying again.");
  });

  it("tells the user how long to wait when the API says so", () => {
    expect(
      resolveHttpErrorMessage(429, {
        code: "RATE_LIMITED",
        message:
          "Too many verification emails were requested for this address. Check your inbox and spam folder for an earlier email.",
        retryAfterSeconds: 1740,
      })
    ).toBe(
      "Too many verification emails were requested for this address. Check your inbox and spam folder for an earlier email. Try again in 29 minutes."
    );

    expect(
      resolveHttpErrorMessage(429, {
        message: DEFAULT_RATE_LIMIT_MESSAGE,
        retryAfterSeconds: 60,
      })
    ).toBe("Too many requests. Please try again in 1 minute.");

    expect(
      resolveHttpErrorMessage(429, {
        message: "ThrottlerException: Too Many Requests",
        retryAfterSeconds: 45,
      })
    ).toBe("Too many requests. Please try again in 45 seconds.");

    expect(
      resolveHttpErrorMessage(429, { message: "Slow down", retryAfterSeconds: 1 })
    ).toBe("Slow down. Try again in 1 second.");
  });

  it("ignores missing or invalid retryAfterSeconds", () => {
    expect(
      resolveHttpErrorMessage(429, { message: "Slow down.", retryAfterSeconds: 0 })
    ).toBe("Slow down.");
    expect(
      resolveHttpErrorMessage(429, { message: "Slow down.", retryAfterSeconds: "60" })
    ).toBe("Slow down.");
    // Only 429s carry a wait.
    expect(
      resolveHttpErrorMessage(400, { message: "Bad", retryAfterSeconds: 60 })
    ).toBe("Bad");
  });

  it("returns extracted message for non-429 responses", () => {
    expect(
      resolveHttpErrorMessage(400, {
        message: ["Invalid email", "Password is required"],
      })
    ).toBe("Invalid email Password is required");
  });

  it("falls back when no message is present", () => {
    expect(resolveHttpErrorMessage(500, {})).toBe("Error 500");
    expect(resolveHttpErrorMessage(401, {}, "Unauthorized")).toBe(
      "Unauthorized"
    );
  });
});

describe("formatRetryWait", () => {
  it("uses seconds under a minute and rounds minutes up", () => {
    expect(formatRetryWait(1)).toBe("1 second");
    expect(formatRetryWait(58.2)).toBe("59 seconds");
    expect(formatRetryWait(59.2)).toBe("1 minute");
    expect(formatRetryWait(60)).toBe("1 minute");
    expect(formatRetryWait(61)).toBe("2 minutes");
    expect(formatRetryWait(900)).toBe("15 minutes");
    expect(formatRetryWait(3600)).toBe("60 minutes");
  });

  it("returns null when there is nothing to wait for", () => {
    expect(formatRetryWait(0)).toBeNull();
    expect(formatRetryWait(-5)).toBeNull();
    expect(formatRetryWait(null)).toBeNull();
    expect(formatRetryWait(undefined)).toBeNull();
    expect(formatRetryWait(Number.NaN)).toBeNull();
  });
});
