jest.mock("twilio", () => {
  const mockClient = {
    incomingPhoneNumbers: { list: jest.fn() },
  };
  const twilioFn = jest.fn(() => mockClient) as any;
  twilioFn.validateRequest = jest.fn();
  return { __esModule: true, default: twilioFn };
});

jest.mock("../config", () => ({
  config: {
    twilio: {
      accountSid: "AC_test_sid",
      authToken: "test_auth_token",
    },
    davoxi: { apiUrl: "https://api.davoxi.com", apiKey: "" },
    port: 3003,
    appUrl: "http://localhost:3003",
    wsUrl: "wss://localhost:3003",
  },
}));

import twilio from "twilio";

describe("twilio-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the cached client between tests
    jest.resetModules();
  });

  describe("getTwilioClient", () => {
    it("should create a Twilio client with config credentials", () => {
      // Re-require after resetModules to get fresh module state
      jest.mock("twilio", () => {
        const mockClient = { incomingPhoneNumbers: { list: jest.fn() } };
        const fn = jest.fn(() => mockClient) as any;
        fn.validateRequest = jest.fn();
        return { __esModule: true, default: fn };
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

      const { getTwilioClient } = require("../services/twilio-client");
      const twilio = require("twilio").default;

      const client = getTwilioClient();

      expect(twilio).toHaveBeenCalledWith("AC_test_sid", "test_auth_token");
      expect(client).toBeDefined();
    });

    it("should return the same client instance on subsequent calls", () => {
      jest.mock("twilio", () => {
        const mockClient = { incomingPhoneNumbers: { list: jest.fn() } };
        const fn = jest.fn(() => mockClient) as any;
        fn.validateRequest = jest.fn();
        return { __esModule: true, default: fn };
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

      const { getTwilioClient } = require("../services/twilio-client");
      const twilio = require("twilio").default;

      const client1 = getTwilioClient();
      const client2 = getTwilioClient();

      expect(client1).toBe(client2);
      expect(twilio).toHaveBeenCalledTimes(1);
    });
  });

  describe("validateTwilioRequest", () => {
    it("should call twilio.validateRequest with correct parameters", () => {
      jest.mock("twilio", () => {
        const mockClient = { incomingPhoneNumbers: { list: jest.fn() } };
        const fn = jest.fn(() => mockClient) as any;
        fn.validateRequest = jest.fn().mockReturnValue(true);
        return { __esModule: true, default: fn };
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

      const { validateTwilioRequest } = require("../services/twilio-client");
      const twilio = require("twilio").default;

      const result = validateTwilioRequest(
        "sig123",
        "https://example.com/voice",
        { key: "value" },
      );

      expect(twilio.validateRequest).toHaveBeenCalledWith(
        "test_auth_token",
        "sig123",
        "https://example.com/voice",
        { key: "value" },
      );
      expect(result).toBe(true);
    });

    it("should return false for invalid requests", () => {
      jest.mock("twilio", () => {
        const mockClient = { incomingPhoneNumbers: { list: jest.fn() } };
        const fn = jest.fn(() => mockClient) as any;
        fn.validateRequest = jest.fn().mockReturnValue(false);
        return { __esModule: true, default: fn };
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

      const { validateTwilioRequest } = require("../services/twilio-client");

      const result = validateTwilioRequest("bad_sig", "https://example.com", {});
      expect(result).toBe(false);
    });
  });
});
