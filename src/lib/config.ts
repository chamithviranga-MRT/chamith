// Central runtime configuration. Secrets come from .env only.

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

/** Lender/product cache time-to-live. Spec: 7 days. */
export const CACHE_TTL_DAYS = 7;
export const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Cap on lenders scanned per run (registry + discovered). */
export const MAX_LENDERS_PER_RUN = Number(process.env.LENDMATCH_MAX_LENDERS || 40);

/** Firecrawl agent is a costly fallback; opt in via env. */
export const USE_FIRECRAWL_AGENT = process.env.FIRECRAWL_USE_AGENT === "1";

export const hasAnthropicKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const hasFirecrawlKey = () => Boolean(process.env.FIRECRAWL_API_KEY);

export const DISCLAIMER =
  "Informational only — not financial or legal advice. Rates, fees and eligibility change often. " +
  "Always confirm terms directly with the lender before applying.";
