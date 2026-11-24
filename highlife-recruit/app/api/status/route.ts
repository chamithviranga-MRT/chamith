import { NextResponse, type NextRequest } from "next/server";
import { exaKey, hasClaude, hasExa, modelName, provider } from "@/lib/ai";

export const dynamic = "force-dynamic";

// Public health check. With ?check=exa&team=<ACCESS_CODE> it also runs one tiny live Exa search.
export async function GET(req: NextRequest) {
  const body: Record<string, unknown> = { exa: hasExa(), claude: hasClaude(), provider: provider(), model: modelName() };
  const sp = req.nextUrl.searchParams;
  if (sp.get("check") === "exa" && process.env.ACCESS_CODE && sp.get("team") === process.env.ACCESS_CODE && hasExa()) {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": exaKey() ?? "" },
      body: JSON.stringify({ query: "SME relationship manager at a bank in Colombo, Sri Lanka", category: "people", numResults: 3 }),
    });
    const json = (await res.json().catch(() => ({}))) as { results?: { title?: string; url: string }[]; error?: string };
    body.exaCheck = res.ok
      ? { ok: true, results: (json.results ?? []).map((r) => ({ title: r.title, url: r.url })) }
      : { ok: false, status: res.status, error: json.error ?? "unknown", keyLength: exaKey()?.length, keyShape: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exaKey() ?? "") ? "uuid" : "other" };
  }
  return NextResponse.json(body);
}
