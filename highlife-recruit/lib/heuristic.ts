import type { Role, SourcedProfile } from "./types";
import { weightedScore } from "./types";

// Rule-based fallback scorer used only in demo mode (no AI Gateway or Anthropic credentials).
const SIGNALS: Record<string, RegExp[]> = {
  sales: [/target/i, /award/i, /best/i, /top/i, /exceed|surpass/i, /new business|acquisition/i],
  outbound: [/cold call/i, /prospect/i, /lead/i, /outbound|dial/i, /canvass/i, /referral/i],
  customer: [/relationship/i, /portfolio/i, /client/i, /\d{2,}\+? (sme )?clients/i, /retention/i],
  financial: [/loan|lending|credit/i, /bank/i, /sme/i, /finance|fintech/i],
  research: [/crm/i, /report/i, /analy/i, /research|database|dashboard/i],
  international: [/us\b|usa|united states|north america|canada/i, /international|overseas|oman|bangladesh/i, /remote|night/i],
  orm: [/reputation/i, /orm\b/i, /crisis/i, /sentiment/i],
  search: [/seo/i, /google|yelp|review/i, /knowledge panel|structured data|gbp/i],
  pr: [/\bpr\b|public relations/i, /media|editor|journalis/i, /fact-check|verification/i],
  team: [/team|staff|mentor|lead\b/i, /head|director|manager/i],
  commercial: [/pricing|budget|p&l|revenue/i, /pitch|scop/i, /founder|managing director/i],
};

function bucket(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("sales drive")) return "sales";
  if (l.includes("outbound")) return "outbound";
  if (l.includes("customer")) return "customer";
  if (l.includes("financial")) return "financial";
  if (l.includes("research")) return "research";
  if (l.includes("orm")) return "orm";
  if (l.includes("search")) return "search";
  if (l.includes("digital pr")) return "pr";
  if (l.includes("team")) return "team";
  if (l.includes("commercial")) return "commercial";
  return "international";
}

export function heuristicScore(role: Role, p: SourcedProfile) {
  const text = `${p.title}\n${p.text}`;
  const scores: Record<string, number> = {};
  for (const c of role.criteria) {
    const hits = (SIGNALS[bucket(c.label)] ?? []).filter((re) => re.test(text)).length;
    scores[c.key] = Math.max(1, Math.min(5, 1 + Math.round(hits * 1.4)));
  }
  const [namePart, rest = ""] = p.title.split(" – ");
  const [titlePart, companyPart = ""] = rest.split(/ at | , |, /);
  const outsideSl = /sweden|uppsala|dubai|australia|canada|uk\b|london/i.test(text.split(".")[0] + " " + text.slice(0, 80));
  const overCap = /founder|chairperson|managing director|\bvp\b|vice president|country head/i.test(text);
  const flags: string[] = [];
  if (outsideSl) flags.push("Profile location is outside Sri Lanka.");
  if (/seeking gcc/i.test(text)) flags.push("Says they are seeking GCC roles, not remote US work.");
  if (overCap) flags.push(`Seniority suggests pay above the LKR ${role.salaryCapLkr.toLocaleString()} cap.`);
  const yrs = text.match(/(\d{1,2})\+? years/);
  return {
    name: namePart.trim(),
    title: titlePart?.trim() || rest,
    company: companyPart.trim(),
    location: outsideSl ? (text.match(/Location: ([^.]+)/)?.[1] ?? "Outside Sri Lanka") : "Sri Lanka",
    yearsExp: yrs ? Number(yrs[1]) : null,
    basedInSriLanka: !outsideSl,
    scores,
    score: weightedScore(role.criteria, scores),
    evidence: p.text.split(". ").slice(1, 4).join(". ").slice(0, 300),
    redFlags: flags.join(" ") || "None found in the public text.",
    openToWork: /open to work|seeking a new role|looking for new opportunities/i.test(text),
    overCap,
    outreachAngle: "",
    reasons: ["Demo mode: rule-based keyword scoring. Claude scoring with reasons runs once AI Gateway is on."],
  };
}
