/**
 * Unit tests for handleMediaStream — focused on the callSid binding check
 * that prevents a leaked/replayed stream token from being used to
 * impersonate another active call.
 */

import { EventEmitter } from "events";

jest.mock("../config", () => ({
  config: {
    twilio: { accountSid: "AC_test_sid", authToken: "test_auth_token" },
    davoxi: { apiUrl: "https://api.davoxi.com", apiKey: "test_davoxi_key" },
    port: 3003,
    appUrl: "http://localhost:3003",
    wsUrl: "wss://localhost:3003",
  },
}));

// Stub out the upstream Davoxi WebSocket so the handler doesn't actually dial out.
jest.mock("ws", () => {
  const stub = jest.fn().mockImplementation(() => {
    const ee: any = new EventEmitter();
    ee.send = jest.fn();
    ee.close = jest.fn();
    ee.readyState = 1; // OPEN
    return ee;
  });
  (stub as any).OPEN = 1;
  return stub;
});

import WebSocket from "ws";
import { handleMediaStream } from "../services/media-stream-handler";
import type { StreamTokenPayload } from "../services/stream-token";

class FakeClientSocket extends EventEmitter {
  readyState = 1;
  send = jest.fn();
  close = jest.fn();
}

function makeStartMessage(callSid: string, streamSid = "MZ12345") {
  return JSON.stringify({
    event: "start",
    start: {
      streamSid,
      accountSid: "AC_x",
      callSid,
      tracks: ["inbound"],
      mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 },
    },
  });
}

describe("handleMediaStream callSid binding", () => {
  beforeEach(() => {
    (WebSocket as unknown as jest.Mock).mockClear();
  });

  it("accepts a start frame whose callSid matches the token", () => {
    const ws = new FakeClientSocket();
    const payload: StreamTokenPayload = { callSid: "CAabc123", exp: Date.now() + 60_000 };
    handleMediaStream(ws as unknown as WebSocket, payload);

    ws.emit("message", Buffer.from(makeStartMessage("CAabc123")));

    expect(ws.close).not.toHaveBeenCalled();
    // The handler should have opened a Davoxi WebSocket connection
    expect(WebSocket).toHaveBeenCalledTimes(1);
  });

  it("rejects and closes the socket when the start callSid does not match the token", () => {
    const ws = new FakeClientSocket();
    const payload: StreamTokenPayload = { callSid: "CAabc123", exp: Date.now() + 60_000 };
    handleMediaStream(ws as unknown as WebSocket, payload);

    ws.emit("message", Buffer.from(makeStartMessage("CAdifferent")));

    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(ws.close).toHaveBeenCalledWith(1008, "callSid mismatch");
    // Must NOT open the upstream Davoxi WebSocket on mismatch
    expect(WebSocket).not.toHaveBeenCalled();
  });

  it("does not enforce binding when no token payload is provided (back-compat)", () => {
    const ws = new FakeClientSocket();
    handleMediaStream(ws as unknown as WebSocket);

    ws.emit("message", Buffer.from(makeStartMessage("CAanything")));

    expect(ws.close).not.toHaveBeenCalled();
    expect(WebSocket).toHaveBeenCalledTimes(1);
  });

  it("does not open Davoxi connection if start callSid is empty and token requires a match", () => {
    const ws = new FakeClientSocket();
    const payload: StreamTokenPayload = { callSid: "CAabc123", exp: Date.now() + 60_000 };
    handleMediaStream(ws as unknown as WebSocket, payload);

    ws.emit("message", Buffer.from(makeStartMessage("")));

    expect(ws.close).toHaveBeenCalledWith(1008, "callSid mismatch");
    expect(WebSocket).not.toHaveBeenCalled();
  });
});
