import { NextResponse } from "next/server";
import { z } from "zod";
import { askJson, errorMessage, hasClaude } from "@/lib/ai";
import type { Candidate, Role } from "@/lib/types";

export const maxDuration = 60;

const Draft = z.object({
  linkedinNote: z.string(),
  emailSubject: z.string(),
  emailBody: z.string(),
});

function templateDraft(role: Role, c: Candidate, sender: string) {
  const first = c.name.split(" ")[0];
  const hook = (c.evidence || c.whyShortlisted || "").split(/[.;]/)[0].trim();
  return {
    linkedinNote: `Hi ${first}, I lead Highlife and came across your work at ${c.company}. We're hiring a ${role.title} (remote from Sri Lanka, US Pacific hours) and your background stood out. Open to a short chat this week? – ${sender}`.slice(0, 300),
    emailSubject: `${role.title} – remote role with a US team`,
    emailBody: `Hi ${first},\n\nI'm ${sender} from Highlife. We're building a remote team in Sri Lanka that works with our US business, and we're hiring a ${role.title}.\n\nYour background caught my eye, in particular: ${hook.charAt(0).toLowerCase() + hook.slice(1)}.\n\nThe role is fully remote from Sri Lanka (${role.hours}). If it sounds interesting, could we have a 20-minute call this week? I'm happy to share the full job description first.\n\nBest regards,\n${sender}\nHighlife`,
  };
}

export async function POST(req: Request) {
  const { role, candidate, sender = "Chamith" } = (await req.json()) as { role: Role; candidate: Candidate; sender?: string };

  if (!hasClaude()) {
    return NextResponse.json({ mode: "demo", draft: { ...templateDraft(role, candidate, sender), generatedBy: "Template (demo mode)" } });
  }
  try {
    const out = await askJson(
      Draft,
      `You write warm, concise recruiting outreach for Highlife, a US company hiring remote staff in Sri Lanka on US Pacific hours.
Rules: personalise with one specific, true detail from the evidence; never invent facts; no salary numbers; no hype words; plain professional English.
LinkedIn note: at most 280 characters, no subject line. Email: 90–150 words, a clear ask for a 20-minute call, signed by the sender.`,
      `Sender: ${sender}, CEO of Highlife.
Role: ${role.title} (${role.team}). ${role.summary} Hours: ${role.hours}.
Candidate: ${candidate.name}, ${candidate.title} at ${candidate.company}, ${candidate.location}.
Evidence: ${candidate.evidence}
Suggested angle: ${candidate.outreachAngle ?? "none"}
Things to check later (do not mention): ${candidate.checkAtFirstCall ?? candidate.redFlags}`,
      "medium",
    );
    return NextResponse.json({ mode: "live", draft: { ...out, generatedBy: "Claude" } });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 502 });
  }
}
