import { describeSignupSuccess, parseSignupOutcome } from "./signup-outcome";

describe("parseSignupOutcome", () => {
  it("reads whether the verification email was sent", () => {
    expect(parseSignupOutcome({ verificationEmailSent: true })).toEqual({
      verificationEmailSent: true,
      verificationRetryAfterSeconds: null,
    });
    expect(
      parseSignupOutcome({
        verificationEmailSent: false,
        verificationRetryAfterSeconds: 1800,
      }),
    ).toEqual({
      verificationEmailSent: false,
      verificationRetryAfterSeconds: 1800,
    });
  });

  it("assumes the email was sent when an older API doesn't say", () => {
    expect(parseSignupOutcome({ id: "u1" })).toEqual({
      verificationEmailSent: true,
      verificationRetryAfterSeconds: null,
    });
    expect(parseSignupOutcome(null).verificationEmailSent).toBe(true);
  });

  it("ignores an invalid retry value", () => {
    expect(
      parseSignupOutcome({
        verificationEmailSent: false,
        verificationRetryAfterSeconds: "soon",
      }).verificationRetryAfterSeconds,
    ).toBeNull();
  });
});

describe("describeSignupSuccess", () => {
  it("keeps the existing messages when the email was sent or not required", () => {
    expect(
      describeSignupSuccess(
        { verificationEmailSent: true, verificationRetryAfterSeconds: null },
        true,
      ),
    ).toEqual({
      title: "Check your email",
      description:
        "We've sent a verification link to your email address. Please check your inbox and click the link to activate your account.",
    });
    expect(
      describeSignupSuccess(
        { verificationEmailSent: false, verificationRetryAfterSeconds: null },
        false,
      ).title,
    ).toBe("Account created");
  });

  it("does not claim an email was sent when the per-email limit was hit", () => {
    const { title, description } = describeSignupSuccess(
      { verificationEmailSent: false, verificationRetryAfterSeconds: 1740 },
      true,
    );
    expect(title).toBe("Verify your email");
    expect(description).toContain("Your account is created");
    expect(description).toContain("in 29 minutes");
    expect(description).not.toContain("We've sent");
  });

  it("does not claim an email was sent when delivery failed", () => {
    const { description } = describeSignupSuccess(
      { verificationEmailSent: false, verificationRetryAfterSeconds: null },
      true,
    );
    expect(description).toContain("couldn't send the verification email");
    expect(description).not.toContain("We've sent");
  });
});
