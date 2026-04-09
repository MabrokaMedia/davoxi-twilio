import crypto from "crypto";

const TOKEN_TTL_MS = 30_000; // tokens expire after 30 seconds

// Map of token → expiry timestamp (epoch ms)
export const _pendingTokens = new Map<string, number>();

// Periodically purge stale tokens so the map doesn't grow unbounded
const _cleanup = setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of _pendingTokens) {
    if (now > expiry) _pendingTokens.delete(token);
  }
}, TOKEN_TTL_MS);

// Allow Jest to garbage-collect the interval after tests
if (typeof _cleanup.unref === "function") _cleanup.unref();

/**
 * Generate a cryptographically random, single-use stream token.
 * The token is stored with a 30-second TTL.
 */
export function generateStreamToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  _pendingTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

/**
 * Validate and consume a stream token.
 * Returns true if the token exists and has not expired; deletes it (one-time use).
 * Returns false for unknown, expired, or already-consumed tokens.
 */
export function consumeStreamToken(token: string): boolean {
  const expiry = _pendingTokens.get(token);
  if (expiry === undefined || Date.now() > expiry) return false;
  _pendingTokens.delete(token);
  return true;
}
