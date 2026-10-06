/** Minimal robots.txt parser/evaluator (RFC 9309 semantics: longest match wins, Allow beats Disallow on ties). */

export interface RobotsGroup {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
}
export type RobotsRules = RobotsGroup[];

export function parseRobots(body: string): RobotsRules {
  const groups: RobotsRules = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n|\\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${esc.endsWith("\\$") ? esc.slice(0, -2) + "$" : esc}`);
}

/** Tokens a crawler may be addressed by. Firecrawl identifies itself as FirecrawlAgent. */
export const OUR_AGENTS = ["firecrawlagent", "firecrawl"];

export function isAllowed(rules: RobotsRules, url: string, agents: string[] = OUR_AGENTS): boolean {
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return false;
  }
  const specific = rules.filter((g) => g.agents.some((a) => agents.some((mine) => a === mine || (a !== "*" && mine.includes(a)))));
  const group = specific.length ? specific : rules.filter((g) => g.agents.includes("*"));
  if (!group.length) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const g of group) {
    for (const r of g.rules) {
      if (r.path === "") continue; // empty Disallow = allow everything
      if (patternToRegex(r.path).test(path)) {
        const len = r.path.length;
        if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
      }
    }
  }
  return best ? best.allow : true;
}
