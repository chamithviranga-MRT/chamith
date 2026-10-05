import type { Profile } from "@/lib/profile/schema";
import { US_STATES } from "@/lib/profile/geo";
import { hostOf, registrableDomain } from "./urls";
import type { LinkHit } from "./urls";

function ficoBand(p: Profile): "poor" | "fair" | "good" | "excellent" | null {
  const f = p.ficoMax ?? p.ficoMin;
  if (f === null) return null;
  return f < 580 ? "poor" : f < 670 ? "fair" : f < 740 ? "good" : "excellent";
}

/**
 * Builds Firecrawl search queries from the profile ("SBA microloan startup no revenue",
 * "equipment financing fair credit", ...). The registry is only a starting point; these queries are
 * how lenders the registry does not know about get found.
 */
export function buildDiscoveryQueries(p: Profile, max = 6): string[] {
  const band = ficoBand(p);
  const credit = band === "poor" ? "bad credit" : band === "fair" ? "fair credit" : band === "good" ? "good credit" : band === "excellent" ? "excellent credit" : "";
  const q: string[] = [];
  const startup = p.borrowerType === "startup" || p.timeInBusinessMonths === 0 || (p.timeInBusinessMonths !== null && p.timeInBusinessMonths < 12);
  const noRevenue = p.monthlyRevenue === 0;

  if (startup) {
    q.push(`SBA microloan startup ${noRevenue ? "no revenue" : "new business"}`);
    q.push(`startup business loan ${credit}`.trim());
  }
  switch (p.purpose) {
    case "equipment":
      q.push(`equipment financing ${credit}`.trim());
      q.push("equipment loan small business lenders");
      break;
    case "real_estate":
      q.push("investment property loan real estate investors lender");
      q.push("SBA 504 commercial real estate loan");
      break;
    case "working_capital":
      q.push(`working capital loan small business ${credit}`.trim());
      q.push(`business line of credit ${credit}`.trim());
      break;
    case "vehicle":
      q.push(`commercial vehicle loan small business ${credit}`.trim());
      break;
    case "inventory":
      q.push(`inventory financing small business ${credit}`.trim());
      break;
    case "expansion":
      q.push(`small business expansion loan ${credit}`.trim());
      q.push("SBA 7(a) loan expansion");
      break;
    case "debt_consolidation":
      q.push(`business debt consolidation loan ${credit}`.trim());
      break;
  }
  if (p.borrowerType === "real_estate_investor") q.push("DSCR loan real estate investor");
  if (p.borrowerType === "personal_for_business") q.push(`personal loan for business use ${credit}`.trim());
  if (p.ownerCountry && p.ownerCountry !== "US") q.push("business loan foreign national US LLC non-resident owner");
  if (p.businessState && US_STATES[p.businessState]) q.push(`${US_STATES[p.businessState]} small business loan CDFI community lender`);
  if (credit && !startup && p.purpose !== "equipment") q.push(`small business loans ${credit}`);

  return [...new Set(q.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, max);
}

/** Editorial / review / aggregator / social domains are sources ABOUT lenders, never lenders themselves. */
export const NON_LENDER_DOMAINS = new Set([
  "nerdwallet.com", "forbes.com", "bankrate.com", "investopedia.com", "businessinsider.com", "reddit.com", "youtube.com",
  "wikipedia.org", "quora.com", "facebook.com", "linkedin.com", "twitter.com", "x.com", "instagram.com", "medium.com",
  "fundera.com", "lendingtree.com", "business.com", "uschamber.com", "sba.gov", "irs.gov", "usa.gov", "consumerfinance.gov",
  "fdic.gov", "ftc.gov", "trustpilot.com", "bbb.org", "yelp.com", "creditkarma.com", "experian.com", "equifax.com",
  "transunion.com", "fool.com", "cnbc.com", "cnn.com", "nytimes.com", "wsj.com", "forbesadvisor.com", "gobankingrates.com",
  "smartasset.com", "thebalancemoney.com", "google.com", "bing.com", "amazon.com", "pinterest.com", "shopify.com",
  "intuit.com", "score.org",
]);

export interface Candidate {
  domain: string;
  name: string;
  category: "SBA" | "Conventional" | "Alternative";
  seedUrls: string[];
}

function nameFromHit(hit: LinkHit, domain: string): string {
  const fromTitle = (hit.title ?? "").split(/[|–—:-]/)[0].replace(/\b(business|small business|loans?|financing|lending|home|official site)\b/gi, "").trim();
  if (fromTitle.length >= 3 && fromTitle.length <= 40) return fromTitle;
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function classifyCategory(hit: LinkHit, domain: string): Candidate["category"] {
  const meta = `${hit.title ?? ""} ${hit.description ?? ""} ${hit.url}`.toLowerCase();
  if (/\bsba\b|small business administration|microloan/.test(meta) && !/\bbank\b/.test(domain)) return "SBA";
  if (/\bbank\b|credit union|bancorp|\bfcu\b/.test(`${hit.title ?? ""} ${domain}`.toLowerCase())) return "Conventional";
  return "Alternative";
}

/** Turn raw search results into new lender candidates, skipping aggregators and already-known domains. */
export function candidatesFromSearch(hits: LinkHit[], knownDomains: Set<string>, max: number): Candidate[] {
  const byDomain = new Map<string, Candidate>();
  for (const hit of hits) {
    const host = hostOf(hit.url);
    const domain = host ? registrableDomain(host) : null;
    if (!domain || NON_LENDER_DOMAINS.has(domain) || knownDomains.has(domain)) continue;
    if (!hit.url.startsWith("https://")) continue;
    const existing = byDomain.get(domain);
    if (existing) {
      if (!existing.seedUrls.includes(hit.url)) existing.seedUrls.push(hit.url);
      continue;
    }
    byDomain.set(domain, { domain, name: nameFromHit(hit, domain), category: classifyCategory(hit, domain), seedUrls: [hit.url] });
  }
  return [...byDomain.values()].slice(0, max);
}
