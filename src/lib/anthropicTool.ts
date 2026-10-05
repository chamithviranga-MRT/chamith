import { Anthropic, type MessagesClient } from "@/lib/anthropic";
import { MODEL } from "@/lib/config";

export class ToolCallError extends Error {
  constructor(message: string, readonly kind: "refusal" | "no_tool_call" | "api" = "api") {
    super(message);
    this.name = "ToolCallError";
  }
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
}

// Strict tool schemas have complexity limits that cannot be verified offline. If the API rejects a
// schema we retry that tool once without `strict` and remember it; callers validate results with zod anyway.
const strictRejected = new Set<string>();
export function _resetStrictFlags() {
  strictRejected.clear();
}

/**
 * One tool-use round trip. Forced tool choice (tool_choice any/tool) is rejected by this model family, so we use
 * `auto`, steer with the prompt, and re-prompt once if the model answers in plain text.
 */
export async function callTool(
  client: MessagesClient,
  opts: {
    system: string;
    tool: ToolSpec;
    userContent: string;
    model?: string;
    maxTokens?: number;
    effort?: "low" | "medium" | "high";
  }
): Promise<unknown> {
  const { tool } = opts;
  const send = (content: string, strict: boolean) =>
    client.messages.create({
      model: opts.model ?? MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.input_schema, ...(strict ? { strict: true } : {}) }],
      tool_choice: { type: "auto" },
      output_config: { effort: opts.effort ?? "low" },
      messages: [{ role: "user", content }],
    });

  const run = async (content: string) => {
    try {
      return await send(content, !strictRejected.has(tool.name));
    } catch (e) {
      if (!strictRejected.has(tool.name) && e instanceof Anthropic.BadRequestError) {
        strictRejected.add(tool.name);
        return await send(content, false);
      }
      throw e;
    }
  };
  const find = (m: Anthropic.Message) => m.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === tool.name);

  try {
    let msg = await run(opts.userContent);
    if (msg.stop_reason === "refusal") throw new ToolCallError("Model declined this request", "refusal");
    let use = find(msg);
    if (!use) {
      msg = await run(`${opts.userContent}\n\nYou must respond by calling ${tool.name}. Do not reply with plain text.`);
      if (msg.stop_reason === "refusal") throw new ToolCallError("Model declined this request", "refusal");
      use = find(msg);
    }
    if (!use) throw new ToolCallError(`Model did not call ${tool.name}`, "no_tool_call");
    return use.input;
  } catch (e) {
    if (e instanceof ToolCallError) throw e;
    throw new ToolCallError(e instanceof Error ? e.message : "Anthropic request failed", "api");
  }
}
