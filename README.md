# LendMatch

A chat platform that researches US lending products **live** and returns the **10 best matches** for a borrower, with
plain-language reasons, sources and data ages.

1. The borrower describes their situation. Claude extracts a structured profile (tool-use, strict schema).
2. Missing required fields (amount, purpose, credit range, time in business, location) → **at most 3 short follow-up questions in one message**; never for fields already given, never for SSN / bank numbers / IDs.
3. The profile appears as an **editable card**; the borrower confirms.
4. Firecrawl researches lenders (registry + profile-driven discovery) with a live progress stream ("Scanning SoFi... BHG... Bluevine..." and a live count of sources read).
5. Every product is hard-filtered, scored 0–100, and ranked. Top 10 cards, a sortable comparison table, near misses, a "How I decided" panel, PDF/DOCX export.
6. Follow-ups ("drop anything with a lien", "only under 24 months") re-rank **from cache without re-scraping**.

> **Informational only, not financial or legal advice. Rates change; confirm with the lender.** This notice is shown on every result and in every export.

## Status — read this first

Everything below was built and tested **without live API access**: the build environment had no `ANTHROPIC_API_KEY` or `FIRECRAWL_API_KEY`, and its network policy blocked `api.firecrawl.dev`.

| Verified here | Not verified here (needs your keys) |
|---|---|
| 245 automated tests, typecheck, production build | Real Firecrawl scrape / search / map / concurrency calls |
| Postgres schema, migrations, cache TTL, delete-my-data (real Postgres) | Real Claude calls (extraction, reasoning, follow-up parsing) |
| Intake → confirm → research route guards → results → re-rank → export, over HTTP and in a real browser | Whether the strict tool schemas are accepted as-is (a non-strict retry is built in) |
| Streaming progress UI against a real chunked NDJSON stream | Whether seed-registry domains are still current |
| Matching, cost math (checked against independently computed values), grounding checks, claim audit | Extraction yield and accuracy on real lender pages |

The Claude and Firecrawl code paths are exercised only against injected fakes, with request shapes checked against the installed SDK type definitions. **Run `npm run eval:live` once you have keys** (see below) before trusting any real-world output.

## Setup

Requirements: Node ≥ 20, PostgreSQL ≥ 14.

```bash
npm install                       # also runs `prisma generate`
cp .env.example .env              # then fill in the three values below
createdb lendmatch                # or any empty Postgres database
npx prisma migrate deploy         # creates the tables
npm run dev                       # http://localhost:3000
```

`.env` (git-ignored; never commit it):

```
ANTHROPIC_API_KEY=...             # Claude (default model claude-sonnet-5-5; override with ANTHROPIC_MODEL)
FIRECRAWL_API_KEY=...             # all web access goes through Firecrawl
DATABASE_URL=postgresql://user:pass@localhost:5432/lendmatch?schema=public
# optional
FIRECRAWL_USE_AGENT=0             # 1 = let Firecrawl's agent find product pages when mapping finds none (costs more credits)
LENDMATCH_MAX_LENDERS=40          # cap on lenders per run
```

Without `ANTHROPIC_API_KEY` the app still works in a clearly-labelled **offline mode** (pattern-matching extraction, verified template reasoning). Without `FIRECRAWL_API_KEY` research returns a clear 503 message.

