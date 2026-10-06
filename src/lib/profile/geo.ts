export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia", PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands",
  AS: "American Samoa", MP: "Northern Mariana Islands",
};

const STATE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code])
);
STATE_BY_NAME["washington dc"] = "DC";
STATE_BY_NAME["washington d.c."] = "DC";
STATE_BY_NAME["d.c."] = "DC";

export function normalizeState(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  const up = s.toUpperCase().replace(/\./g, "");
  if (US_STATES[up]) return up;
  return STATE_BY_NAME[s.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ")] ?? null;
}

/** Display names for the countries we recognise; "ZZ" = outside the US, country not given. */
export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "United Kingdom", IN: "India", NG: "Nigeria", PK: "Pakistan", BR: "Brazil",
  MX: "Mexico", DE: "Germany", FR: "France", AU: "Australia", CN: "China", PH: "Philippines", SG: "Singapore",
  AE: "United Arab Emirates", LK: "Sri Lanka", BD: "Bangladesh", KE: "Kenya", ZA: "South Africa", GH: "Ghana",
  EG: "Egypt", TR: "Turkey", ES: "Spain", IT: "Italy", NL: "Netherlands", IE: "Ireland", PL: "Poland", UA: "Ukraine",
  RU: "Russia", JP: "Japan", KR: "South Korea", VN: "Vietnam", ID: "Indonesia", MY: "Malaysia", TH: "Thailand",
  CO: "Colombia", AR: "Argentina", CL: "Chile", PE: "Peru", NZ: "New Zealand", SE: "Sweden", CH: "Switzerland",
  IL: "Israel", SA: "Saudi Arabia", NP: "Nepal", JM: "Jamaica", ZZ: "Outside the US (country not given)",
};

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "US", "u.s.": "US", "u.s.a.": "US", us: "US", "united states": "US", "united states of america": "US",
  america: "US", uk: "GB", "u.k.": "GB", "great britain": "GB", england: "GB", scotland: "GB", britain: "GB",
  uae: "AE", dubai: "AE", "south korea": "KR", korea: "KR", "viet nam": "VN", holland: "NL", "the netherlands": "NL",
  "non-us": "ZZ", "non us": "ZZ", "outside us": "ZZ",
};
for (const [code, name] of Object.entries(COUNTRY_NAMES)) COUNTRY_ALIASES[name.toLowerCase()] = code;

/** Country names we look for in free text (excludes the US, handled separately). */
export const FOREIGN_COUNTRY_PATTERNS: Array<[RegExp, string]> = Object.entries(COUNTRY_NAMES)
  .filter(([code]) => code !== "US" && code !== "ZZ")
  .map(([code, name]) => [new RegExp(`\\b${name.replace(/\./g, "\\.")}\\b`, "i"), code] as [RegExp, string])
  .concat([
    [/\b(?:the\s+)?uk\b/i, "GB"],
    [/\bu\.k\.\b/i, "GB"],
    [/\bengland\b/i, "GB"],
    [/\buae\b/i, "AE"],
    [/\bdubai\b/i, "AE"],
  ]);

export function normalizeCountry(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  const lower = s.toLowerCase().replace(/\s+/g, " ");
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  const up = s.toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return up;
  return "ZZ";
}

export function countryLabel(code: string | null): string {
  if (!code) return "—";
  return COUNTRY_NAMES[code] ?? code;
}
