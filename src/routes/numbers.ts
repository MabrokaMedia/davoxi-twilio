import { Router, Request, Response, NextFunction } from "express";
import { getTwilioClient } from "../services/twilio-client";
import { config } from "../config";

const router = Router();

/**
 * Middleware: verify that the request carries the admin API key.
 */
function adminApiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const adminApiKey = process.env.ADMIN_API_KEY;
  const rawKey = req.headers["x-api-key"];
  const providedKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!adminApiKey || providedKey !== adminApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
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
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /numbers/:sid/configure — Configure a Twilio number to use Davoxi.
 *
 * Sets the voice URL to point to our /voice/incoming webhook.
 */
router.post("/:sid/configure", adminApiKeyAuth, async (req, res) => {
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
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /numbers/:sid/unconfigure — Remove Davoxi from a Twilio number.
 */
router.post("/:sid/unconfigure", adminApiKeyAuth, async (req, res) => {
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
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
