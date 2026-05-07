import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { getTwilioClient } from "../services/twilio-client";
import { config } from "../config";

const router = Router();

const SID_RE = /^PN[0-9a-fA-F]{32}$/;

const adminLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

router.use(adminLimiter);

/**
 * Middleware: verify that the request carries the admin API key (constant-time compare).
 */
function adminApiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const rawKey = req.headers["x-api-key"];
  const providedKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!adminApiKey || typeof providedKey !== "string") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const a = Buffer.from(providedKey, "utf8");
  const b = Buffer.from(adminApiKey, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

function validateSid(req: Request, res: Response, next: NextFunction): void {
  const sid = String(req.params.sid);
  if (!SID_RE.test(sid)) {
    res.status(400).json({ error: "Invalid phone number SID" });
    return;
  }
  next();
}

function logAndRespond(res: Response, err: unknown, fallback: string, status = 500): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[numbers] ${fallback}: ${message}`);
  res.status(status).json({ error: fallback });
}

/**
 * GET /numbers — List phone numbers configured for Davoxi.
 */
router.get("/", adminApiKeyAuth, async (_req, res) => {
  try {
    const client = getTwilioClient();
    const numbers = await client.incomingPhoneNumbers.list();

    const davoxiNumbers = numbers
      .filter((n) => n.voiceUrl?.includes(config.appUrl))
      .map((n) => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        voiceUrl: n.voiceUrl,
      }));

    res.json(davoxiNumbers);
  } catch (err) {
    logAndRespond(res, err, "Failed to list phone numbers");
  }
});

/**
 * POST /numbers/:sid/configure — Configure a Twilio number to use Davoxi.
 */
router.post("/:sid/configure", adminApiKeyAuth, validateSid, async (req, res) => {
  const sid = String(req.params.sid);

  try {
    const client = getTwilioClient();
    const number = await client.incomingPhoneNumbers(sid).update({
      voiceUrl: `${config.appUrl}/voice/incoming`,
      voiceMethod: "POST",
      statusCallback: `${config.appUrl}/voice/call-status`,
      statusCallbackMethod: "POST",
    });

    res.json({
      success: true,
      phoneNumber: number.phoneNumber,
      message: `${number.phoneNumber} is now connected to Davoxi AI`,
    });
  } catch (err) {
    logAndRespond(res, err, "Failed to configure phone number");
  }
});

/**
 * POST /numbers/:sid/unconfigure — Remove Davoxi from a Twilio number.
 */
router.post("/:sid/unconfigure", adminApiKeyAuth, validateSid, async (req, res) => {
  const sid = String(req.params.sid);

  try {
    const client = getTwilioClient();
    const number = await client.incomingPhoneNumbers(sid).update({
      voiceUrl: "",
      statusCallback: "",
    });

    res.json({
      success: true,
      phoneNumber: number.phoneNumber,
      message: `${number.phoneNumber} disconnected from Davoxi`,
    });
  } catch (err) {
    logAndRespond(res, err, "Failed to unconfigure phone number");
  }
});

export default router;
