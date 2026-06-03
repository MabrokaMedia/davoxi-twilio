/**
 * Tests for decideStreamUpgrade — the verifyClient policy used by the
 * /media-stream WebSocket upgrade. Production fails closed when
 * STREAM_TOKEN_SECRET is unset; non-prod logs a warning and allows.
 */

describe("decideStreamUpgrade", () => {
  const ORIGINAL_SECRET = process.env.STREAM_TOKEN_SECRET;

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.STREAM_TOKEN_SECRET;
    } else {
      process.env.STREAM_TOKEN_SECRET = ORIGINAL_SECRET;
    }
    jest.resetModules();
  });

  it("rejects with 503 in production when STREAM_TOKEN_SECRET is unset", () => {
    delete process.env.STREAM_TOKEN_SECRET;
    jest.resetModules();
    const { decideStreamUpgrade } = require("../server");
    const decision = decideStreamUpgrade("/media-stream", "production");
    expect(decision.allow).toBe(false);
    expect(decision.code).toBe(503);
  });

  it("allows in development when STREAM_TOKEN_SECRET is unset (with warning)", () => {
    delete process.env.STREAM_TOKEN_SECRET;
    jest.resetModules();
    const { decideStreamUpgrade } = require("../server");
    const decision = decideStreamUpgrade("/media-stream", "development");
    expect(decision.allow).toBe(true);
    expect(decision.payload).toBeUndefined();
  });

  it("allows in test when STREAM_TOKEN_SECRET is unset", () => {
    delete process.env.STREAM_TOKEN_SECRET;
    jest.resetModules();
    const { decideStreamUpgrade } = require("../server");
    const decision = decideStreamUpgrade("/media-stream", "test");
    expect(decision.allow).toBe(true);
  });

  it("allows in production when STREAM_TOKEN_SECRET is set and token is valid", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    jest.resetModules();
    const { decideStreamUpgrade } = require("../server");
    const { issueStreamToken } = require("../services/stream-token");
    const token = issueStreamToken("CA12345678");
    expect(typeof token).toBe("string");

    const decision = decideStreamUpgrade(`/media-stream?token=${token}`, "production");
    expect(decision.allow).toBe(true);
    expect(decision.payload?.callSid).toBe("CA12345678");
  });

  it("rejects with 401 in production when token is missing", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    jest.resetModules();
    const { decideStreamUpgrade } = require("../server");
    const decision = decideStreamUpgrade("/media-stream", "production");
    expect(decision.allow).toBe(false);
    expect(decision.code).toBe(401);
  });

  it("rejects with 401 when token is tampered", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    jest.resetModules();
    const { decideStreamUpgrade } = require("../server");
    const { issueStreamToken } = require("../services/stream-token");
    const token = issueStreamToken("CA12345678");
    const tampered = token.slice(0, -2) + "ff";

    const decision = decideStreamUpgrade(`/media-stream?token=${tampered}`, "production");
    expect(decision.allow).toBe(false);
    expect(decision.code).toBe(401);
  });

  it("rejects when token is valid but TTL has expired", () => {
    process.env.STREAM_TOKEN_SECRET = "x".repeat(32);
    jest.resetModules();
    const { decideStreamUpgrade } = require("../server");
    const { issueStreamToken } = require("../services/stream-token");
    const stale = issueStreamToken("CA12345678", Date.now() - 10 * 60 * 1000);

    const decision = decideStreamUpgrade(`/media-stream?token=${stale}`, "production");
    expect(decision.allow).toBe(false);
    expect(decision.code).toBe(401);
  });
});
