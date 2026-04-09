import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { twiml as TwiML } from "twilio";
import { config } from "../config";
import { validateTwilioRequest } from "../services/twilio-client";
import { generateStreamToken } from "../services/stream-token";

const router = Router();

// 200 webhook calls per minute per IP (Twilio traffic)
const voiceRateLimit = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/**
 * Middleware: verify that the incoming request carries a valid Twilio signature.
 */
function twilioWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const signature = (req.headers["x-twilio-signature"] as string) || "";
  const url = `${config.appUrl}${req.originalUrl}`;
  const params = req.body as Record<string, string>;

  if (!validateTwilioRequest(signature, url, params)) {
    res.status(403).json({ error: "Invalid Twilio signature" });
    return;
  }

  next();
}

/**
 * POST /voice/incoming — Handle incoming Twilio voice calls.
 *
 * Returns TwiML that connects the call to Davoxi's AI voice agent
 * via a bidirectional Media Stream WebSocket.
 */
router.post("/incoming", voiceRateLimit, twilioWebhookAuth, (req, res) => {
  const response = new TwiML.VoiceResponse();

  // Optional: play a greeting while connecting
  response.say(
    { voice: "Polly.Amy" },
    "Please hold while we connect you to our AI assistant.",
  );

  // Generate a short-lived, single-use token so only Twilio can open the WS
  const streamToken = generateStreamToken();

  // Connect to Davoxi via bidirectional media stream
  const connect = response.connect();
  connect.stream({
    url: `${config.wsUrl}/media-stream?token=${streamToken}`,
    statusCallback: `${config.appUrl}/voice/stream-status`,
    statusCallbackMethod: "POST",
  });

  res.type("text/xml");
  res.send(response.toString());
});

/**
 * POST /voice/stream-status — Receive media stream status updates.
 */
router.post("/stream-status", voiceRateLimit, twilioWebhookAuth, (req, res) => {
  const { StreamSid, StreamStatus, CallSid } = req.body as {
    StreamSid?: string;
    StreamStatus?: string;
    CallSid?: string;
  };

  console.log(`Stream ${StreamSid} for call ${CallSid}: ${StreamStatus}`);
  res.status(200).send();
});

/**
 * POST /voice/call-status — Receive call status updates.
 */
router.post("/call-status", voiceRateLimit, twilioWebhookAuth, (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body as {
    CallSid?: string;
    CallStatus?: string;
    CallDuration?: string;
  };

  console.log(`Call ${CallSid}: ${CallStatus} (duration: ${CallDuration}s)`);
  res.status(200).send();
});

export default router;
