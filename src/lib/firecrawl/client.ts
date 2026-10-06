import Firecrawl from "@mendable/firecrawl-js";
import type { LinkHit } from "./urls";

/** Everything the pipeline needs from the web. Firecrawl is the only implementation; tests inject fakes. */
export interface PageResult {
  url: string;
  markdown: string;
  json: unknown;
  title?: string;
  statusCode?: number;
}

export interface WebClient {
  search(query: string, opts: { limit: number }): Promise<LinkHit[]>;
  map(url: string, opts: { search?: string; limit: number }): Promise<LinkHit[]>;
  /** Scrape a page returning its markdown plus structured JSON extracted with the given schema. */
  scrapeProducts(url: string, opts: { prompt: string; schema: Record<string, unknown> }): Promise<PageResult>;
  /** Plain text of a URL (used for robots.txt). */
  scrapeText(url: string): Promise<string | null>;
  /** How many concurrent Firecrawl jobs we may run right now. */
  availableConcurrency(): Promise<number>;
  /** Optional: ask Firecrawl's agent where product pages live (used only for page DISCOVERY; values are still verified). */
  agentFindPages?(domain: string, prompt: string): Promise<LinkHit[]>;
}

export class WebError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Fatal = credentials/credits problem: stop the whole run rather than retry. */
    readonly fatal = false
  ) {
    super(message);
    this.name = "WebError";
  }
}

export function toWebError(e: unknown): WebError {
  if (e instanceof WebError) return e;
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : undefined;
  const message = e instanceof Error ? e.message : String(e);
  return new WebError(message, status, status === 401 || status === 402);
}

/** 404/410/451 will not get better by retrying; everything else (timeouts, 429, 5xx, 403 bot-blocks) is retried. */
export function isRetryableWebError(e: unknown): boolean {
  const err = toWebError(e);
  if (err.fatal) return false;
  return !(err.status === 404 || err.status === 410 || err.status === 451);
}

export class FirecrawlWeb implements WebClient {
  constructor(private readonly fc: Firecrawl) {}

  static fromEnv(): FirecrawlWeb | null {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    return apiKey ? new FirecrawlWeb(new Firecrawl({ apiKey })) : null;
  }

  async search(query: string, opts: { limit: number }): Promise<LinkHit[]> {
    try {
      const res = await this.fc.search(query, { limit: opts.limit, sources: ["web"] });
      const hits: LinkHit[] = [];
      for (const r of res.web ?? []) {
        const url = "url" in r && r.url ? r.url : (r as { metadata?: { sourceURL?: string } }).metadata?.sourceURL;
        if (!url) continue;
        hits.push({ url, title: "title" in r ? (r.title as string | undefined) : undefined, description: "description" in r ? (r.description as string | undefined) : undefined });
      }
      return hits;
    } catch (e) {
      throw toWebError(e);
    }
  }

  async map(url: string, opts: { search?: string; limit: number }): Promise<LinkHit[]> {
    try {
      const res = await this.fc.map(url, { search: opts.search, limit: opts.limit, sitemap: "include" });
      return (res.links ?? []).map((l) => ({ url: l.url, title: l.title, description: l.description }));
    } catch (e) {
      throw toWebError(e);
    }
  }

  async scrapeProducts(url: string, opts: { prompt: string; schema: Record<string, unknown> }): Promise<PageResult> {
    try {
      const doc = await this.fc.scrape(url, {
        formats: ["markdown", { type: "json", prompt: opts.prompt, schema: opts.schema, checkPromptInjection: true }],
        onlyMainContent: true,
        timeout: 60_000,
      });
      return {
        url,
        markdown: doc.markdown ?? "",
        json: doc.json ?? null,
        title: doc.metadata?.title,
        statusCode: doc.metadata?.statusCode,
      };
    } catch (e) {
      throw toWebError(e);
    }
  }

  async scrapeText(url: string): Promise<string | null> {
    try {
      const doc = await this.fc.scrape(url, { formats: ["markdown"], onlyMainContent: false, timeout: 30_000 });
      return doc.markdown ?? null;
    } catch (e) {
      const err = toWebError(e);
      if (err.status === 404 || err.status === 410) return null; // no robots.txt = no restrictions
      throw err;
    }
  }

  async availableConcurrency(): Promise<number> {
    try {
      const c = await this.fc.getConcurrency();
      return Math.max(1, (c.maxConcurrency ?? 2) - (c.concurrency ?? 0));
    } catch {
      return 2; // conservative default if the endpoint is unavailable
    }
  }

  async agentFindPages(domain: string, prompt: string): Promise<LinkHit[]> {
    try {
      const res = await this.fc.agent({
        prompt,
        urls: [`https://${domain}`],
        schema: {
          type: "object",
          properties: { pages: { type: "array", items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" } }, required: ["url"] } } },
          required: ["pages"],
        },
        maxCredits: 50,
        strictConstrainToURLs: true,
        timeout: 120,
      });
      const data = res.data as { pages?: Array<{ url?: string; title?: string }> } | undefined;
      return (data?.pages ?? []).filter((p): p is { url: string; title?: string } => typeof p.url === "string");
    } catch (e) {
      throw toWebError(e);
    }
  }
}
