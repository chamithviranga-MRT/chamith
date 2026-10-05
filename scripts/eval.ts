/**
 * LendMatch evaluation: 5 borrower personas -> extracted profile -> Top 10 -> claim audit.
 *
 *   npm run eval                      # live if FIRECRAWL_API_KEY is set, otherwise synthetic fixtures
 *   npm run eval -- --mode=fixtures   # force the synthetic catalog (fictional lenders; NOT real data)
 *   npm run eval -- --mode=live       # real Firecrawl research (needs FIRECRAWL_API_KEY, DATABASE_URL)
 *   npm run eval -- --persona=nonus-llc --strict --out=reports/eval.md
 *   npm run eval -- --mode=live --no-discovery   # live, registry lenders only (LENDMATCH_MAX_LENDERS=N caps the count)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAnthropic } from "../src/lib/anthropic";
import { FirecrawlWeb } from "../src/lib/firecrawl/client";
import { runPipeline } from "../src/lib/firecrawl/pipeline";
import { PrismaRepo } from "../src/lib/firecrawl/repo";
import { loadRegistry } from "../src/lib/firecrawl/registry";
import { PERSONAS } from "../src/lib/eval/personas";
import { FIXTURE_NOTICE, FIXTURE_PRODUCT_COUNT, fixtureProducts } from "../src/lib/eval/fixtures";
import { evaluatePersona, shortfallText, type LoadedProducts, type PersonaOutcome } from "../src/lib/eval/run";
import { summarizeFlags } from "../src/lib/eval/audit";
import { profileLines } from "../src/lib/export/text";
import { fmtDate } from "../src/lib/report/format";
import type { StoredProduct } from "../src/lib/types";
import { prisma } from "../src/lib/db";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const has = (name: string) => process.argv.includes(`--${name}`);

const mode = (arg("mode") ?? (process.env.FIRECRAWL_API_KEY ? "live" : "fixtures")) as "live" | "fixtures";
const only = arg("persona");
const strict = has("strict");
const noDiscovery = has("no-discovery"); // live mode: read only the registry lenders (saves Firecrawl credits)
const out = arg("out") ?? `reports/eval-${mode}.md`;
const client = arg("reasoning") === "template" ? null : getAnthropic();

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
const rpad = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s.padStart(n));

function fail(msg: string): never {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(2);
}

async function main() {
  const personas = PERSONAS.filter((p) => !only || p.id === only);
  if (!personas.length) fail(`Unknown persona "${only}". Choices: ${PERSONAS.map((p) => p.id).join(", ")}`);

  const lines: string[] = [];
  const log = (s = "") => {
    console.log(s);
    lines.push(s);
  };

  log(`# LendMatch evaluation (${mode})`);
  log(`Generated ${new Date().toISOString()} · profile extraction: ${client ? "Claude (tool-use)" : "offline pattern matching"} · reasoning: ${client ? "Claude + verification" : "verified template"}`);
  if (mode === "fixtures") {
    log("");
    log(`> **${FIXTURE_NOTICE}**`);
    log(`> ${FIXTURE_PRODUCT_COUNT} products from ${new Set(fixtureProducts(new Date()).map((p) => p.lender.slug)).size} fictional lenders. This run validates the engine (extraction, hard filters, scoring, cost math, reasoning verification, claim audit). It says nothing about real lenders.`);
  }

  let sharedProducts: StoredProduct[] = [];
  let loader: ((p: import("../src/lib/profile/schema").Profile) => Promise<LoadedProducts>) | undefined;
  if (mode === "fixtures") {
    sharedProducts = fixtureProducts(new Date());
  } else {
    const web = FirecrawlWeb.fromEnv();
    if (!web) fail("--mode=live needs FIRECRAWL_API_KEY (and network access to api.firecrawl.dev). Use --mode=fixtures for the offline synthetic run.");
    if (!process.env.DATABASE_URL) fail("--mode=live needs DATABASE_URL (Postgres) for the 7-day cache.");
    const repo = new PrismaRepo();
    loader = async (profile) => {
      const res = await runPipeline({ profile, web, repo, registry: loadRegistry(), discovery: !noDiscovery, onEvent: (e) => e.type === "stage" && console.error(`  [research] ${e.message}`) });
      if (res.fatalError) fail(res.fatalError);
      return { products: res.products, outcomes: res.outcomes, stats: res.stats };
    };
  }

  const outcomes: PersonaOutcome[] = [];
  for (const persona of personas) {
    console.error(`\n--- running ${persona.id} ---`);
    outcomes.push(await evaluatePersona({ persona, products: sharedProducts, client, loadProducts: loader }));
  }

  for (const o of outcomes) {
    const { persona, report, rank, flags } = o;
    log("");
    log(`## ${persona.title}  (\`${persona.id}\`)`);
    log("");
    log(`**Input:** “${persona.text}”`);
    log("");
    log(`**Extracted profile** (${o.mode === "claude" ? "Claude" : "offline"}): ${profileLines(o.profile).map(([k, v]) => `${k} = ${v}`).join(" · ")}`);
    log(`Extraction vs expected: ${o.extractionMismatches.length ? "MISMATCH — " + o.extractionMismatches.join("; ") : "all expected fields recovered"}${o.missingRequired.length ? ` · still missing: ${o.missingRequired.join(", ")}` : ""}`);
    log("");
    log(`**Result:** ${o.products} products considered · ${rank.passed} passed every hard filter · showing ${report.items.length}${shortfallText(report)}`);
    if (o.lenderOutcomes.length) {
      const by = (s: string) => o.lenderOutcomes.filter((x) => x.status === s).length;
      log(`**Lender coverage:** ${o.lenderOutcomes.length} lenders — ${by("scraped")} read live, ${by("cached")} from cache, ${by("unavailable")} data unavailable, ${by("blocked")} blocked (robots.txt / login wall)`);
      for (const x of o.lenderOutcomes.filter((y) => y.status === "unavailable" || y.status === "blocked")) log(`- ${x.name}: ${x.status}${x.reason ? ` — ${x.reason}` : ""}`);
    }
    log("");
    log("```");
    log(`${rpad("#", 2)}  ${pad("Label", 12)} ${pad("Lender", 30)} ${pad("Product", 34)} ${pad("Cat.", 12)} ${rpad("Score", 5)}  ${pad("Amount", 22)} ${pad("Rate", 24)} ${pad("Term", 19)} ${pad("Speed", 16)} Est. monthly`);
    for (const it of report.items) {
      log(`${rpad(String(it.rank), 2)}  ${pad(it.label, 12)} ${pad(it.lenderName, 30)} ${pad(it.productName, 34)} ${pad(it.category, 12)} ${rpad(it.score.toFixed(1), 5)}  ${pad(it.amountRange, 22)} ${pad(it.rateRange, 24)} ${pad(it.termRange, 19)} ${pad(it.speed, 16)} ${it.cost.monthlyPayment !== null ? `$${Math.round(it.cost.monthlyPayment).toLocaleString("en-US")}` : "n/a"}`);
    }
    if (!report.items.length) log("(no product passed every hard filter)");
    log("```");
    log("");
    for (const it of report.items) {
      log(`**#${it.rank} ${it.label} — ${it.lenderName}: ${it.productName}** (${it.typeLabel}, ${it.category}; score ${it.score.toFixed(1)})`);
      log(`- Why it fits: ${it.reasoning.whyItFits}`);
      log(`- Could block approval: ${it.reasoning.couldBlock}`);
      log(`- ${it.reasoning.estimatedPayment}`);
      log(`- Next step: ${it.reasoning.nextStep}`);
      log(`- ${it.reasoning.citation}`);
      log("");
    }
    if (report.nearMisses.length) {
      log("**Near misses (what you'd need to change):**");
      for (const n of report.nearMisses) log(`- ${n.lenderName} — ${n.productName}: ${n.fixes.join(" ")}  _(source ${n.sourceUrl}, scraped ${fmtDate(n.scrapedAt)})_`);
      log("");
    }
    const gates = Object.entries(report.gateSummary).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
    if (gates.length) log(`**Removed by hard filters:** ${gates.map(([g, n]) => `${g} ×${n}`).join(", ")}`);
    log("");
    log(`**Claim audit:** ${flags.length === 0 ? "0 flags — every number, source and estimate label checked" : `${flags.length} FLAG(S)`}`);
    for (const f of flags) log(`- [${f.kind}] ${f.rank ? `#${f.rank} ` : ""}${f.lender}: ${f.detail}`);
    log(`**Independent oracle:** ${o.oracle.length === 0 ? "engine and oracle agree (nothing ineligible ranked, nothing eligible removed)" : `${o.oracle.length} DISAGREEMENT(S)`}`);
    for (const x of o.oracle) log(`- ${x}`);
    log(`**Persona checks:** ${o.personaChecks.length === 0 ? "all passed" : `${o.personaChecks.length} FAILED`}`);
    for (const x of o.personaChecks) log(`- ${x}`);
  }

  log("");
  log("## Summary");
  log("");
  log("| Persona | Extraction | Products | Passed filters | Shown | Flags (unsourced / source / estimate / stale) | Oracle | Persona checks |");
  log("|---|---|---|---|---|---|---|---|");
  let bad = 0;
  for (const o of outcomes) {
    const k = summarizeFlags(o.flags);
    const flagCount = o.flags.length;
    bad += flagCount + o.oracle.length + o.personaChecks.length + o.extractionMismatches.length;
    log(`| ${o.persona.id} | ${o.extractionMismatches.length ? `${o.extractionMismatches.length} mismatch` : "ok"} | ${o.products} | ${o.rank.passed} | ${o.report.items.length} | ${flagCount} (${k.unsourced_claim} / ${k.missing_source + k.domain_mismatch} / ${k.unlabelled_estimate} / ${k.stale_data}) | ${o.oracle.length ? o.oracle.length + " disagree" : "agree"} | ${o.personaChecks.length ? o.personaChecks.length + " failed" : "pass"} |`);
  }
  log("");
  log(bad === 0 ? "**Result: PASS** — no unsourced claims, no engine/oracle disagreements, all persona checks passed." : `**Result: ${bad} ISSUE(S)** — see details above.`);
  if (mode === "fixtures") log(`\n_${FIXTURE_NOTICE}_`);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n") + "\n");
  writeFileSync(out.replace(/\.md$/, ".json"), JSON.stringify(outcomes.map((o) => ({ persona: o.persona.id, profile: o.profile, report: o.report, flags: o.flags, oracle: o.oracle, personaChecks: o.personaChecks, extractionMismatches: o.extractionMismatches, lenderOutcomes: o.lenderOutcomes })), null, 2));
  console.error(`\nWrote ${out} and ${out.replace(/\.md$/, ".json")}`);
  await prisma.$disconnect().catch(() => {});
  if (strict && bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
