export const config = {
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
  },
  davoxi: {
    apiUrl: process.env.DAVOXI_API_URL || "https://api.davoxi.com",
    apiKey: process.env.DAVOXI_API_KEY || "",
  },
  port: parseInt(process.env.PORT || "3003", 10),
  appUrl: process.env.APP_URL || "http://localhost:3003",
  wsUrl: process.env.WS_URL || "wss://localhost:3003",
};

// Warn at startup if critical env vars are missing (not a hard crash so CI can proceed).
const requiredEnvVars: Array<[string, string]> = [
  ["TWILIO_ACCOUNT_SID", config.twilio.accountSid],
  ["TWILIO_AUTH_TOKEN", config.twilio.authToken],
  ["DAVOXI_API_KEY", config.davoxi.apiKey],
];

for (const [name, value] of requiredEnvVars) {
  if (!value) {
    console.warn(`[config] WARNING: environment variable ${name} is not set`);
  }
}
