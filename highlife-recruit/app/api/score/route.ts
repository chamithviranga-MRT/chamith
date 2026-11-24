import { NextResponse } from "next/server";
import { z } from "zod";
import { askJson, errorMessage, hasClaude } from "@/lib/ai";
import type { Criterion, Role, SourcedProfile } from "@/lib/types";
import { weightedScore } from "@/lib/types";
import { heuristicScore } from "@/lib/heuristic";

export const maxDuration = 60;

const Scored = z.object({
  name: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  yearsExp: z.number().nullable(),
  basedInSriLanka: z.boolean(),
  scores: z.array(z.object({ key: z.string(), score: z.number().int().min(1).max(5), reason: z.string() })),
  evidence: z.string(),
  redFlags: z.string(),
  openToWork: z.boolean(),
  likelyOverCap: z.boolean(),
  outreachAngle: z.string(),
});

const SYSTEM = `You are a recruiter for Highlife, hiring remote staff in Sri Lanka who work US Pacific hours.
You score public profile text against a weighted scorecard. Be strict and evidence-based: score 1 when the profile shows no evidence, 3 for partial evidence, 5 only for strong named evidence.
Use only what the profile text says. Never invent employers, numbers or awards. Write short, plain sentences.
Flag likelyOverCap when the person's seniority (for example founder, managing director, VP or country head) suggests pay well above the monthly cap.
Set openToWork true only if the text explicitly says they are open to work or seeking a role.`;

function criteriaText(criteria: Criterion[]) {
  return criteria
    .map((c) => `- key "${c.key}": ${c.label} (weight ${c.weight}%). ${c.meaning}. 1 = ${c.s1}; 3 = ${c.s3}; 5 = ${c.s5}.`)
    .join("\n");
}

export async function POST(req: Request) {
  const { role, profile } = (await req.json()) as { role: Role; profile: SourcedProfile };

  if (!hasClaude()) {
    return NextResponse.json({ mode: "demo", result: heuristicScore(role, profile) });
  }

  try {
    const out = await askJson(
      Scored,
      SYSTEM,
      `Role: ${role.title} (${role.team}). ${role.summary}
Monthly salary cap: LKR ${role.salaryCapLkr.toLocaleString()}. Hours: ${role.hours}.
Must-haves: ${role.mustHaves.join("; ")}.

Scorecard:
${criteriaText(role.criteria)}

Profile URL: ${profile.url}
Profile title: ${profile.title}
Profile text:
"""
${profile.text}
"""

Return one score per scorecard key.`,
    );
    const scores: Record<string, number> = {};
    for (const c of role.criteria) scores[c.key] = out.scores.find((s) => s.key === c.key)?.score ?? 1;
    const reasons = out.scores.map((s) => `${role.criteria.find((c) => c.key === s.key)?.label ?? s.key}: ${s.reason}`);
    return NextResponse.json({
      mode: "live",
      result: {
        name: out.name,
        title: out.title,
        company: out.company,
        location: out.location,
        yearsExp: out.yearsExp,
        basedInSriLanka: out.basedInSriLanka,
        scores,
        score: weightedScore(role.criteria, scores),
        evidence: out.evidence,
        redFlags: out.redFlags,
        openToWork: out.openToWork,
        overCap: out.likelyOverCap,
        outreachAngle: out.outreachAngle,
        reasons,
      },
    });
  } catch (err) {
    console.error("score failed", err);
    const result = heuristicScore(role, profile);
    result.reasons = [`Claude unavailable (${errorMessage(err)}). Fell back to rule-based scoring.`, ...result.reasons.slice(1)];
    return NextResponse.json({ mode: "fallback", warning: errorMessage(err), result });
  }
}