If your environment blocks outbound traffic, allow `api.firecrawl.dev` and `api.anthropic.com`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | 245 tests (Vitest). Postgres-backed tests need `DATABASE_URL`; they skip themselves if the DB is down |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run eval:fixtures` | Five personas end-to-end on the **synthetic** catalog (offline) |
| `npm run eval:live` | Five personas with real Firecrawl research (needs keys + DB) |
| `npm run eval -- --persona=nonus-llc --strict` | One persona; `--strict` exits 1 on any flag |

## How the guardrails are enforced (in code, not in prompts)

| Requirement | Mechanism | Where / test |
|---|---|---|
| Never state a rate, fee or requirement that isn't in scraped data | **Grounding verifier**: every extracted number must appear in the page text (any common rendering: `$5K`, `1.5 million`, `5 years` = 60 months, `24 hours` = 1 day…); every enum/boolean needs a keyword in the text; otherwise it is nulled and listed in `unverifiedFields`. Evidence quotes must be verbatim | `firecrawl/verify.ts` · mutation-checked |
| Claude's reasoning uses only database fields and cites sources | Claude sees only verified fields (as untrusted data). **Code** checks every number in its output against the product's facts, rejects foreign URLs and promises, regenerates once, then falls back to a template that passes the same checker. The **citation line (URL + scraped date) and payment line are always code-generated** | `reasoning/*` · mutation-checked |
| Estimates are marked as estimates; math is in code | `matching/cost.ts` (amortization, IRR-based effective APR, factor rates, factoring fees); every assumption is recorded as text next to the formula | `tests/matching.math.test.ts` (reference values computed independently) |
| Unknown ≠ pass | Unpublished rules are `unknown`, scored at a fixed neutral value, and surfaced as "confirm with the lender" | `matching/gates.ts`, `score.ts` |
| No affiliate bias | Ranking depends only on `config/scoring.json` (weights + anchors); no commission field exists anywhere; a test scans config and models for commission/affiliate/referral terms | `tests/matching.math.test.ts` |
| Scraped text is untrusted | Firecrawl `checkPromptInjection`; extraction is schema-only (numbers/enums); labels stripped of links/markup; injection-looking products dropped; reasoning prompt marks product data as untrusted; model output re-verified | `firecrawl/verify.ts`, `reasoning/verify.ts` |
| Respect robots.txt / no logins | robots.txt fetched (cached 24 h) and evaluated per URL; login/account/portal/blog/PDF URLs are never fetched; login/bot walls detected and skipped | `firecrawl/robots.ts`, `urls.ts` |
| Parallel up to Firecrawl's limit; retry failed pages twice | Shared limiter sized from `getConcurrency()`; 404/410 not retried; 401/402 abort the run | `firecrawl/pool.ts`, `pipeline.ts` |
| "Data unavailable", never invented | A lender with no verifiable product data is marked **data unavailable** with a reason | `pipeline.ts` |
| 7-day cache, data age on every card, per-lender refresh | `Product.expiresAt`; expired data is **never ranked**, even if a refresh fails | `tests/pipeline.test.ts`, `repo.prisma.test.ts` |
| Anonymous session + delete my data | 192-bit random id in an httpOnly cookie; no account/IP stored; `DELETE /api/session` cascades to messages, profile and reports | `session.ts`, schema |
| No SSN / bank numbers / IDs | Never asked (questions are generated in code); SSN/EIN/account/routing/card/passport/licence/DOB/email/phone patterns are **redacted before storage and before the model sees them** | `profile/sanitize.ts` |

## Scoring (editable in `config/scoring.json`, validated to sum to 100)

| Component | Weight | Notes |
|---|---|---|
| Eligibility fit | 30 | Margin over known minimums (FICO, time in business, revenue); unknown = neutral; borderline = low |
| Total cost of capital | 25 | Effective APR (fees included, IRR-solved) → piecewise score; unknown rate = 40 and never rewarded |
| Term & payment fit | 15 | Preferred term, payment as % of monthly revenue, repayment frequency |
| Speed | 10 | Funding days vs days needed |
| Collateral & guarantee burden | 10 | Personal guarantee, UCC lien, collateral (discounted if you said you're willing) |
| Lender reliability & data confidence | 10 | Registry prior (editorial) + field completeness + freshness − unverified fields |

Hard filters (any failure removes the product): amount range, minimum FICO (a range that straddles the minimum is *borderline*, not removed), time in business, revenue, excluded state/country, citizenship/residency (**US-address requirements are flagged explicitly**), permitted use of funds, business-use bans, collateral / guarantee / UCC lien you won't accept, bankruptcy / tax-lien / default policies. Fewer than 10 passing → fewer shown, with the gates that removed the rest and **near misses with exactly what to change**.

Rank 1 is **Pink Diamond**; ranks 2–10 are **Gem**; each carries the lender category (SBA / Conventional / Alternative). At most 2 products per lender (configurable) keep the list diverse.

## Assumptions and choices I made

- **Model**: `claude-sonnet-5-5` (you said "Claude Sonnet"). This model rejects forced `tool_choice`, so tool-use runs with `auto` + a prompt instruction and one re-prompt; strict schema is attempted first with a non-strict retry if the API refuses the schema (the profile schema has ~30 nullable fields).
- **Firecrawl**: `scrape` with a JSON schema is the primary extractor (the SDK marks `extract` as maintenance-mode); `agent` is an optional page-*discovery* fallback only, so values are still verified against page text.
- **Registry**: domains are best-known entry points (not verified); Citi, American Express Business Line of Credit and Happen Bank are located by Firecrawl search instead of a hard-coded domain. SoFi appears in two groups but is one lender.
- **Product types** were extended beyond your list with `commercial_real_estate` (needed for the real-estate-investor persona) and `other`.
- **Profile** adds `ownerResidency` (citizen / permanent resident / visa holder / non-resident): residency rules can't be applied without it.
- **Fee handling**: if a lender doesn't say whether its APR includes fees, the origination fee is added on top (conservative) and the assumption is shown.
- **Rates**: a published range uses its midpoint (payment shown as a range); a start-at-only rate is treated as a best case and lightly penalised.
- **Term** for estimates: your preference (clamped to the lender's range) → midpoint of the published range → a labelled per-type default.
- **Reliability prior** (e.g. 90 for big banks, 40 for discovered lenders) is an editorial judgement in `data/lenders.json` / `config.ts`, shown to you as such; it never reflects commissions.
- **Rate limits** (in-memory, per session): chat 30/10 min, research 3/hour, refresh 10/hour, follow-ups 30/10 min.
- **Follow-up filters** with unknown data (e.g. "no lien" and the lender doesn't say) *keep* the product with a visible flag rather than silently dropping it.
- The pre-existing `index.html` (an unrelated landing page) was left untouched.

## Evaluation

`npm run eval:fixtures` runs the five personas (startup with 580 FICO, 3-year restaurant with 700 FICO, contractor needing equipment, non-US owner of a US LLC, real-estate investor) through profile extraction → ranking → reasoning → **claim audit**, plus an **independent oracle** (separately written eligibility rules that must agree with the engine in both directions) and persona-specific checks. Full output: [`docs/eval-fixtures-results.md`](docs/eval-fixtures-results.md).

> **The committed results use a SYNTHETIC catalog** — 33 products from 21 *fictional* "Fixture …" lenders with invented numbers and `fixtures.example` URLs. They validate the engine, not any real lender. The same code runs on live data with `npm run eval:live`.

| Persona | Products | Passed filters | Shown | Unsourced-claim flags | Oracle | Persona checks |
|---|---|---|---|---|---|---|
| startup-580 | 33 | 3 | 3 (fewer than 10, explained, 6 near misses) | 0 | agree | pass |
| restaurant-700 | 33 | 10 | 10 | 0 | agree | pass |
| contractor-equipment | 33 | 11 | 10 | 0 | agree | pass |
| nonus-llc | 33 | 13 | 10 | 0 | agree | pass |
| re-investor | 33 | 7 | 7 | 0 | agree | pass |

The audit flags: missing/invalid source or scraped date, a number not traceable to the verified record (or the borrower's own profile / the cost estimate), a source off the lender's domain, stale data, unlabelled estimates, promises, foreign URLs, and a missing disclaimer. A tampered report is proven to be caught (`tests/audit.test.ts`).

## Project layout

```
config/scoring.json          editable weights and scoring anchors
data/lenders.json            seed registry (25 lenders; a starting point only)
prisma/                      schema + migrations (user data vs shared public lender data)
src/lib/profile/             extraction (Claude tool-use + offline), redaction, follow-ups, validation
src/lib/firecrawl/           client, registry, discovery, robots, URL safety, pipeline, grounding verifier, cache repo
src/lib/matching/            gates, scoring, cost math, ranking
src/lib/reasoning/           verified reasoning (Claude + template fallback)
src/lib/report/ export/      report model, PDF (pdfkit), DOCX (docx)
src/lib/followup/            follow-up parsing and cache-only re-ranking
src/lib/eval/                personas, synthetic fixtures, claim audit, oracle
src/app/api/                 session, chat, profile, research (NDJSON stream), rerank, report, lenders/refresh
src/components/              chat, profile card, progress panel, results, table, "How I decided"
scripts/eval.ts              evaluation CLI
tests/                       245 tests
```

## Known gaps

**Unverified until you run with keys**
1. Live Firecrawl is now partly exercised; live Claude (extraction, reasoning, follow-ups) is still not. A first live pilot (one persona, `LENDMATCH_MAX_LENDERS=6`) worked end to end and cost **~200 Firecrawl credits for 6 lenders**, so a full 25-lender sweep plus discovery needs roughly 800+ credits (the free tier's 1,000 is one run). It also showed: (a) the grounding verifier is strict and nulls real values it cannot find verbatim in the page (several Bluevine fields were dropped); how often that is over-rejection versus a genuinely absent value has **not** been measured; (b) some lenders' crawled pages were articles rather than product pages (PNC returned no usable data), which the URL denylist now excludes (`resources`, `learn`, `insights`, `guides`, `compare`…); (c) lenders that do not publish a rate or limit (OnDeck, credit cards) are ranked on what they do publish and flagged, never filled in.
2. Seed-registry domains may be stale or wrong; discovery will not fix a wrong seed domain.
3. Extraction schema size/complexity for Firecrawl's JSON mode, and `output_config.effort`, are used per the SDK types but untested against the live API.

**Product / scope**
4. No accounts, auth or multi-device sessions; rate limiting is in-memory (single process). Research runs inside one request (`maxDuration` 300 s); production should use a job queue.
5. Robots.txt is read through Firecrawl (rendered as markdown) and Firecrawl enforces robots itself; this is not a legal review of each site's terms of service. Get one before production use.
6. The scoring has no "product specificity" bonus: an equipment loan is not preferred over a general term loan for an equipment purchase except through cost/burden. Add a component to `config/scoring.json` if you want that.
7. Offline extraction is English / US only and intentionally conservative; use Claude for real traffic.
8. Cost estimates simplify (no day-count conventions, balloon payments, draw schedules, prepayment penalties or compounding quirks); every assumption is shown but it is not a quote.
9. Marketplace lenders (e.g. Lendio) publish wide generic ranges; a very-wide-range flag is shown but terms are inherently uncertain.
10. PDF uses base-14 fonts (Latin-1): non-Latin characters in names would drop out. DOCX is fine.
11. "Delete my data" removes everything tied to the anonymous session; the shared lender cache (public pages, no user data) and database backups are untouched.
12. No automated browser E2E tests are committed (the flows were exercised manually with Playwright from a scratch directory).
13. Pinned to Next 15.5, Prisma 6.19, Zod 4, Tailwind 4; Prisma 7/8 need driver-adapter changes.
