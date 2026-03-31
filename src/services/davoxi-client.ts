import { config } from "../config";

/**
 * Make an authenticated request to the Davoxi API.
 */
export async function davoxiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  apiKey?: string,
): Promise<T> {
  const key = apiKey || config.davoxi.apiKey;
  const url = `${config.davoxi.apiUrl}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };

  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Davoxi API error (${res.status}): ${text}`);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return JSON.parse(text) as T;
}
