import type { MessagesClient } from "@/lib/anthropic";
import { createClaudeExtractor } from "@/lib/profile/claudeExtractor";
import { processUserMessage } from "@/lib/profile/process";
import { emptyProfile, type Profile } from "@/lib/profile/schema";
import { rankProducts } from "@/lib/matching/rank";
import type { RankResult } from "@/lib/matching/types";
import { generateReasoning } from "@/lib/reasoning/claude";
import { buildReport } from "@/lib/report/build";
import type { Report } from "@/lib/report/types";
import type { StoredProduct } from "@/lib/types";
import type { LenderOutcome, PipelineResult } from "@/lib/firecrawl/pipeline";
import { auditReport, type Flag } from "./audit";
import type { Persona } from "./personas";

export interface PersonaOutcome {
  persona: Persona;
  profile: Profile;
  extractionMismatches: string[];
  missingRequired: string[];
  mode: "claude" | "offline" | "offline_fallback";
  rank: RankResult;
  report: Report;
  flags: Flag[];
  /** Disagreements between the engine and the independent oracle. */
  oracle: string[];
  personaChecks: string[];
  products: number;
  /** Per-lender research outcomes; empty when the products came from fixtures. */
  lenderOutcomes: LenderOutcome[];
}

/** Why fewer than 10 products are shown, taken from the engine's own notes (never an empty explanation). */
export function shortfallText(report: Pick<Report, "items" | "notes">, topN = 10): string {
  if (report.items.length >= topN) return "";
  const why = report.notes.filter((n) => /^(Only|At most)/.test(n)).join(" ");
  return ` (fewer than ${topN} — ${why || "see the lender coverage below"})`;
}

/** What a live loader returns: the products plus how each lender fared. */
export interface LoadedProducts {
  products: StoredProduct[];
  outcomes: LenderOutcome[];
  stats: PipelineResult["stats"];
}

/** Independent re-statement of the eligibility rules in plain code. Returns the reasons a product is NOT eligible. */
export function oracleViolations(p: Profile, s: StoredProduct): string[] {
  const r = s.record;
  const v: string[] = [];
  const a = p.amountNeeded;
  if (a !== null) {
    if (r.minAmount !== null && a < r.minAmount) v.push("amount below minimum");
    if (r.maxAmount !== null && a > r.maxAmount) v.push("amount above maximum");
  }
  if (r.minFico !== null && p.ficoMax !== null && p.ficoMax < r.minFico) v.push("FICO below minimum");
  if (r.minTimeInBusinessMonths !== null && p.timeInBusinessMonths !== null && p.timeInBusinessMonths < r.minTimeInBusinessMonths) v.push("time in business below minimum");
  const annual = p.annualRevenue ?? (p.monthlyRevenue !== null ? p.monthlyRevenue * 12 : null);
  const monthly = p.monthlyRevenue ?? (p.annualRevenue !== null ? p.annualRevenue / 12 : null);
  if (r.minAnnualRevenue !== null && annual !== null && annual < r.minAnnualRevenue) v.push("annual revenue below minimum");
  if (r.minMonthlyRevenue !== null && monthly !== null && monthly < r.minMonthlyRevenue) v.push("monthly revenue below minimum");
  for (const st of [p.businessState, p.ownerState]) if (st && r.excludedStates.includes(st)) v.push(`state ${st} excluded`);
  for (const c of [p.ownerCountry, p.businessCountry]) if (c && r.excludedCountries.includes(c)) v.push(`country ${c} excluded`);
  const res = p.ownerResidency;
  if (r.residencyRule === "us_citizen" && res !== null && res !== "us_citizen") v.push("US citizenship required");
  if (r.residencyRule === "citizen_or_permanent_resident" && res !== null && res !== "us_citizen" && res !== "permanent_resident") v.push("citizen/permanent resident required");
  if (r.residencyRule === "us_resident" && res === "non_resident") v.push("US residency required");
  if (r.residencyRule === "us_business_address" && p.businessCountry && p.businessCountry !== "US") v.push("US address required");
  if (p.purpose && r.eligiblePurposes.length && !r.eligiblePurposes.includes(p.purpose)) v.push("purpose not permitted");
  if (r.businessUseAllowed === false) v.push("business use not allowed");
  if (r.collateralRequired === "always" && p.collateralAvailable === false) v.push("collateral required, none available");
  if (r.personalGuarantee === "required" && p.willingPersonalGuarantee === false) v.push("guarantee required, unwilling");
  if (r.uccLien === true && p.willingUccLien === false) v.push("UCC lien, unwilling");
  if (p.hasBankruptcy === true && r.bankruptcyLookbackYears !== null && (r.bankruptcyLookbackYears === 99 || (p.bankruptcyYearsAgo !== null && p.bankruptcyYearsAgo < r.bankruptcyLookbackYears))) v.push("bankruptcy disqualifies");
  if (p.hasTaxLiens === true && r.taxLiensDisqualify === true) v.push("tax lien disqualifies");
  if (p.recentDefaults === true && r.recentDefaultsDisqualify === true) v.push("recent defaults disqualify");
  return v;
}

