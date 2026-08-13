/**
 * Brand Studio — Cloudflare Worker backend.
 *
 * The only job here is to hold the Anthropic API key and never let it reach
 * the browser. The frontend (index.html) posts a brief; this calls Claude and
 * returns structured JSON.
 *
 * Deploy:
 *   npx wrangler deploy
 *   npx wrangler secret put ANTHROPIC_API_KEY
 *   npx wrangler secret put CLIENT_CODES        # comma-separated access codes
 *
 * Bindings expected (see wrangler.toml):
 *   ANTHROPIC_API_KEY  secret   your Anthropic key
 *   CLIENT_CODES       secret   "amma2026,jaffnasalon,ella-villa"
 *   RATE               KV       optional; per-code rate limiting
 *   ALLOWED_ORIGIN     var      optional; exact origin of the frontend
 */

// Claude Opus 5 is the default. Sonnet 5 is roughly a third of the cost and
// good enough for this task — switch here if you want to trade quality for
// spend, and see README.md for the per-brand cost maths.
const MODEL = "claude-opus-5";

// Effort controls how much the model deliberates. "medium" keeps brand-kit
// generation in the 15–25s range; "high" is slower and slightly richer.
const EFFORT = "medium";

const DAILY_LIMIT = 40; // model calls per access code per day

const FONT_KEYS = ["editorial", "classic", "clean", "friendly", "geometric", "impact", "utility"];
const MARK_STYLES = ["circle", "square", "shield", "serif-initial", "wordmark", "badge"];

/* ─────────────────────────── schemas ─────────────────────────── */

const KIT_SCHEMA = {
  type: "object",
  properties: {
    brand_name: { type: "string", description: "The business name, cleaned up for display." },
    positioning: { type: "string", description: "One sentence: what this business is and why someone picks it over the shop down the road." },
    audience: { type: "string", description: "One sentence describing who actually buys, including where they are." },
    tagline_options: {
      type: "array",
      description: "Exactly 3 taglines. Concrete and specific to this business — never generic ('Quality you can trust').",
      items: { type: "string" },
    },
    voice: {
      type: "object",
      properties: {
        tone: { type: "string", description: "Three or four words, e.g. 'Warm, plainspoken, proud'." },
        description: { type: "string", description: "One or two sentences on how this brand writes." },
        do: { type: "array", items: { type: "string" }, description: "Exactly 3 concrete writing rules." },
        dont: { type: "array", items: { type: "string" }, description: "Exactly 3 concrete things to avoid, specific to this brand." },
      },
      required: ["tone", "description", "do", "dont"],
      additionalProperties: false,
    },
    palette: {
      type: "object",
      description: "Five hex colours, each exactly in the form #RRGGBB. Primary must have enough contrast to carry white or near-black text. Surface must be very light, ink very dark.",
      properties: {
        primary: { type: "string" },
        secondary: { type: "string" },
        accent: { type: "string" },
        ink: { type: "string" },
        surface: { type: "string" },
      },
      required: ["primary", "secondary", "accent", "ink", "surface"],
      additionalProperties: false,
    },
    fonts: {
      type: "object",
      properties: {
        display: { type: "string", enum: FONT_KEYS, description: "Font pairing key for headings." },
        body: { type: "string", enum: FONT_KEYS, description: "Font pairing key for body copy." },
        rationale: { type: "string", description: "One sentence on why this pairing suits the business." },
      },
      required: ["display", "body", "rationale"],
      additionalProperties: false,
    },
    logo: {
      type: "object",
      properties: {
        monogram: { type: "string", description: "One or two uppercase letters taken from the business name." },
        mark_style: { type: "string", enum: MARK_STYLES },
        lockup: { type: "string", description: "Short line under a wordmark — usually the town or the year founded. Max 22 characters." },
        mark_rationale: { type: "string", description: "One sentence on why this mark style fits." },
      },
      required: ["monogram", "mark_style", "lockup", "mark_rationale"],
      additionalProperties: false,
    },
  },
  required: ["brand_name", "positioning", "audience", "tagline_options", "voice", "palette", "fonts", "logo"],
  additionalProperties: false,
};

/* ─────────────────────────── prompts ─────────────────────────── */

const KIT_SYSTEM = `You are a brand designer working with small, owner-run businesses in Sri Lanka — bakeries, salons, cafés, tuition classes, guest houses, hardware shops.

Design for the reality of these businesses:
- The logo will end up on a paper bag, a shop board and a 40px profile picture. It must survive all three.
- Most customers see the brand on a phone, often outdoors in bright sun. Contrast matters more than subtlety.
- Colour should come from the business itself — what it sells, its building, its neighbourhood — not from generic industry conventions. A bakery does not have to be brown; a salon does not have to be pink.
- Prices and phone numbers must stay legible above everything else.

Write copy the owner would actually recognise as their own voice. Be specific: name the product, the street, the hour. Never write filler like "quality service" or "your trusted partner".

Colour rules you must follow:
- Every colour is exactly #RRGGBB, six hex digits.
- primary: a saturated, mid-to-dark colour. White or near-black text must be clearly readable on it.
- secondary: a muted relative of primary, for large soft areas.
- accent: bright and clearly distinct from primary — this is the price tag and the button, used once per design.
- ink: near-black, for body text on light backgrounds.
- surface: near-white or a light tint, for paper.
- primary, accent and surface must be visibly different from each other. Never return two near-identical colours.`;

