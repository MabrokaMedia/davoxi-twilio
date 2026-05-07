describe("stream-token", () => {
  const ORIGINAL_SECRET = process.env.STREAM_TOKEN_SECRET;

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.STREAM_TOKEN_SECRET;
    } else {
      process.env.STREAM_TOKEN_SECRET = ORIGINAL_SECRET;
    }
    jest.resetModules();
  });

  it("returns null when secret is not set", () => {
    delete process.env.STREAM_TOKEN_SECRET;
    const { issueStreamToken, verifyStreamToken, isStreamTokenEnforced } = require("../services/stream-token");
    expect(issueStreamToken("CA123")).toBeNull();
    expect(verifyStreamToken("anything")).toBeNull();
    expect(isStreamTokenEnforced()).toBe(false);
  });

  it("returns null when secret is shorter than 16 chars", () => {
    process.env.STREAM_TOKEN_SECRET = "short";
    const { issueStreamToken, isStreamTokenEnforced } = require("../services/stream-token");
    expect(issueStreamToken("CA123")).toBeNull();
    expect(isStreamTokenEnforced()).toBe(false);
  });

  it("issues and verifies a valid token", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    const { issueStreamToken, verifyStreamToken, isStreamTokenEnforced } = require("../services/stream-token");
    expect(isStreamTokenEnforced()).toBe(true);
    const token = issueStreamToken("CA12345678");
    expect(typeof token).toBe("string");
    const payload = verifyStreamToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.callSid).toBe("CA12345678");
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it("rejects expired tokens", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    const { issueStreamToken, verifyStreamToken } = require("../services/stream-token");
    const past = Date.now() - 10 * 60 * 1000;
    const token = issueStreamToken("CA1", past);
    expect(verifyStreamToken(token)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    const { issueStreamToken, verifyStreamToken } = require("../services/stream-token");
    const token = issueStreamToken("CA1")!;
    const tampered = token.slice(0, -2) + "ff";
    expect(verifyStreamToken(tampered)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    const { verifyStreamToken } = require("../services/stream-token");
    expect(verifyStreamToken(undefined)).toBeNull();
    expect(verifyStreamToken("")).toBeNull();
    expect(verifyStreamToken("a.b")).toBeNull();
    expect(verifyStreamToken("a.b.c.d")).toBeNull();
  });

  it("rejects token signed with a different secret", () => {
    process.env.STREAM_TOKEN_SECRET = "a".repeat(32);
    jest.resetModules();
    const issuer = require("../services/stream-token");
    const token = issuer.issueStreamToken("CA1")!;

    process.env.STREAM_TOKEN_SECRET = "b".repeat(32);
    jest.resetModules();
    const verifier = require("../services/stream-token");
    expect(verifier.verifyStreamToken(token)).toBeNull();
  });
});
