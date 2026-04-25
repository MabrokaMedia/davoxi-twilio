import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { URL } from "url";
import { config } from "./config";
import voiceRoutes from "./routes/voice";
import numberRoutes from "./routes/numbers";
import { handleMediaStream } from "./services/media-stream-handler";
import { consumeStreamToken } from "./services/stream-token";

const app = express();

// Global rate limit: 300 req/min per IP (safety net; per-route limits are tighter)
const globalLimit = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

app.use(helmet());
app.use(globalLimit);
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

const wss = new WebSocketServer({ server, path: "/media-stream" });

wss.on("connection", (ws, req) => {
  // Validate the single-use stream token issued by POST /voice/incoming
  const requestUrl = new URL(req.url ?? "", `http://localhost`);
  const token = requestUrl.searchParams.get("token") ?? "";

  if (!consumeStreamToken(token)) {
    ws.close(4401, "Unauthorized");
    return;
  }

  console.log("New media stream WebSocket connection");
  handleMediaStream(ws);
});

server.listen(config.port, () => {
  console.log(`Davoxi Twilio integration running on port ${config.port}`);
  console.log(`WebSocket server listening at ${config.wsUrl}/media-stream`);
});

export default app;
