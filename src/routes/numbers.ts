import { Router } from "express";
import { getTwilioClient } from "../services/twilio-client";
import { config } from "../config";

const router = Router();

/**
 * GET /numbers — List phone numbers configured for Davoxi.
 */
router.get("/", async (_req, res) => {
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
router.post("/:sid/configure", async (req, res) => {
  const { sid } = req.params;

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
router.post("/:sid/unconfigure", async (req, res) => {
  const { sid } = req.params;

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
