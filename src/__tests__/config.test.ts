describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should use default values when env vars are not set", () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.DAVOXI_API_URL;
    delete process.env.DAVOXI_API_KEY;
    delete process.env.PORT;
    delete process.env.APP_URL;
    delete process.env.WS_URL;

    const { config } = require("../config");

    expect(config.twilio.accountSid).toBe("");
    expect(config.twilio.authToken).toBe("");
    expect(config.davoxi.apiUrl).toBe("https://api.davoxi.com");
    expect(config.davoxi.apiKey).toBe("");
    expect(config.port).toBe(3003);
    expect(config.appUrl).toBe("http://localhost:3003");
    expect(config.wsUrl).toBe("wss://localhost:3003");
  });

  it("should read values from environment variables", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test_sid";
    process.env.TWILIO_AUTH_TOKEN = "test_token";
    process.env.DAVOXI_API_URL = "https://custom.api.com";
    process.env.DAVOXI_API_KEY = "my-key";
    process.env.PORT = "4000";
    process.env.APP_URL = "https://myapp.example.com";
    process.env.WS_URL = "wss://myapp.example.com";

    const { config } = require("../config");

    expect(config.twilio.accountSid).toBe("AC_test_sid");
    expect(config.twilio.authToken).toBe("test_token");
    expect(config.davoxi.apiUrl).toBe("https://custom.api.com");
    expect(config.davoxi.apiKey).toBe("my-key");
    expect(config.port).toBe(4000);
    expect(config.appUrl).toBe("https://myapp.example.com");
    expect(config.wsUrl).toBe("wss://myapp.example.com");
  });

  it("should parse PORT as an integer", () => {
    process.env.PORT = "8080";
    const { config } = require("../config");
    expect(config.port).toBe(8080);
    expect(typeof config.port).toBe("number");
  });
});