const COPY_SYSTEM = `You write short marketing copy for small Sri Lankan businesses, strictly in the brand voice you are given.

Rules:
- Fill every requested field. Never leave one empty and never invent a field that was not asked for.
- Respect the length each field implies: a kicker is 2–4 words, a headline under 8 words, a supporting line one sentence, a button 2–5 words.
- Be concrete. Name the product, the price, the time, the street. No filler adjectives.
- If the brand's languages include Sinhala or Tamil, write the headline in that language and keep prices, phone numbers and the handle in Latin script. Otherwise write in English.
- Never use a hashtag unless the field is explicitly for hashtags.
- Do not use em dashes.`;

/* ─────────────────────────── helpers ─────────────────────────── */

function cors(env) {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json" }, cors(env)),
  });
}

function checkCode(env, code) {
  const list = String(env.CLIENT_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return false;
  return list.includes(String(code || "").trim());
}

// Per-code daily cap. Requires a KV namespace bound as RATE; without it,
// rate limiting is skipped (fine for an internal prototype, not for public).
async function underLimit(env, code) {
  if (!env.RATE) return true;
  const key = `${new Date().toISOString().slice(0, 10)}:${code}`;
  const used = parseInt((await env.RATE.get(key)) || "0", 10);
  if (used >= DAILY_LIMIT) return false;
  await env.RATE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 30 });
  return true;
}

async function callClaude(env, { system, user, schema, maxTokens }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || 8000, // thinking + output share this budget
      system,
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema },
      },
      messages: [{ role: "user", content: user }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Anthropic API ${res.status}`;
    throw new Error(msg);
  }
  // Claude Opus 5 runs safety classifiers; a decline arrives as a 200.
  if (data.stop_reason === "refusal") {
    throw new Error("The model declined this request. Try rewording the business description.");
  }
  if (data.stop_reason === "max_tokens") {
    throw new Error("Ran out of output budget — try a shorter business description.");
  }

  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text) throw new Error("Empty response from the model.");
  return JSON.parse(text);
}

/* ─────────────────────────── routes ─────────────────────────── */

async function handleKit(env, body) {
  const b = body.brief || {};
  if (!b.name) return json({ error: "Business name is required." }, 400, env);

  const user =
    `Design a complete brand kit.\n\n` +
    `Business name: ${b.name}\n` +
    `Industry: ${b.industry || "not given"}\n` +
    `Town: ${b.town || "not given"}\n` +
    `Languages used with customers: ${b.languages || "en"}\n` +
    `Personality the owner chose: ${(b.personality || []).join(", ") || "not given"}\n` +
    `Colour direction requested: ${b.colour === "auto" ? "your judgement" : b.colour}\n\n` +
    `What they sell and who buys it:\n${b.what || "not given"}`;

  const kit = await callClaude(env, { system: KIT_SYSTEM, user, schema: KIT_SCHEMA });
  return json({ kit }, 200, env);
}

async function handleCopy(env, body) {
  const kit = body.kit || {};
  const b = body.brief || {};
  const t = body.template || {};
  const fields = Array.isArray(t.fields) ? t.fields : [];
  if (!fields.length) return json({ error: "No fields requested." }, 400, env);

  // Build a schema matching exactly the fields this template asks for.
  const props = {};
  fields.forEach((f) => {
    props[f.key] = { type: "string", description: f.label };
  });
  const schema = {
    type: "object",
    properties: { content: { type: "object", properties: props, required: fields.map((f) => f.key), additionalProperties: false } },
    required: ["content"],
    additionalProperties: false,
  };

  const user =
    `Write the copy for one design.\n\n` +
    `Design type: ${t.label || t.id}\n` +
    `Brand: ${kit.brand_name}\n` +
    `Positioning: ${kit.positioning || ""}\n` +
    `Audience: ${kit.audience || ""}\n` +
    `Voice: ${(kit.voice && kit.voice.tone) || ""} — ${(kit.voice && kit.voice.description) || ""}\n` +
    `Do: ${((kit.voice && kit.voice.do) || []).join("; ")}\n` +
    `Don't: ${((kit.voice && kit.voice.dont) || []).join("; ")}\n` +
    `Languages: ${b.languages || "en"}\n` +
    `Town: ${b.town || ""}\n` +
    `What they sell: ${b.what || ""}\n\n` +
    `Fields to fill:\n` +
    fields.map((f) => `- ${f.key}: ${f.label}`).join("\n");

  const out = await callClaude(env, { system: COPY_SYSTEM, user, schema, maxTokens: 4000 });
  return json({ content: out.content || {} }, 200, env);
}

/* ─────────────────────────── entry ─────────────────────────── */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    if (request.method !== "POST") {
      return json({ error: "POST only." }, 405, env);
    }

    const url = new URL(request.url);
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Invalid JSON body." }, 400, env);
    }

    if (!checkCode(env, body.code)) {
      return json({ error: "That access code is not recognised." }, 401, env);
    }
    if (!(await underLimit(env, body.code))) {
      return json({ error: `Daily limit of ${DAILY_LIMIT} generations reached for this account.` }, 429, env);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Server is missing ANTHROPIC_API_KEY." }, 500, env);
    }

    try {
      if (url.pathname === "/api/kit") return await handleKit(env, body);
      if (url.pathname === "/api/copy") return await handleCopy(env, body);
      return json({ error: "Unknown endpoint." }, 404, env);
    } catch (err) {
      // Don't leak internals to the browser; log the detail for yourself.
      console.error(url.pathname, err && err.stack ? err.stack : err);
      return json({ error: (err && err.message) || "Generation failed." }, 502, env);
    }
  },
};
