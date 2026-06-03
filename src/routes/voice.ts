import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { twiml as TwiML } from "twilio";
import { config } from "../config";
import { validateTwilioRequest } from "../services/twilio-client";
import { issueStreamToken, isStreamTokenEnforced } from "../services/stream-token";

const router = Router();

const voiceLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

router.use(voiceLimiter);

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
 */
router.post("/incoming", twilioWebhookAuth, (req, res) => {
  const response = new TwiML.VoiceResponse();
  const callSid = (req.body as Record<string, string>)?.CallSid || "unknown";

  response.say(
    { voice: "Polly.Amy" },
    "Please hold while we connect you to our AI assistant.",
  );

  let streamUrl = `${config.wsUrl}/media-stream`;
  const token = issueStreamToken(callSid);
  if (token) {
    streamUrl = `${streamUrl}?token=${encodeURIComponent(token)}`;
  } else if (!isStreamTokenEnforced()) {
    console.warn(
      "[voice] STREAM_TOKEN_SECRET not set — /media-stream is unauthenticated. Set STREAM_TOKEN_SECRET (≥16 chars) in production.",
    );
  }

  const connect = response.connect();
  connect.stream({
    url: streamUrl,
    statusCallback: `${config.appUrl}/voice/stream-status`,
    statusCallbackMethod: "POST",
  });

  res.type("text/xml");
  res.send(response.toString());
});

/**
 * POST /voice/stream-status — Receive media stream status updates.
 */
router.post("/stream-status", twilioWebhookAuth, (req, res) => {
  const { StreamSid, StreamStatus, CallSid } = req.body as {
    StreamSid?: string;
    StreamStatus?: string;
    CallSid?: string;
  };

  console.log(
    `Stream ${JSON.stringify(StreamSid)} for call ${JSON.stringify(CallSid)}: ${JSON.stringify(StreamStatus)}`,
  );
  res.status(200).send();
});

/**
 * POST /voice/call-status — Receive call status updates.
 */
router.post("/call-status", twilioWebhookAuth, (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body as {
    CallSid?: string;
    CallStatus?: string;
    CallDuration?: string;
  };

  console.log(
    `Call ${JSON.stringify(CallSid)}: ${JSON.stringify(CallStatus)} (duration: ${JSON.stringify(CallDuration)}s)`,
  );
  res.status(200).send();
});

export default router;
