import { PURPOSE_LABEL, PURPOSES, type Profile } from "./schema";
import { missingRequired, type MissingField } from "./normalize";
import { countryLabel } from "./geo";

const PURPOSE_LIST = PURPOSES.map((p) => PURPOSE_LABEL[p].toLowerCase()).join(", ");

/**
 * Builds at most 3 short follow-up questions, in ONE message, only for required fields that are
 * still missing. Fields are grouped (amount+purpose / credit+time in business / location) so five
 * required fields still fit in three questions. Never asks for SSN, bank numbers or any ID.
 */
export function buildFollowUps(p: Profile, missing: MissingField[] = missingRequired(p)): string[] {
  const has = (f: MissingField) => missing.includes(f);
  const qs: string[] = [];

  if (has("amount") && has("purpose")) {
    qs.push(`How much funding do you need, and what will it be used for (${PURPOSE_LIST})?`);
  } else if (has("amount")) {
    qs.push("How much funding do you need (a rough dollar amount is fine)?");
  } else if (has("purpose")) {
    qs.push(`What will the funds be used for (${PURPOSE_LIST})?`);
  }

  if (has("credit") && has("timeInBusiness")) {
    qs.push("What's your approximate personal FICO score or range, and how long has the business been operating (or 'not launched yet')?");
  } else if (has("credit")) {
    qs.push("What's your approximate personal FICO score or range (e.g. 640–680, or 'fair')?");
  } else if (has("timeInBusiness")) {
    qs.push("How long has the business been operating (or 'not launched yet')?");
  }

  if (has("location")) {
    if (p.ownerCountry === "ZZ" || p.businessCountry === "ZZ") {
      qs.push("Which country do you live in, and which US state is the business registered or operating in?");
    } else if (p.businessCountry === "US" && !p.businessState) {
      qs.push("Which US state is the business based in?");
    } else if (p.ownerCountry && p.businessCountry && p.businessCountry !== "US") {
      qs.push("Is there a US state where the business is registered or operates? Most US lenders require a US presence.");
    } else {
      qs.push("Which state (and country, if outside the US) are you and the business based in?");
    }
  }

  return qs.slice(0, 3);
}

export function profileSummary(p: Profile): string {
  const bits: string[] = [];
  if (p.amountNeeded !== null) bits.push(`$${p.amountNeeded.toLocaleString("en-US")}`);
  if (p.purpose) bits.push(PURPOSE_LABEL[p.purpose].toLowerCase());
  if (p.ficoMin !== null && p.ficoMax !== null) bits.push(p.ficoMin === p.ficoMax ? `FICO ${p.ficoMin}` : `FICO ${p.ficoMin}–${p.ficoMax}`);
  if (p.timeInBusinessMonths !== null) bits.push(p.timeInBusinessMonths === 0 ? "not launched yet" : `${p.timeInBusinessMonths} months in business`);
  const loc = [p.businessState, p.businessCountry && p.businessCountry !== "US" ? countryLabel(p.businessCountry) : null].filter(Boolean).join(", ");
  if (loc) bits.push(`business in ${loc}`);
  if (p.ownerCountry && p.ownerCountry !== "US") bits.push(`owner in ${countryLabel(p.ownerCountry)}`);
  return bits.join(" · ");
}

export interface ReplyInput {
  profile: Profile;
  missing: MissingField[];
  redactions: string[];
  issues: string[];
  offline: boolean;
}

export function composeReply({ profile, missing, redactions, issues, offline }: ReplyInput): { text: string; questions: string[] } {
  const parts: string[] = [];
  if (redactions.length) {
    parts.push(
      `Heads-up: I removed what looked like ${redactions.join(", ")} from your message and did not store it. I never need SSNs, bank numbers or IDs — please don't share them.`
    );
  }
  if (issues.length) parts.push(`I ignored a value that didn't look right: ${issues.join(" ")}`);

  const questions = buildFollowUps(profile, missing);
  const summary = profileSummary(profile);

  if (questions.length) {
    parts.push(summary ? `Got it — ${summary}.` : "Thanks for the context.");
    parts.push(
      "To find your best matches I still need:\n" + questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    );
  } else {
    parts.push(`Got everything I need — ${summary}.`);
    parts.push(
      "Review the profile card below. Edit anything that's off (revenue, collateral, guarantee preferences and speed all improve the match), then press “Confirm & research”."
    );
  }
  if (offline) {
    parts.push("(Offline extraction mode: no Anthropic key is configured, so I used simple pattern matching — please double-check the card.)");
  }
  return { text: parts.join("\n\n"), questions };
}
