import { NextResponse } from "next/server";
import { exaKey } from "@/lib/ai";
import { scoreProfile } from "@/lib/scoring";
import type { Role } from "@/lib/types";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 15000;

async function fileText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) return buf.toString("utf8");
  throw new Error("Upload a PDF, Word (.docx) or text file.");
}

/** Read a public profile page through Exa's contents API. Never logs in to LinkedIn. */
async function urlText(url: string): Promise<{ title: string; text: string } | null> {
  const key = exaKey();
  if (!key) return null;
  const res = await fetch("https://api.exa.ai/contents", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ urls: [url], text: { maxCharacters: MAX_TEXT } }),
  });
  if (!res.ok) {
    console.error("exa contents", res.status, await res.text().catch(() => ""));
    return null;
  }
  const json = (await res.json()) as { results?: { title?: string; text?: string }[] };
  const r = json.results?.[0];
  if (!r?.text || r.text.trim().length < 80) return null;
  return { title: r.title ?? url, text: r.text };
}

export async function POST(req: Request) {
  const form = await req.formData();
  const role = JSON.parse(String(form.get("role") ?? "null")) as Role | null;
  if (!role) return NextResponse.json({ error: "Pick a role." }, { status: 400 });
  const rawUrl = String(form.get("url") ?? "").trim();
  const pasted = String(form.get("text") ?? "").trim();
  const file = form.get("file");

  const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl;
  let text = "";
  let title = "";
  let source = "";
  let kind = "Profile";

  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 8 MB." }, { status: 400 });
      text = await fileText(file);
      title = text.split("\n").map((l) => l.trim()).find((l) => l.length > 2 && l.length < 60) ?? file.name;
      source = `CV upload: ${file.name}`;
      kind = "CV";
    } else if (pasted) {
      text = pasted;
      title = url || "Pasted profile";
      source = url ? `Pasted profile text (${url})` : "Pasted profile text";
    } else if (url) {
      const got = await urlText(url);
      if (!got) {
        return NextResponse.json(
          { needText: true, error: "Couldn't read that profile automatically. Open it, copy the page text (Ctrl+A, Ctrl+C) and paste it below." },
          { status: 422 },
        );
      }
      text = got.text;
      title = got.title;
      source = `Profile link via Exa: ${url}`;
    } else {
      return NextResponse.json({ error: "Upload a CV, paste a LinkedIn link, or paste profile text." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  text = text.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, MAX_TEXT);
  if (text.length < 80) return NextResponse.json({ error: "Not enough readable text in that file. If it's a scanned PDF, paste the text instead." }, { status: 400 });

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = text.match(/(?:\+94|0)\s?7\d[\s-]?\d{3}[\s-]?\d{4}/)?.[0] ?? null;
  const outcome = await scoreProfile(role, { url: url || source, title, text }, kind);
  return NextResponse.json({ ...outcome, source, url: url || null, email, phone, chars: text.length });
}
