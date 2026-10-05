import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Returns a shared client, or null when ANTHROPIC_API_KEY is not configured. */
export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment; SDK retries 429/5xx twice
  return client;
}

/** The only surface the app uses; lets tests inject a fake. */
export type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

export { Anthropic };
