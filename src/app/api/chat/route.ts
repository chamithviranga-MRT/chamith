import { json } from "@/lib/http";

export const runtime = "nodejs";

// Replaced in step 2 with profile extraction.
export async function POST() {
  return json({ reply: "Chat extraction is not wired up yet." });
}
