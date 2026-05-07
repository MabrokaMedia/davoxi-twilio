/**
 * Tests for the new defensive checks added to the numbers and voice routes:
 * - SID format validation
 * - Generic error responses (no err.message leak)
 * - Constant-time admin key comparison via timingSafeEqual
 */

jest.mock("twilio", () => {
  const VoiceResponse = jest.fn().mockImplementation(() => ({
    say: jest.fn(),
    connect: jest.fn(() => ({ stream: jest.fn() })),
    toString: jest.fn(
      () => '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    ),
  }));

  const incomingPhoneNumbers: any = jest.fn((sid: string) => ({
    update: jest.fn().mockResolvedValue({ phoneNumber: "+15551234567", sid }),
  }));
  incomingPhoneNumbers.list = jest.fn();

  const twilioFn = jest.fn(() => ({ incomingPhoneNumbers })) as any;
  twilioFn.validateRequest = jest.fn().mockReturnValue(true);
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
import numbersRouter from "../routes/numbers";
import { getTwilioClient } from "../services/twilio-client";

const ADMIN_API_KEY = "secret-admin-key";
const VALID_SID = "PN12345678901234567890123456789012";

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
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
  const client = getTwilioClient() as any;
  client.incomingPhoneNumbers.list.mockResolvedValue([]);
});

describe("SID format validation", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("rejects bare numeric SID", async () => {
    const res = await request(app)
      .post("/numbers/PN111/configure")
      .set("x-api-key", ADMIN_API_KEY)
      .send();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid phone number SID" });
  });

  it("rejects SID with wrong prefix", async () => {
    const res = await request(app)
      .post("/numbers/CA12345678901234567890123456789012/configure")
      .set("x-api-key", ADMIN_API_KEY)
      .send();
    expect(res.status).toBe(400);
  });

  it("rejects SID with non-hex chars", async () => {
    const res = await request(app)
      .post("/numbers/PNzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/configure")
      .set("x-api-key", ADMIN_API_KEY)
      .send();
    expect(res.status).toBe(400);
  });

  it("accepts properly-formed SID", async () => {
    const res = await request(app)
      .post(`/numbers/${VALID_SID}/configure`)
      .set("x-api-key", ADMIN_API_KEY)
      .send();
    expect(res.status).toBe(200);
  });

  it("validates SID on /unconfigure too", async () => {
    const res = await request(app)
      .post("/numbers/garbage/unconfigure")
      .set("x-api-key", ADMIN_API_KEY)
      .send();
    expect(res.status).toBe(400);
  });
});

describe("Error response scrubbing", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("returns a generic error message on Twilio failure (does not leak err.message)", async () => {
    const client = getTwilioClient() as any;
    client.incomingPhoneNumbers.list.mockRejectedValue(
      new Error("Twilio internal: account=ACxxxxx token=secret123 url=https://internal/api"),
    );

    const res = await request(app)
      .get("/numbers")
      .set("x-api-key", ADMIN_API_KEY);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to list phone numbers" });
    expect(JSON.stringify(res.body)).not.toContain("token=secret123");
    expect(JSON.stringify(res.body)).not.toContain("account=ACxxxxx");
  });

  it("returns a generic error on configure failure", async () => {
    const client = getTwilioClient() as any;
    const updateMock = jest.fn().mockRejectedValue(new Error("Twilio 21452: leaked details"));
    client.incomingPhoneNumbers.mockImplementation(() => ({ update: updateMock }));

    const res = await request(app)
      .post(`/numbers/${VALID_SID}/configure`)
      .set("x-api-key", ADMIN_API_KEY)
      .send();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to configure phone number" });
    expect(JSON.stringify(res.body)).not.toContain("21452");
  });
});

describe("Admin key timing-safe comparison", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("rejects when provided key is shorter than admin key", async () => {
    const res = await request(app)
      .get("/numbers")
      .set("x-api-key", "short");
    expect(res.status).toBe(401);
  });

  it("rejects when provided key is longer than admin key", async () => {
    const res = await request(app)
      .get("/numbers")
      .set("x-api-key", ADMIN_API_KEY + "extra");
    expect(res.status).toBe(401);
  });

  it("rejects when provided key shares prefix only", async () => {
    const res = await request(app)
      .get("/numbers")
      .set("x-api-key", "secret-admin-XEY");
    expect(res.status).toBe(401);
  });

  it("accepts when provided key matches exactly", async () => {
    const res = await request(app)
      .get("/numbers")
      .set("x-api-key", ADMIN_API_KEY);
    expect(res.status).toBe(200);
  });
});
