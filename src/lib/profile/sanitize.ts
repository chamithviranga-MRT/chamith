/**
 * Sensitive-identifier redaction. Runs on every user message BEFORE it is stored or sent to a model.
 * LendMatch never needs an SSN, bank number or government ID, so anything that looks like one is
 * replaced with a token and the user is told. This is a best-effort pattern filter, not a guarantee.
 */

export interface RedactionResult {
  text: string;
  /** Human-readable kinds of data that were removed, e.g. ["Social Security number"]. */
  found: string[];
}

function luhnOk(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function redactSensitive(input: string): RedactionResult {
  let text = input;
  const found = new Set<string>();
  const hit = (kind: string, re: RegExp, token: string, test?: (m: string) => boolean) => {
    text = text.replace(re, (m, ...rest) => {
      if (test && !test(m)) return m;
      found.add(kind);
      // keep a label prefix (e.g. "SSN:") when the pattern captured one as group 1
      const label = typeof rest[0] === "string" && /[A-Za-z]/.test(rest[0]) ? rest[0] : "";
      return label ? `${label}${token}` : token;
    });
  };

  // Labelled identifiers first (label may be followed by digits/letters in many formats)
  hit(
    "Social Security / tax ID number",
    /\b((?:ssn|social security(?: number)?|itin|tax id)\s*(?:#|no\.?|number)?\s*[:=-]?\s*)[\dA-Za-z][\dA-Za-z -]{6,14}\d/gi,
    "[REDACTED_ID]"
  );
  hit(
    "bank account or routing number",
    /\b((?:account|acct|routing|aba|sort code|iban)\s*(?:#|no\.?|number)?\s*[:=-]?\s*)[A-Z0-9][A-Z0-9 -]{5,32}[A-Z0-9]/gi,
    "[REDACTED_BANK]",
    (m) => /\d{5,}/.test(m.replace(/[ -]/g, ""))
  );
  hit(
    "government ID number",
    /\b((?:passport|driver'?s?\s*licen[sc]e|license|licence|dl)\s*(?:#|no\.?|number)?\s*[:=-]?\s*)[A-Z0-9][A-Z0-9 -]{4,18}[A-Z0-9]/gi,
    "[REDACTED_ID]",
    (m) => /\d{4,}/.test(m)
  );
  hit("date of birth", /\b((?:dob|date of birth|born on)\s*[:=-]?\s*)[\d/.-]{6,10}\b/gi, "[REDACTED_DOB]");

  // Unlabelled shapes
  hit("Social Security number", /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, "[REDACTED_SSN]");
  hit("employer ID number", /\b\d{2}-\d{7}\b/g, "[REDACTED_EIN]");
  hit("IBAN", /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, "[REDACTED_BANK]");
  hit(
    "payment card number",
    /\b(?:\d[ -]?){13,19}\b/g,
    "[REDACTED_CARD]",
    (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 13 && d.length <= 19 && luhnOk(d);
    }
  );
  // Bare 9-digit numbers are almost always SSN/ITIN/routing numbers, never an amount we need.
  hit("Social Security / routing number", /(?<![\d,.$])\d{9}(?![\d,]|\.\d)/g, "[REDACTED_ID]");

  // Contact details are not needed either.
  hit("email address", /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, "[REDACTED_EMAIL]");
  hit("phone number", /(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g, "[REDACTED_PHONE]");

  return { text, found: [...found] };
}
