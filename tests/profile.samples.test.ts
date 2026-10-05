import { describe, expect, it } from "vitest";
import { processUserMessage } from "@/lib/profile/process";
import { emptyProfile, type Profile } from "@/lib/profile/schema";
import { PERSONAS } from "@/lib/eval/personas";

/** 10 sample inputs run through the real pipeline (redact → heuristic extract → merge → follow-ups). */

async function run(text: string, current: Profile = emptyProfile(), lastAssistant: string | null = null) {
  return processUserMessage({ text, current, lastAssistant, extractor: null });
}

describe("profile extraction — 10 sample inputs", () => {
  // 1-5: the five evaluation personas
  for (const persona of PERSONAS) {
    it(`persona ${persona.id}: recovers expected fields, asks nothing unnecessary`, async () => {
      const r = await run(persona.text);
      for (const [k, v] of Object.entries(persona.expect)) {
        expect(r.profile[k as keyof Profile], `${persona.id}.${k}`).toEqual(v);
      }
      expect(r.missing, `${persona.id} should be complete`).toEqual([]);
      expect(r.questions).toEqual([]);
    });
  }

  it("6. vague input -> asks exactly 3 grouped questions, nothing extracted", async () => {
    const r = await run("I need a loan.");
    expect(r.missing.sort()).toEqual(["amount", "credit", "location", "purpose", "timeInBusiness"].sort());
    expect(r.questions).toHaveLength(3);
    expect(r.reply).toContain("1.");
    expect(r.reply).not.toMatch(/ssn|social security|account number|routing/i);
  });

  it("7. verbal credit band is mapped to a range and flagged as an assumption", async () => {
    const r = await run("Fair credit, been in business 2 years, need $50k for working capital in Ohio.");
    expect(r.profile).toMatchObject({
      ficoMin: 580, ficoMax: 669, timeInBusinessMonths: 24, amountNeeded: 50000, purpose: "working_capital", businessState: "OH",
    });
    expect(r.profile.assumptions.join(" ")).toMatch(/fair.*580.*669/);
    expect(r.missing).toEqual([]);
  });

  it("8. SSN in the message is redacted, never stored, and the user is warned", async () => {
    const r = await run("My SSN is 123-45-6789 and I need $20,000 for inventory. Credit score 650. Open 1 year in Texas.");
    expect(r.redactedText).not.toMatch(/123-45-6789/);
    expect(r.redactions.length).toBeGreaterThan(0);
    expect(r.reply).toMatch(/removed/i);
    expect(JSON.stringify(r.profile)).not.toMatch(/123-?45-?6789/);
    expect(r.profile).toMatchObject({ amountNeeded: 20000, purpose: "inventory", ficoMin: 650, timeInBusinessMonths: 12, businessState: "TX" });
  });

  it("9. fully specified message -> no follow-up questions, risk fields captured", async () => {
    const r = await run(
      "I own a 5-year-old dental practice in Denver, Colorado. FICO 760, revenue $90k a month. I want $200,000 for equipment financing " +
        "over 7 years, funded in 30 days. No bankruptcies, no tax liens, no defaults. Happy to sign a personal guarantee."
    );
    expect(r.profile).toMatchObject({
      timeInBusinessMonths: 60, ficoMin: 760, monthlyRevenue: 90000, amountNeeded: 200000, purpose: "equipment",
      preferredTermMonths: 84, speedNeededDays: 30, hasBankruptcy: false, hasTaxLiens: false, recentDefaults: false,
      willingPersonalGuarantee: true, businessState: "CO",
    });
    expect(r.missing).toEqual([]);
    expect(r.reply).toMatch(/Confirm & research/);
  });

  it("10. multi-turn: answers merge, never re-ask given fields, corrections override", async () => {
    const t1 = await run("I need $75,000.");
    expect(t1.profile.amountNeeded).toBe(75000);
    expect(t1.questions.join(" ")).not.toMatch(/how much funding/i); // amount already given
    expect(t1.questions.length).toBeLessThanOrEqual(3);

    const t2 = await run("It's for inventory. FICO around 700. I've been in business 18 months. Based in Nevada.", t1.profile, t1.reply);
    expect(t2.profile).toMatchObject({ amountNeeded: 75000, purpose: "inventory", ficoMin: 700, timeInBusinessMonths: 18, businessState: "NV" });
    expect(t2.missing).toEqual([]);

    const t3 = await run("Actually make that $90,000", t2.profile, t2.reply);
    expect(t3.profile.amountNeeded).toBe(90000);
    expect(t3.profile.purpose).toBe("inventory"); // untouched
  });
});
