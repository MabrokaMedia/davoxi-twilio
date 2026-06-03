import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import voiceRoutes from "./routes/voice";
import numberRoutes from "./routes/numbers";
import { handleMediaStream } from "./services/media-stream-handler";
import { verifyStreamToken, isStreamTokenEnforced, StreamTokenPayload } from "./services/stream-token";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : false }));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/voice", voiceRoutes);
app.use("/numbers", numberRoutes);

// Create HTTP server and attach WebSocket server
const server = createServer(app);

export interface VerifyDecision {
  allow: boolean;
  code?: number;
  message?: string;
  payload?: StreamTokenPayload;
}

/**
 * Pure decision function for the WebSocket verifyClient handshake.
 * Exported so the policy can be unit-tested in isolation from the
 * `ws` upgrade machinery.
 */
export function decideStreamUpgrade(
  rawUrl: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): VerifyDecision {
  if (!isStreamTokenEnforced()) {
    // Fail closed in production. A missing/short STREAM_TOKEN_SECRET
    // would otherwise let any client open a bridge to the upstream
    // Davoxi voice AI under the trusted DAVOXI_API_KEY.
    if (nodeEnv === "production") {
      return { allow: false, code: 503, message: "Stream token enforcement disabled" };
    }
    return { allow: true };
  }
  const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  const params = new URLSearchParams(qs);
  const token = params.get("token");
  const payload = verifyStreamToken(token);
  if (payload) {
    return { allow: true, payload };
  }
  return { allow: false, code: 401, message: "Unauthorized" };
}

const wss = new WebSocketServer({
  server,
  path: "/media-stream",
  verifyClient: (info, done) => {
    const decision = decideStreamUpgrade(info.req.url || "");
    if (!decision.allow) {
      if (decision.code === 503) {
        console.error("Refusing /media-stream connection: STREAM_TOKEN_SECRET is unset in production");
      }
      done(false, decision.code ?? 401, decision.message ?? "Unauthorized");
      return;
    }
    if (!isStreamTokenEnforced()) {
      console.warn("WARNING: STREAM_TOKEN_SECRET is unset; allowing /media-stream connection in non-production");
    }
    if (decision.payload) {
      (info.req as unknown as { streamTokenPayload: StreamTokenPayload }).streamTokenPayload = decision.payload;
    }
    done(true);
  },
});

wss.on("connection", (ws, req) => {
  const payload = (req as unknown as { streamTokenPayload?: StreamTokenPayload }).streamTokenPayload;
  console.log("New media stream WebSocket connection");
  handleMediaStream(ws, payload);
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`Davoxi Twilio integration running on port ${config.port}`);
    console.log(`WebSocket server listening at ${config.wsUrl}/media-stream`);
  });
}

export default app;
export { server, wss };
