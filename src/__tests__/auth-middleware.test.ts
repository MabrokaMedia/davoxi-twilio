/**
 * Tests for the auth middleware introduced in voice.ts (twilioWebhookAuth)
 * and numbers.ts (adminApiKeyAuth).
 */

// Mock twilio before importing routes
jest.mock("twilio", () => {
  const VoiceResponse = jest.fn().mockImplementation(() => ({
    say: jest.fn(),
    connect: jest.fn(() => ({ stream: jest.fn() })),
    toString: jest.fn(
      () => '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    ),
  }));

  const mockClient = (() => {
    const fn: any = jest.fn((_sid: string) => ({
      update: jest.fn().mockResolvedValue({
        phoneNumber: "+15551234567",
        sid: _sid,
      }),
    }));
    fn.list = jest.fn().mockResolvedValue([]);
    return fn;
  })();

  const twilioFn = jest.fn(() => ({ incomingPhoneNumbers: mockClient })) as any;
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

import express, { Express } from "express";
import request from "supertest";
import twilio from "twilio";
import voiceRouter from "../routes/voice";
import numbersRouter from "../routes/numbers";

const mockValidateRequest = twilio.validateRequest as jest.Mock;

const ADMIN_API_KEY = "secret-admin-key";

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use("/voice", voiceRouter);
  app.use("/numbers", numbersRouter);
  return app;
}

beforeAll(() => {
  process.env.ADMIN_API_KEY = ADMIN_API_KEY;
});

afterAll(() => {
  delete process.env.ADMIN_API_KEY;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// twilioWebhookAuth — voice routes
// ---------------------------------------------------------------------------

describe("twilioWebhookAuth middleware", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  describe("POST /voice/incoming", () => {
    it("returns 403 when x-twilio-signature header is missing", async () => {
      mockValidateRequest.mockReturnValue(false);

      const res = await request(app).post("/voice/incoming").send({});

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Invalid Twilio signature" });
    });

    it("returns 403 when x-twilio-signature is invalid", async () => {
      mockValidateRequest.mockReturnValue(false);

      const res = await request(app)
        .post("/voice/incoming")
        .set("x-twilio-signature", "bad-signature")
        .send({});

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Invalid Twilio signature" });
    });

    it("returns 200 when x-twilio-signature is valid", async () => {
      mockValidateRequest.mockReturnValue(true);

      const res = await request(app)
        .post("/voice/incoming")
        .set("x-twilio-signature", "valid-signature")
        .send({});

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/xml/);
    });

    it("calls validateRequest with the signature and body params", async () => {
      mockValidateRequest.mockReturnValue(true);

      await request(app)
        .post("/voice/incoming")
        .set("x-twilio-signature", "my-sig")
        .send({ CallSid: "CA123" });

      expect(mockValidateRequest).toHaveBeenCalledWith(
        "test_auth_token",
        "my-sig",
        expect.stringContaining("/voice/incoming"),
        expect.objectContaining({ CallSid: "CA123" }),
      );
    });
  });

  describe("POST /voice/stream-status", () => {
    it("returns 403 when signature is missing", async () => {
      mockValidateRequest.mockReturnValue(false);

      const res = await request(app).post("/voice/stream-status").send({});

      expect(res.status).toBe(403);
    });

    it("returns 200 when signature is valid", async () => {
      mockValidateRequest.mockReturnValue(true);

      const res = await request(app)
        .post("/voice/stream-status")
        .set("x-twilio-signature", "valid-sig")
        .send({ StreamSid: "MZ1", StreamStatus: "connected", CallSid: "CA1" });

      expect(res.status).toBe(200);
    });
  });

  describe("POST /voice/call-status", () => {
    it("returns 403 when signature is missing", async () => {
      mockValidateRequest.mockReturnValue(false);

      const res = await request(app).post("/voice/call-status").send({});

      expect(res.status).toBe(403);
    });

    it("returns 200 when signature is valid", async () => {
      mockValidateRequest.mockReturnValue(true);

      const res = await request(app)
        .post("/voice/call-status")
        .set("x-twilio-signature", "valid-sig")
        .send({ CallSid: "CA1", CallStatus: "completed", CallDuration: "30" });

      expect(res.status).toBe(200);
    });
  });
});

// ---------------------------------------------------------------------------
// adminApiKeyAuth — numbers routes
// ---------------------------------------------------------------------------

describe("adminApiKeyAuth middleware", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  describe("GET /numbers", () => {
    it("returns 401 when x-api-key header is missing", async () => {
      const res = await request(app).get("/numbers");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when x-api-key is wrong", async () => {
      const res = await request(app)
        .get("/numbers")
        .set("x-api-key", "wrong-key");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("returns 200 when x-api-key is correct", async () => {
      const res = await request(app)
        .get("/numbers")
        .set("x-api-key", ADMIN_API_KEY);

      expect(res.status).toBe(200);
    });
  });

  describe("POST /numbers/:sid/configure", () => {
    it("returns 401 when x-api-key header is missing", async () => {
      const res = await request(app).post("/numbers/PN111/configure").send();

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when x-api-key is wrong", async () => {
      const res = await request(app)
        .post("/numbers/PN111/configure")
        .set("x-api-key", "bad-key")
        .send();

      expect(res.status).toBe(401);
    });

    it("returns 200 when x-api-key is correct", async () => {
      const res = await request(app)
        .post("/numbers/PN111/configure")
        .set("x-api-key", ADMIN_API_KEY)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("POST /numbers/:sid/unconfigure", () => {
    it("returns 401 when x-api-key header is missing", async () => {
      const res = await request(app).post("/numbers/PN111/unconfigure").send();

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when x-api-key is wrong", async () => {
      const res = await request(app)
        .post("/numbers/PN111/unconfigure")
        .set("x-api-key", "bad-key")
        .send();

      expect(res.status).toBe(401);
    });

    it("returns 200 when x-api-key is correct", async () => {
      const res = await request(app)
        .post("/numbers/PN111/unconfigure")
        .set("x-api-key", ADMIN_API_KEY)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("ADMIN_API_KEY env var not set", () => {
    it("returns 401 even with a non-empty key header when ADMIN_API_KEY is unset", async () => {
      const saved = process.env.ADMIN_API_KEY;
      delete process.env.ADMIN_API_KEY;

      const res = await request(app)
        .get("/numbers")
        .set("x-api-key", "any-value");

      expect(res.status).toBe(401);

      process.env.ADMIN_API_KEY = saved;
    });
  });

  describe("timing-safe comparison", () => {
    it("returns 401 when key has different length than ADMIN_API_KEY (no throw)", async () => {
      // Different-length keys would cause timingSafeEqual to throw if uncaught — verify it does
      // not bubble up as a 500 and is handled gracefully.
      const res = await request(app)
        .get("/numbers")
        .set("x-api-key", "x"); // much shorter than ADMIN_API_KEY

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when key is longer than ADMIN_API_KEY (no throw)", async () => {
      const res = await request(app)
        .get("/numbers")
        .set("x-api-key", ADMIN_API_KEY + ADMIN_API_KEY + "extra");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });
  });
});
