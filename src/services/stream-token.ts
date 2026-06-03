import crypto from "crypto";

const TOKEN_TTL_MS = 5 * 60 * 1000;

function getSecret(): string | null {
  const secret = process.env.STREAM_TOKEN_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export interface StreamTokenPayload {
  callSid: string;
  exp: number;
}

export function issueStreamToken(callSid: string, now: number = Date.now()): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = now + TOKEN_TTL_MS;
  const payload = `${callSid}.${exp}`;
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyStreamToken(token: string | undefined | null, now: number = Date.now()): StreamTokenPayload | null {
  const secret = getSecret();
  if (!secret) {
    return null;
  }
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [callSid, expStr, sig] = parts;
  if (!callSid || !expStr || !sig) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return null;

  const expected = sign(`${callSid}.${expStr}`, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  return { callSid, exp };
}

export function isStreamTokenEnforced(): boolean {
  return getSecret() !== null;
}
