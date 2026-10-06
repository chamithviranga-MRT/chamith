#!/usr/bin/env node
/**
 * LendMatch skill CLI.
 *   node match.mjs --schema
 *   node match.mjs --profile profile.json [--followup "only SBA loans"]... [--top 10] [--format md|json] [--data snapshot.json]
 *   cat profile.json | node match.mjs --profile -
 * Exit codes: 0 results printed · 2 the profile needs more information or has invalid values (JSON on stdout) · 1 error.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fieldsMarkdown } from "./fields";
import { formatMarkdown } from "./format";
import { runMatch, type Snapshot } from "./match-core";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const values = (name: string) => argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const die = (msg: string): never => {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
};

async function main() {
  if (flag("help") || argv.length === 0) {
    console.log(`LendMatch matcher
  --schema                   print the profile fields
  --profile <file|->         borrower profile as JSON ("-" reads stdin)
  --followup "<text>"        refine the results, e.g. "only SBA loans" (repeatable)
  --top <n>                  show only the first n results
  --format md|json           default md
  --data <file>              lender snapshot (default: ../assets/lender-snapshot.json next to this script)`);
    return;
  }
  if (flag("schema")) {
    console.log(fieldsMarkdown());
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const dataPath = value("data") ?? [resolve(here, "../assets/lender-snapshot.json"), resolve(here, "../demo/snapshot.json")].find(existsSync);
  if (!dataPath || !existsSync(dataPath)) die("lender snapshot not found (use --data <file>).");
  const snapshot = JSON.parse(readFileSync(dataPath as string, "utf8")) as Snapshot;

  const profileArg = value("profile");
  if (!profileArg) die("pass --profile <file|-> (see --schema for the fields).");
  let profile: unknown;
  try {
    profile = JSON.parse(readFileSync(profileArg === "-" ? 0 : (profileArg as string), "utf8"));
  } catch (e) {
    die(`could not read the profile as JSON: ${e instanceof Error ? e.message : e}`);
  }

  const res = await runMatch({ snapshot, profile, followups: values("followup") });
  if (!res.ok) {
    // echo only what was understood, so the caller sees what is still missing without 30 lines of nulls
    const out = res.kind === "missing" ? { ...res, profile: Object.fromEntries(Object.entries(res.profile).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0))) } : res;
    console.log(JSON.stringify(out, null, 2));
    process.exit(2);
  }
  const top = value("top") ? Number(value("top")) : undefined;
  if ((value("format") ?? "md") === "json") console.log(JSON.stringify({ ...res, report: { ...res.report, items: res.report.items.slice(0, top ?? res.report.items.length) } }, null, 2));
  else console.log(formatMarkdown(res, { top }));
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
