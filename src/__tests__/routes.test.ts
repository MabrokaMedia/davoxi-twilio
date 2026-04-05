import express, { Express } from "express";
import request from "supertest";

// Mock twilio before importing routes
jest.mock("twilio", () => {
  const VoiceResponse = jest.fn().mockImplementation(() => {
    const connects: any[] = [];
    return {
      say: jest.fn(),
      connect: jest.fn(() => {
        const conn = { stream: jest.fn() };
        connects.push(conn);
        return conn;
      }),
      toString: jest.fn(
        () => '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      ),
    };
  });

  const mockClient = {
    incomingPhoneNumbers: {
      list: jest.fn(),
      __call: jest.fn(),
    },
  };

  // Make incomingPhoneNumbers callable (for .incomingPhoneNumbers(sid))
  const incomingPhoneNumbers: any = jest.fn((sid: string) => ({
    update: jest.fn().mockResolvedValue({
      phoneNumber: "+15551234567",
      sid,
    }),
  }));
  incomingPhoneNumbers.list = jest.fn();
  mockClient.incomingPhoneNumbers = incomingPhoneNumbers;

  const twilioFn = jest.fn(() => mockClient) as any;
  twilioFn.validateRequest = jest.fn();
  twilioFn.twiml = { VoiceResponse };

  return { __esModule: true, default: twilioFn, twiml: { VoiceResponse } };
});

jest.mock("../config", () => ({
  config: {
    twilio: { accountSid: "AC_test_sid", authToken: "test_auth_token" },
    davoxi: { apiUrl: "https://api.davoxi.com", apiKey: "" },
    port: 3003,
    appUrl: "http://localhost:3003",
    wsUrl: "wss://localhost:3003",
  },
}));

import voiceRouter from "../routes/voice";
import numbersRouter from "../routes/numbers";
import { getTwilioClient } from "../services/twilio-client";

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use("/voice", voiceRouter);
  app.use("/numbers", numbersRouter);
  return app;
}

describe("Voice routes", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  describe("POST /voice/incoming", () => {
    it("should return TwiML XML response", async () => {
      const res = await request(app).post("/voice/incoming").send({});

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/xml/);
    });
  });

  describe("POST /voice/stream-status", () => {
    it("should return 200 for stream status updates", async () => {
      const res = await request(app).post("/voice/stream-status").send({
        StreamSid: "MZ123",
        StreamStatus: "connected",
        CallSid: "CA123",
      });

      expect(res.status).toBe(200);
    });
  });

  describe("POST /voice/call-status", () => {
    it("should return 200 for call status updates", async () => {
      const res = await request(app).post("/voice/call-status").send({
        CallSid: "CA123",
        CallStatus: "completed",
        CallDuration: "45",
      });

      expect(res.status).toBe(200);
    });
  });
});

describe("Numbers routes", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe("GET /numbers", () => {
    it("should return numbers configured for Davoxi", async () => {
      const client = getTwilioClient() as any;
      client.incomingPhoneNumbers.list.mockResolvedValue([
        {
          sid: "PN111",
          phoneNumber: "+15551111111",
          friendlyName: "Main Line",
          voiceUrl: "http://localhost:3003/voice/incoming",
        },
        {
          sid: "PN222",
          phoneNumber: "+15552222222",
          friendlyName: "Other",
          voiceUrl: "https://other-service.com/voice",
        },
      ]);

      const res = await request(app).get("/numbers");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          sid: "PN111",
          phoneNumber: "+15551111111",
          friendlyName: "Main Line",
          voiceUrl: "http://localhost:3003/voice/incoming",
        },
      ]);
    });

    it("should return 500 on Twilio error", async () => {
      const client = getTwilioClient() as any;
      client.incomingPhoneNumbers.list.mockRejectedValue(
        new Error("Twilio API error"),
      );

      const res = await request(app).get("/numbers");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Twilio API error" });
    });
  });

  describe("POST /numbers/:sid/configure", () => {
    it("should configure a number for Davoxi", async () => {
      const res = await request(app).post("/numbers/PN111/configure").send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.phoneNumber).toBe("+15551234567");
    });
  });

  describe("POST /numbers/:sid/unconfigure", () => {
    it("should unconfigure a number", async () => {
      const res = await request(app).post("/numbers/PN111/unconfigure").send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
