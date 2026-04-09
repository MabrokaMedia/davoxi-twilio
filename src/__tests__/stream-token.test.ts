import {
  generateStreamToken,
  consumeStreamToken,
  _pendingTokens,
} from "../services/stream-token";

beforeEach(() => {
  _pendingTokens.clear();
});

describe("generateStreamToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateStreamToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores the token with a future expiry", () => {
    const before = Date.now();
    const token = generateStreamToken();
    const expiry = _pendingTokens.get(token);
    expect(expiry).toBeDefined();
    expect(expiry!).toBeGreaterThan(before);
  });

  it("generates unique tokens on successive calls", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateStreamToken));
    expect(tokens.size).toBe(100);
  });
});

describe("consumeStreamToken", () => {
  it("returns true and removes a valid token on first use", () => {
    const token = generateStreamToken();
    expect(consumeStreamToken(token)).toBe(true);
    expect(_pendingTokens.has(token)).toBe(false);
  });

  it("returns false for an unknown token", () => {
    expect(consumeStreamToken("not-a-real-token")).toBe(false);
  });

  it("returns false if the same token is presented twice (one-time use)", () => {
    const token = generateStreamToken();
    expect(consumeStreamToken(token)).toBe(true);
    expect(consumeStreamToken(token)).toBe(false);
  });

  it("returns false for an expired token", () => {
    const token = generateStreamToken();
    // Manually wind the expiry into the past
    _pendingTokens.set(token, Date.now() - 1);
    expect(consumeStreamToken(token)).toBe(false);
  });
});
