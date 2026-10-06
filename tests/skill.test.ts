import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIELDS } from "../skill/fields";
import { formatMarkdown } from "../skill/format";
import { runMatch, type Snapshot } from "../skill/match-core";
import { ProfileSchema } from "@/lib/profile/schema";

const snapshot = JSON.parse(readFileSync("demo/snapshot.json", "utf8")) as Snapshot;
const exported = new Date(snapshot.exportedAt);
const day = (n: number) => new Date(exported.getTime() + n * 86_400_000);

const restaurant = {
  amountNeeded: 80000, purpose: "expansion", timeInBusinessMonths: 36, ficoMin: 700, ficoMax: 700, monthlyRevenue: 60000,
  industry: "restaurant", ownerCountry: "US", businessCountry: "US", businessState: "TX", preferredTermMonths: 60,
};

describe("lendmatch skill: matching", () => {
  it("ranks a complete profile with the real engine, sources every row and passes its own audit", async () => {
    const r = await runMatch({ snapshot, profile: restaurant, now: day(0) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.items).toHaveLength(10);
    expect(r.report.items[0]).toMatchObject({ rank: 1, label: "Pink Diamond", lenderName: "Bluevine" });
    for (const it of r.report.items) expect(it.sourceUrl).toMatch(/^https:\/\//);
    expect(r.audit).toEqual([]);
    expect(r.data).toMatchObject({ ageDays: 0, stale: false, lenders: snapshot.lenders.length, products: snapshot.products.length });
  });

  it("does not run on an incomplete profile: it says what is missing and gives the questions to ask", async () => {
    const r = await runMatch({ snapshot, profile: { purpose: "equipment", ficoMin: 680, ficoMax: 680 } });
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== "missing") throw new Error("expected missing");
    expect(r.missing).toEqual(expect.arrayContaining(["amount", "timeInBusiness", "location"]));
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.length).toBeLessThanOrEqual(3);
  });

  it("rejects unknown keys and wrong types with readable messages", async () => {
    const r = await runMatch({ snapshot, profile: { amountNeeded: "lots", bogus: 1 } });
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== "invalid") throw new Error("expected invalid");
    expect(r.issues.join(" ")).toMatch(/amountNeeded/);
    expect(r.issues.join(" ")).toMatch(/bogus/);
  });

  it("rejects out-of-range values instead of silently dropping them", async () => {
    const r = await runMatch({ snapshot, profile: { ...restaurant, ficoMin: 900, ficoMax: 900 } });
    expect(r.ok).toBe(false);
  });

  it("applies a follow-up through the real re-ranker: 'only SBA loans' leaves only SBA products", async () => {
    const r = await runMatch({ snapshot, profile: restaurant, followups: ["What if I only want SBA loans?"], now: day(0) });
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.items.length).toBeGreaterThan(0);
    for (const it of r.report.items) expect(it.productType).toMatch(/sba|microloan/);
    expect(r.report.followUps.at(-1)?.text).toMatch(/SBA/i);
    expect(r.followUpNotes[0]).toMatch(/SBA/);
  });

  it("an unusable follow-up leaves the results unchanged and says so", async () => {
    const a = await runMatch({ snapshot, profile: restaurant, now: day(0) });
    const b = await runMatch({ snapshot, profile: restaurant, followups: ["asdf qwerty"], now: day(0) });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(b.report.items.map((i) => i.productName)).toEqual(a.report.items.map((i) => i.productName));
    expect(b.followUpNotes[0]).toMatch(/couldn't turn that into a filter/);
  });
});

describe("lendmatch skill: output", () => {
  it("states the snapshot date and age, cites sources, and carries the disclaimer", async () => {
    const r = await runMatch({ snapshot, profile: restaurant, now: day(3) });
    if (!r.ok) throw new Error("expected ok");
    const md = formatMarkdown(r, { top: 3 });
    expect(md).toMatch(/3 days old/);
    expect(md).not.toMatch(/STALE DATA/);
    expect(md).toMatch(/Source: https:\/\/www\.bluevine\.com/);
    expect(md).toMatch(/not financial or legal advice/i);
    expect(md).toMatch(/showing 3/);
    expect(md.match(/^### #/gm)).toHaveLength(3);
  });

  it("flags data older than 7 days as stale, loudly", async () => {
    const r = await runMatch({ snapshot, profile: restaurant, now: day(9) });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data).toMatchObject({ ageDays: 9, stale: true });
    expect(formatMarkdown(r)).toMatch(/STALE DATA/);
  });
});

describe("lendmatch skill: packaging", () => {
  it("the profile-field reference names every field the schema accepts (no drift)", () => {
    const documented = FIELDS.flatMap((f) => f.key.split("/").map((k) => k.trim()));
    const schemaKeys = Object.keys(ProfileSchema.shape).filter((k) => k !== "assumptions");
    expect(schemaKeys.filter((k) => !documented.includes(k))).toEqual([]);
    expect(documented.filter((k) => !schemaKeys.includes(k))).toEqual([]);
  });

  it("the installed skill carries the same snapshot as the demo (run `npm run skill:build` after exporting data)", () => {
    expect(readFileSync(".claude/skills/lendmatch/assets/lender-snapshot.json", "utf8")).toBe(readFileSync("demo/snapshot.json", "utf8"));
  });

  it("SKILL.md has a valid name and a trigger description within the loader's limits", () => {
    const md = readFileSync(".claude/skills/lendmatch/SKILL.md", "utf8");
    const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
    expect(/^name:\s*lendmatch$/m.test(fm)).toBe(true);
    const description = /^description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/m.exec(fm)?.[1]?.trim() ?? "";
    expect(description.length).toBeGreaterThan(100);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
    expect(md).not.toMatch(/\{\{/);
  });
});
