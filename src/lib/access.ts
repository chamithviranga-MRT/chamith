/**
 * Optional shared access code (HTTP Basic auth). A public deployment calls paid APIs (Anthropic, Firecrawl) on every
 * request, so while piloting you can set LENDMATCH_ACCESS_CODE and only people who know it can use the site.
 * Any username is accepted; the password must equal the code. Unset = open (local development).
 */
export function checkBasicAuth(header: string | null, code: string | undefined): boolean {
  if (!code) return true; // gate disabled
  if (!header || !/^basic /i.test(header)) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const password = decoded.slice(decoded.indexOf(":") + 1);
  return safeEqual(password, code);
}

/** Constant-time string comparison (does not stop at the first differing character). */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
