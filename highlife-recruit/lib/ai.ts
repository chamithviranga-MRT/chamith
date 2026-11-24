import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getVercelOidcToken } from "@vercel/oidc";

const GATEWAY_URL = "https://ai-gateway.vercel.sh";
const GATEWAY_MODEL = "anthropic/claude-opus-5.5";
const DIRECT_MODEL = "claude-opus-5-5";

export type Provider = "gateway" | "anthropic" | "none";

/**
 * Which route Claude calls take.
 * 1. Vercel AI Gateway: AI_GATEWAY_API_KEY, or the deployment's own OIDC token on Vercel (no key needed).
 * 2. Direct Anthropic API: ANTHROPIC_API_KEY.
 * 3. None: demo mode.
 */
export function provider(): Provider {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN) return "gateway";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}

export function hasClaude() {
  return provider() !== "none";
}
export function hasExa() {
  return Boolean(process.env.EXA_API_KEY);
}
export function modelName() {
  return provider() === "gateway" ? GATEWAY_MODEL : DIRECT_MODEL;
}

async function getClient(): Promise<Anthropic> {
  if (provider() === "gateway") {
    // The OIDC token is short-lived, so fetch it per request rather than caching the client.
    const apiKey = process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken());
    return new Anthropic({ apiKey, baseURL: GATEWAY_URL });
  }
  return new Anthropic();
}

/** Ask Claude for JSON that matches a Zod schema. */
export async function askJson<T extends z.ZodType>(
  schema: T,
  system: string,
  prompt: string,
  effort: "low" | "medium" | "high" = "low",
): Promise<z.infer<T>> {
  const client = await getClient();
  const model = modelName();
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system,
      output_config: { effort, format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
    if (!response.parsed_output) throw new Error("Claude returned an unreadable answer.");
    return response.parsed_output as z.infer<T>;
  } catch (err) {
    // If a gateway route rejects structured-output parameters, fall back to plain JSON prompting.
    if (!(err instanceof Anthropic.BadRequestError) || provider() !== "gateway") throw err;
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: `${system}\n\nReply with only a JSON object that matches this JSON Schema, with no other text:\n${JSON.stringify(z.toJSONSchema(schema))}`,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return schema.parse(JSON.parse(json));
  }
}

export function errorMessage(err: unknown): string {
  const via = provider() === "gateway" ? "Vercel AI Gateway" : "Anthropic API";
  if (err instanceof Anthropic.AuthenticationError) return `${via} rejected the credentials.`;
  if (err instanceof Anthropic.PermissionDeniedError || (err instanceof Anthropic.APIError && err.status === 402))
    return `${via} refused the request. If this is the gateway, check AI Gateway billing or credits in Vercel.`;
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate limited. Try again in a minute.";
  if (err instanceof Anthropic.APIError) return `${via} error ${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
