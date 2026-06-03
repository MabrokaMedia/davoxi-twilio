import WebSocket from "ws";
import { config } from "../config";
import { StreamTokenPayload } from "./stream-token";

interface MediaStreamMessage {
  event: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
  };
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // base64-encoded audio
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
}

/**
 * Handle a bidirectional media stream WebSocket connection from Twilio.
 *
 * This bridges Twilio's media stream to the Davoxi voice AI platform:
 * 1. Receives audio from caller via Twilio
 * 2. Forwards to Davoxi's voice AI for processing
 * 3. Sends AI-generated audio back to Twilio → caller
 *
 * `tokenPayload`, when provided, pins the stream to the CallSid that was
 * baked into the token at /voice/incoming time. A `start` frame whose
 * `callSid` does not match the token is rejected and the socket is closed —
 * a leaked or replayed token cannot be used to impersonate another call.
 */
export function handleMediaStream(ws: WebSocket, tokenPayload?: StreamTokenPayload): void {
  let streamSid: string | null = null;
  let callSid: string | null = null;
  let davoxiWs: WebSocket | null = null;

  ws.on("message", (data) => {
    let msg: MediaStreamMessage;
    try {
      msg = JSON.parse(data.toString()) as MediaStreamMessage;
    } catch {
      return;
    }

    switch (msg.event) {
      case "connected":
        console.log("Twilio media stream connected");
        break;

      case "start":
        if (tokenPayload && msg.start!.callSid !== tokenPayload.callSid) {
          console.error(
            `Stream token callSid mismatch (token=${tokenPayload.callSid} start=${msg.start!.callSid}); closing connection`,
          );
          ws.close(1008, "callSid mismatch");
          return;
        }
        streamSid = msg.start!.streamSid;
        callSid = msg.start!.callSid;
        console.log(`Media stream started: ${streamSid} (call: ${callSid})`);

        // Connect to Davoxi voice AI WebSocket
        const davoxiWsUrl = config.davoxi.apiUrl
          .replace("https://", "wss://")
          .replace("http://", "ws://");

        davoxiWs = new WebSocket(`${davoxiWsUrl}/voice/stream`, {
          headers: {
            Authorization: `Bearer ${config.davoxi.apiKey}`,
            "X-Call-Sid": callSid,
            "X-Stream-Sid": streamSid,
          },
        });

        davoxiWs.on("open", () => {
          console.log("Connected to Davoxi voice AI");
        });

        // Forward AI audio back to Twilio
        davoxiWs.on("message", (aiData) => {
          if (ws.readyState === WebSocket.OPEN) {
            let aiMsg: { audio?: string };
            try {
              aiMsg = JSON.parse(aiData.toString()) as { audio?: string };
            } catch {
              return;
            }

            if (aiMsg.audio) {
              ws.send(
                JSON.stringify({
                  event: "media",
                  streamSid,
                  media: { payload: aiMsg.audio },
                }),
              );
            }
          }
        });

        davoxiWs.on("error", (err) => {
          console.error("Davoxi WebSocket error:", err.message);
        });

        davoxiWs.on("close", () => {
          console.log("Davoxi WebSocket closed");
        });
        break;

      case "media":
        // Forward caller audio to Davoxi
        if (davoxiWs?.readyState === WebSocket.OPEN && msg.media) {
          davoxiWs.send(
            JSON.stringify({
              event: "audio",
              payload: msg.media.payload,
              timestamp: msg.media.timestamp,
            }),
          );
        }
        break;

      case "stop":
        console.log(`Media stream stopped: ${streamSid}`);
        if (davoxiWs?.readyState === WebSocket.OPEN) {
          davoxiWs.send(JSON.stringify({ event: "stop" }));
          davoxiWs.close();
        }
        break;
    }
  });

  ws.on("close", () => {
    console.log(`WebSocket closed for stream ${streamSid}`);
    if (davoxiWs?.readyState === WebSocket.OPEN) {
      davoxiWs.close();
    }
  });

  ws.on("error", (err) => {
    console.error("Twilio WebSocket error:", err.message);
  });
}
