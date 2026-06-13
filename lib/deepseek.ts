import OpenAI from "openai";

/**
 * DeepSeek is OpenAI-compatible, so we use the OpenAI SDK pointed at the
 * DeepSeek base URL. Swapping to Anthropic-via-Foundry later only changes
 * this file (constructor + message shape) — the migration prompt is untouched.
 *
 * Constructed lazily: the SDK throws on an empty key, and we must not blow up
 * at module-load / build time when no key is configured. Callers gate on
 * `hasDeepseekKey()` first.
 */
let client: OpenAI | null = null;

export function getDeepseek(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY ?? "",
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    });
  }
  return client;
}

export const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
export const MAX_TOKENS = Number(process.env.DEEPSEEK_MAX_TOKENS ?? 32000);

export function hasDeepseekKey(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * DeepSeek throttles dynamically (429s under load, no fixed quota). Wrap the
 * migration call in a short exponential backoff. Only retries on rate-limit /
 * transient 5xx; everything else surfaces immediately.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status =
        e instanceof OpenAI.APIError ? e.status : undefined;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2 ** i * 1000));
    }
  }
  throw lastErr;
}
