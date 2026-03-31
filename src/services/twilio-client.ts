import twilio from "twilio";
import { config } from "../config";

let twilioClient: twilio.Twilio | null = null;

export function getTwilioClient(): twilio.Twilio {
  if (!twilioClient) {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

/**
 * Validate that a request came from Twilio using X-Twilio-Signature.
 */
export function validateTwilioRequest(
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  return twilio.validateRequest(config.twilio.authToken, signature, url, params);
}
