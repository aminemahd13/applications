import {
  classifySessionResponse,
  hasAuthenticatedUser,
} from "./session-validation";

describe("classifySessionResponse", () => {
  it("is valid only when the API confirms a user", () => {
    expect(classifySessionResponse(200, { authenticated: true })).toBe("valid");
    expect(classifySessionResponse(200, { user: { id: "u1" } })).toBe("valid");
    expect(classifySessionResponse(200, { id: "u1" })).toBe("valid");
  });

  it("is invalid only on an explicit no-session answer", () => {
    expect(classifySessionResponse(401, null)).toBe("invalid");
    expect(classifySessionResponse(200, { authenticated: false })).toBe(
      "invalid",
    );
    expect(classifySessionResponse(200, { user: null })).toBe("invalid");
  });

  it("is unknown for anything else", () => {
    expect(classifySessionResponse(200, null)).toBe("unknown"); // unparseable body
    expect(classifySessionResponse(200, {})).toBe("unknown");
    expect(classifySessionResponse(200, { authenticated: "no" })).toBe(
      "unknown",
    );
    expect(classifySessionResponse(403, null)).toBe("unknown");
    expect(classifySessionResponse(408, null)).toBe("unknown");
    expect(classifySessionResponse(429, null)).toBe("unknown");
  });
});

describe("hasAuthenticatedUser", () => {
  it("requires a non-empty string id", () => {
    expect(hasAuthenticatedUser({ user: { id: "u1" } })).toBe(true);
    expect(hasAuthenticatedUser({ user: { id: "" } })).toBe(false);
    expect(hasAuthenticatedUser({ user: { id: 1 } })).toBe(false);
    expect(hasAuthenticatedUser({ user: null })).toBe(false);
    expect(hasAuthenticatedUser(null)).toBe(false);
  });
});
