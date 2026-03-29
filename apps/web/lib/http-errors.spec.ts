import {
  DEFAULT_RATE_LIMIT_MESSAGE,
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
