import { redactSensitive } from "./sanitize";
import { applyPatch, missingRequired, type MissingField } from "./normalize";
import { composeReply } from "./followups";
import { heuristicExtractor, type Extractor } from "./heuristic";
import type { Profile, ProfilePatch } from "./schema";

export interface ProcessInput {
  text: string;
  current: Profile;
  lastAssistant: string | null;
  /** Model-backed extractor; null/undefined = offline mode. */
  extractor?: Extractor | null;
}

export interface ProcessResult {
  redactedText: string;
  profile: Profile;
  patch: ProfilePatch;
  redactions: string[];
  issues: string[];
  missing: MissingField[];
  reply: string;
  questions: string[];
  mode: "claude" | "offline" | "offline_fallback";
  modelError?: string;
}

/** One user turn: redact → extract (model, else heuristic) → merge/normalise → decide follow-ups. */
export async function processUserMessage(input: ProcessInput): Promise<ProcessResult> {
  const { text: redactedText, found } = redactSensitive(input.text);
  const ctx = { userText: redactedText, current: input.current, lastAssistant: input.lastAssistant };

  let patch: ProfilePatch;
  let mode: ProcessResult["mode"] = "offline";
  let modelError: string | undefined;
  if (input.extractor) {
    try {
      patch = await input.extractor(ctx);
      mode = "claude";
    } catch (e) {
      modelError = e instanceof Error ? e.message : String(e);
      patch = await heuristicExtractor(ctx);
      mode = "offline_fallback";
    }
  } else {
    patch = await heuristicExtractor(ctx);
  }

  const { profile, issues } = applyPatch(input.current, patch);
  const missing = missingRequired(profile);
  const { text: reply, questions } = composeReply({ profile, missing, redactions: found, issues, offline: mode !== "claude" });
  return { redactedText, profile, patch, redactions: found, issues, missing, reply, questions, mode, modelError };
}
