import { Router } from "express";
import { twiml as TwiML } from "twilio";
import { config } from "../config";

const router = Router();

/**
 * POST /voice/incoming — Handle incoming Twilio voice calls.
 *
 * Returns TwiML that connects the call to Davoxi's AI voice agent
 * via a bidirectional Media Stream WebSocket.
 */
router.post("/incoming", (req, res) => {
  const response = new TwiML.VoiceResponse();

  // Optional: play a greeting while connecting
  response.say(
    { voice: "Polly.Amy" },
    "Please hold while we connect you to our AI assistant.",
  );

  // Connect to Davoxi via bidirectional media stream
  const connect = response.connect();
  connect.stream({
    url: `${config.wsUrl}/media-stream`,
    statusCallback: `${config.appUrl}/voice/stream-status`,
    statusCallbackMethod: "POST",
  });

  res.type("text/xml");
  res.send(response.toString());
});

/**
 * POST /voice/stream-status — Receive media stream status updates.
 */
router.post("/stream-status", (req, res) => {
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
router.post("/call-status", (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body as {
    CallSid?: string;
    CallStatus?: string;
    CallDuration?: string;
  };

  console.log(`Call ${CallSid}: ${CallStatus} (duration: ${CallDuration}s)`);
  res.status(200).send();
});

export default router;
