import { NextResponse } from "next/server";
import { z } from "zod";
import { askJson, errorMessage, hasClaude } from "@/lib/ai";

export const maxDuration = 60;

const Card = z.object({
  title: z.string(),
  team: z.string(),
  hours: z.string(),
  summary: z.string(),
  suggestedSalaryCapLkr: z.number().nullable(),
  mustHaves: z.array(z.string()),
  searchQueries: z.array(z.string()),
  criteria: z.array(
    z.object({ label: z.string(), weight: z.number().int(), meaning: z.string(), s1: z.string(), s3: z.string(), s5: z.string() }),
  ),
});

export async function POST(req: Request) {
  const { jd, salaryCapLkr } = (await req.json()) as { jd: string; salaryCapLkr?: number };
  if (!jd || jd.trim().length < 80) return NextResponse.json({ error: "Paste the full job description." }, { status: 400 });
  if (!hasClaude()) {
    return NextResponse.json(
      { error: "Turning a JD into a scorecard needs Claude. Turn on Vercel AI Gateway for this project to enable it." },
      { status: 400 },
    );
  }
  try {
    const out = await askJson(
      Card,
      `You turn job descriptions into recruiting scorecards for sourcing candidates in Sri Lanka from public profiles (LinkedIn and career sites).
Make 5–7 criteria that can be judged from a public profile. Weights are whole numbers that sum to exactly 100. Each criterion has anchor text for scores 1, 3 and 5.
Write 3 web search queries that would find matching Sri Lankan profiles. Keep the role title exactly as written in the JD.`,
      `Monthly salary cap (LKR): ${salaryCapLkr ?? "not given"}\n\nJob description:\n"""\n${jd.slice(0, 20000)}\n"""`,
      "medium",
    );
    const sum = out.criteria.reduce((s, c) => s + c.weight, 0) || 1;
    const criteria = out.criteria.map((c, i) => ({
      ...c,
      key: `c${i + 1}_${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}`,
      weight: Math.round((c.weight / sum) * 100),
    }));
    return NextResponse.json({ scorecard: { ...out, criteria } });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 502 });
  }
}
