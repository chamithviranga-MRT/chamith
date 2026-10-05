const TWO_LEVEL_TLDS = new Set(["co.uk", "com.au", "co.nz", "com.br", "co.in", "com.mx"]);

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Registrable domain (approximate; good enough for same-site checks without a public-suffix list). */
export function registrableDomain(hostOrUrl: string): string | null {
  const host = hostOrUrl.includes("/") ? hostOf(hostOrUrl) : hostOrUrl.toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  return TWO_LEVEL_TLDS.has(last2) ? parts.slice(-3).join(".") : last2;
}

export function sameSite(url: string, domain: string): boolean {
  const a = registrableDomain(url);
  const b = registrableDomain(domain);
  return Boolean(a && b && a === b);
}

// Never fetch anything that sits behind a login or is an account/transaction flow.
const DENY_AUTH = /(^|[/._-])(log-?in|log-?on|sign-?in|sign-?on|sso|oauth2?|auth(?:enticate)?|session|my-?account|myaccount|online-?banking|portal|dashboard|cart|checkout|password|forgot|reset|logout|signup|sign-up|register)([/._-]|$)/i;
// Content that cannot describe a financing product.
const DENY_CONTENT = /(^|[/._-])(blog|news|newsroom|press|careers?|jobs|about-us|investors?|investor-relations|privacy|terms|legal|cookies?|sitemap|security-center|fraud|contact|locations?|branch(?:es)?|atm|calculators?-?tools?|podcast|events?|webinars?|reviews?|testimonials?|espanol|es)([/._-]|$)/i;
const DENY_FILE = /\.(?:pdf|jpe?g|png|gif|svg|webp|zip|xlsx?|docx?|mp4|mp3|css|js|xml|json)$/i;

export function isDeniedUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (u.protocol !== "https:") return true;
  if (DENY_FILE.test(u.pathname)) return true;
  const hostAndPath = `${u.hostname.split(".")[0]}${u.pathname}`;
  return DENY_AUTH.test(u.pathname) || DENY_AUTH.test(u.hostname.split(".")[0] + "/") || DENY_CONTENT.test(u.pathname) || /^(login|secure|online|my|ebank|auth)\b/.test(hostAndPath.toLowerCase());
}

const PRODUCT_WORDS = /(loan|lending|line-of-credit|lines-of-credit|credit-line|loc\b|financing|funding|capital|sba|microloan|micro-loan|equipment|factoring|merchant-cash|cash-advance|credit-card|working-capital|term-loan|mortgage|invoice|business-credit|small-business|startup|real-estate|commercial-real)/i;

export function scoreProductUrl(url: string, opts: { hints?: string[]; title?: string; description?: string } = {}): number {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return -Infinity;
  }
  const path = u.pathname.toLowerCase();
  let score = 0;
  const words = path.split(/[/_.-]+/).filter(Boolean);
  if (PRODUCT_WORDS.test(path)) score += 3;
  for (const h of opts.hints ?? []) {
    const toks = h.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const hit = toks.filter((t) => path.includes(t)).length;
    if (toks.length && hit / toks.length >= 0.5) score += 2;
  }
  const meta = `${opts.title ?? ""} ${opts.description ?? ""}`.toLowerCase();
  if (/(loan|line of credit|financing|sba|credit card|factoring)/.test(meta)) score += 1;
  if (/(apply|application|get-started|start)/.test(path)) score -= 1; // forms, not product facts
  if (/(rates?|fees?|requirements?|eligibility|faq)/.test(path)) score += 0.5; // often hold the numbers
  const depth = words.length > 0 ? path.split("/").filter(Boolean).length : 0;
  if (depth === 0) score -= 2;
  if (depth > 5) score -= 1;
  return score - depth * 0.01; // prefer shorter paths on ties
}

export interface LinkHit {
  url: string;
  title?: string;
  description?: string;
}

/** Same-site, non-denied, product-looking URLs, best first. */
export function rankProductUrls(links: LinkHit[], domain: string, hints: string[], max: number): LinkHit[] {
  const seen = new Set<string>();
  const scored: Array<{ hit: LinkHit; score: number }> = [];
  for (const l of links) {
    if (!l?.url || !sameSite(l.url, domain) || isDeniedUrl(l.url)) continue;
    const clean = l.url.split("#")[0].replace(/\/+$/, "");
    if (seen.has(clean)) continue;
    seen.add(clean);
    const score = scoreProductUrl(l.url, { hints, title: l.title, description: l.description });
    if (score >= 2) scored.push({ hit: { ...l, url: l.url.split("#")[0] }, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.hit);
}

/** A page that is really a login/consent wall: do not treat as product content. */
export function looksLikeLoginWall(markdown: string): boolean {
  const t = markdown.slice(0, 3000).toLowerCase();
  const short = markdown.length < 1500;
  return short && /(sign in to continue|log in to (?:view|continue)|enter your password|forgot (?:your )?password|access denied|verify you are human|please enable javascript)/.test(t);
}
