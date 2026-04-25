import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import voiceRoutes from "./routes/voice";
import numberRoutes from "./routes/numbers";
import { handleMediaStream } from "./services/media-stream-handler";

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

const wss = new WebSocketServer({ server, path: "/media-stream" });

wss.on("connection", (ws) => {
  console.log("New media stream WebSocket connection");
  handleMediaStream(ws);
});

server.listen(config.port, () => {
  console.log(`Davoxi Twilio integration running on port ${config.port}`);
  console.log(`WebSocket server listening at ${config.wsUrl}/media-stream`);
});

export default app;