/** Persona-specific behaviours that must hold regardless of data. */
const PERSONA_CHECKS: Record<string, (o: { rank: RankResult; report: Report; profile: Profile }) => string[]> = {
  "startup-580": ({ rank }) => rank.top.flatMap((t) => [t.product.record.minTimeInBusinessMonths ? `${t.product.lender.name} needs ${t.product.record.minTimeInBusinessMonths} months in business but this is a startup` : "", t.product.record.minFico !== null && t.product.record.minFico > 580 ? `${t.product.lender.name} needs FICO ${t.product.record.minFico}` : ""]).filter(Boolean),
  "nonus-llc": ({ rank, report }) => {
    const out: string[] = [];
    for (const t of rank.top) {
      const rule = t.product.record.residencyRule;
      if (rule === "us_citizen" || rule === "citizen_or_permanent_resident" || rule === "us_resident") out.push(`${t.product.lender.name} (${rule}) must not be offered to a non-US owner`);
    }
    for (const it of report.items) {
      const rec = rank.top.find((t) => t.product.id === `${it.lenderSlug}:${it.productName}`)?.product.record;
      if (rec?.residencyRule === "us_business_address" && !it.risks.some((r) => /US address/i.test(r))) out.push(`${it.lenderName}: US-address requirement is not flagged in the risks`);
    }
    if (!rank.top.length) out.push("no lender at all was offered to the non-US owner");
    return out;
  },
  "re-investor": ({ rank }) => rank.top.filter((t) => t.product.record.eligiblePurposes.length && !t.product.record.eligiblePurposes.includes("real_estate")).map((t) => `${t.product.lender.name} does not permit real-estate purchases`),
  "contractor-equipment": ({ rank }) => rank.top.filter((t) => t.product.record.eligiblePurposes.length && !t.product.record.eligiblePurposes.includes("equipment")).map((t) => `${t.product.lender.name} does not permit equipment purchases`),
  "restaurant-700": ({ rank }) => (rank.top.length ? [] : ["a 3-year, 700-FICO restaurant should match at least one product"]),
};

export async function evaluatePersona(opts: {
  persona: Persona;
  products: StoredProduct[];
  client: MessagesClient | null;
  /** Use Claude for profile extraction and reasoning when a client is given. */
  now?: Date;
  /** Called with the confirmed profile when the products must be fetched live. */
  loadProducts?: (profile: Profile) => Promise<StoredProduct[] | LoadedProducts>;
}): Promise<PersonaOutcome> {
  const { persona, client } = opts;
  const extraction = await processUserMessage({ text: persona.text, current: emptyProfile(), lastAssistant: null, extractor: client ? createClaudeExtractor(client) : null });
  const profile = extraction.profile;

  const mismatches: string[] = [];
  for (const [k, expected] of Object.entries(persona.expect)) {
    const got = profile[k as keyof Profile];
    if (JSON.stringify(got) !== JSON.stringify(expected)) mismatches.push(`${k}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }

  const loaded = opts.loadProducts ? await opts.loadProducts(profile) : opts.products;
  const live = Array.isArray(loaded) ? null : loaded;
  const products = Array.isArray(loaded) ? loaded : loaded.products;
  const now = opts.now ?? new Date();
  const rank = rankProducts({ profile, products, now });
  const reasoning = await generateReasoning({ items: rank.top, profile, client });
  const report = buildReport({
    ranked: rank, reasoning, now, outcomes: live?.outcomes ?? [],
    stats: live
      ? { sourcesRead: live.stats.sourcesRead, sourcesFromCache: live.stats.sourcesFromCache, lendersTotal: live.stats.lendersTotal, discoveredNew: live.stats.discoveredNew, productsFound: live.stats.productsFound }
      : { sourcesRead: 0, sourcesFromCache: 0, lendersTotal: new Set(products.map((p) => p.lender.slug)).size, discoveredNew: 0, productsFound: products.length },
  });
  const flags = auditReport(report, { products, profile, checkDomains: true });

  // Oracle: nothing ranked may be ineligible, and nothing removed may be eligible.
  const oracle: string[] = [];
  for (const t of rank.top) {
    const bad = oracleViolations(profile, t.product);
    if (bad.length) oracle.push(`RANKED but ineligible: ${t.product.lender.name} — ${t.product.record.productName}: ${bad.join("; ")}`);
  }
  const removedKeys = new Set(rank.removed.map((r) => `${r.lenderName}|${r.productName}`));
  for (const p of products) {
    if (removedKeys.has(`${p.lender.name}|${p.record.productName}`) && oracleViolations(profile, p).length === 0) oracle.push(`REMOVED but eligible: ${p.lender.name} — ${p.record.productName}`);
  }

  const personaChecks = PERSONA_CHECKS[persona.id]?.({ rank, report, profile }) ?? [];
  return { persona, profile, extractionMismatches: mismatches, missingRequired: extraction.missing, mode: extraction.mode, rank, report, flags, oracle, personaChecks, products: products.length, lenderOutcomes: live?.outcomes ?? [] };
}
