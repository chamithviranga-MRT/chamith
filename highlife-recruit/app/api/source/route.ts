import { NextResponse } from "next/server";
import { exaKey, hasExa } from "@/lib/ai";
import type { SourcedProfile } from "@/lib/types";
import { DEMO_PROFILES } from "@/lib/demoProfiles";

export const maxDuration = 60;

interface ExaResult { url: string; title?: string | null; text?: string | null; summary?: string | null }

let lastError = "";

async function exaSearch(body: Record<string, unknown>): Promise<ExaResult[] | null> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": exaKey() ?? "" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    lastError = `Exa error ${res.status}: ${detail.slice(0, 200)}`;
    console.error(lastError);
    // Auth and billing errors won't change with a different query shape.
    if (res.status === 401 || res.status === 402 || res.status === 403) throw new Error(lastError);
    return null;
  }
  const json = (await res.json()) as { results?: ExaResult[] };
  return json.results ?? [];
}

export async function POST(req: Request) {
  const { query, roleId, numResults = 8 } = (await req.json()) as { query: string; roleId: string; numResults?: number };
  if (!query?.trim()) return NextResponse.json({ error: "Enter a search." }, { status: 400 });

  if (!hasExa()) {
    const profiles = DEMO_PROFILES.filter((p) => p.roleId === roleId).map(({ roleId: _r, ...p }) => p);
    return NextResponse.json({ mode: "demo", profiles });
  }

  const base = { query, type: "auto", numResults: Math.min(numResults, 20), contents: { text: { maxCharacters: 3000 } } };
  // Exa's people index first, then LinkedIn profiles by domain as a fallback.
  let results: ExaResult[] | null = null;
  try {
    results =
      (await exaSearch({ ...base, category: "people" })) ??
      (await exaSearch({ ...base, category: "linkedin profile" })) ??
      (await exaSearch({ ...base, includeDomains: ["linkedin.com"] }));
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
  if (!results) {
    // Keep the demo moving: show the saved snapshot and say why live search failed.
    const profiles = DEMO_PROFILES.filter((p) => p.roleId === roleId).map(({ roleId: _r, ...p }) => p);
    const billing = /\b402\b|credit/i.test(lastError);
    const warning = billing
      ? "Live Exa search is out of credits. Top up at dashboard.exa.ai. Showing the saved snapshot instead."
      : `Live Exa search failed (${lastError || "no response"}). Showing the saved snapshot instead.`;
    return NextResponse.json({ mode: "demo", warning, profiles });
  }

  results = results.filter((r) => /linkedin\.com\/in\//i.test(r.url) || r.text);
  const profiles: SourcedProfile[] = results.map((r) => ({
    url: r.url,
    title: r.title ?? r.url,
    text: (r.text ?? r.summary ?? "").slice(0, 3000),
  }));
  return NextResponse.json({ mode: "live", profiles });
}
