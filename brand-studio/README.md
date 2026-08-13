# Brand Studio

A client-facing tool that turns a two-minute business brief into a complete brand kit — logo, palette, typography, voice, taglines — and then renders that kit into ready-to-post materials the customer can export as PNG or SVG.

Built as a bolt-on for existing ContentOps LK clients: they sign in with an access code and self-serve the simple stuff between monthly shoots.

```
brand-studio/
├── index.html      the whole frontend — no build step, no dependencies
├── worker.js       Cloudflare Worker: holds the API key, calls Claude
├── wrangler.toml   deploy config
└── README.md
```

## Try it right now

Open `index.html` in a browser and click **"Skip — explore with a sample brand."** Demo mode loads a pre-built kit and runs entirely client-side: every template, mark style, and export works with no backend and no API key. That is the fastest way to see what customers get.

Only two things need the backend: generating a kit from a real brief, and the "Write this one for me" copy button.

## How it works

**Claude generates the kit, not the pixels.** The model returns a structured JSON brand kit — five hex colours, a font-pairing key, a monogram, a mark style, voice rules, taglines. The browser then renders every design deterministically as SVG from that kit. This matters:

- Output is always on-brand, because the same palette and type drive every template.
- Designs are instant and free to re-render — changing the logo style updates all six templates with no model call.
- Everything is editable. The customer can override any text field and the design reflows.
- Exports are vector-sharp at any scale.

**The logo is generated, not drawn by a model.** Claude picks the monogram letters and the mark style; the client renders one of six hand-built SVG marks (circle, square, shield, serif initial, wordmark, badge) from those choices. Model-authored SVG paths look inconsistent and break at small sizes — this approach gives a mark that holds up at 40px and stamps cleanly on a paper bag. The customer can switch styles instantly.

### Templates

| Template | Size | Notes |
| --- | --- | --- |
| Offer post | 1080 × 1080 | Kicker, headline, price flag, contact strip. Layout flows so a long headline can't collide with the price |
| Product post | 1080 × 1080 | Photo area plus caption band |
| Story | 1080 × 1920 | Full-bleed, optional photo with brand tint, CTA button |
| Price list flyer | 1748 × 2480 | A5 at 300 dpi. Parses `Item - Price` lines into a costed menu |
| Business card | 1050 × 600 | 3.5 × 2 in at 300 dpi |
| Profile / logo | 1200 × 1200 | The mark on any of four brand grounds |

## Deploy

```bash
cd brand-studio
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY     # your Anthropic key
npx wrangler secret put CLIENT_CODES          # amma2026,jaffnasalon,ella-villa
```

`wrangler.toml` serves `index.html` from the same Worker, so the frontend and `/api/*` share an origin and `API_BASE` in `index.html` stays `""`. If you host the frontend elsewhere, set `API_BASE` to the Worker URL and set `ALLOWED_ORIGIN` in `wrangler.toml` to your frontend's origin.

For per-client daily limits, create a KV namespace and uncomment the binding:

```bash
npx wrangler kv namespace create RATE
```

Without it the `DAILY_LIMIT` check is skipped — acceptable for a handful of known clients, not for anything public.

## Security

- **The API key never reaches the browser.** It lives in Worker secrets; the frontend only ever talks to `/api/kit` and `/api/copy`. Do not move the key into `index.html` for convenience — anything in that file is readable by every visitor.
- **Access codes are a gate, not authentication.** They are shared secrets compared server-side, good enough for a known list of clients. Before this is public-facing, swap them for real per-user auth and move the rate limit to something durable.
- **Uploaded photos never leave the browser.** They are read as data URIs and embedded directly into the SVG.

## Model and cost

`worker.js` uses `claude-opus-5` at `medium` effort. Two calls exist:

| Call | When | Rough tokens | Cost |
| --- | --- | --- | --- |
| `/api/kit` | Once per brand | ~1K in, ~1.5K out | ~$0.04 |
| `/api/copy` | Per "write this for me" | ~1K in, ~0.3K out | ~$0.01 |

So a new client costs roughly **$0.04 to onboard** and a cent per generated caption. Even a heavy user is well under $1/month.

To trade quality for spend, change `MODEL` in `worker.js` to `claude-sonnet-5` ($3/$15 per MTok, and $2/$10 promotional through 31 Aug 2026) or `claude-haiku-4-5` ($1/$5). Copy generation in particular is fine on a cheaper model; kit generation benefits from the stronger one. `EFFORT` is the other lever — `low` is faster and cheaper, `high` is slower and slightly richer.

## Known limits

- **Fonts are system stacks only.** An SVG rasterised through `<canvas>` cannot load webfonts, so the tool uses seven system-resolvable pairings. This guarantees the PNG matches the preview. Adding a custom brand font means embedding it as a base64 `@font-face` inside the SVG.
- **Sinhala and Tamil rendering depends on the device.** The font stacks include Noto Sans Sinhala/Tamil, but a machine without those installed will fall back and may render boxes. Exporting from a phone or a machine with the fonts installed is reliable.
- **Text wrapping is estimated, not measured.** SVG has no auto-wrap, so line breaks are computed from character counts. It degrades safely — headlines cap at four lines and body copy drops lines rather than overflowing — but a headline with unusually wide characters can break a line early.
- **Print output is RGB.** Fine for digital printing at the volumes these clients use; a commercial press wanting CMYK with bleed needs a real prepress step.
- **Kit state lives in `localStorage`.** It survives a reload on the same browser but is not synced. Customers should download the JSON kit. Real accounts need server-side storage.

## Next steps, in the order I'd do them

1. **Store kits server-side** (Workers KV or D1) keyed to the client, so a brand survives a cleared browser and your team can see what clients have made.
2. **Real auth** — access codes are the weakest part of this. Even magic-link email would be a large improvement.
3. **More templates.** The template system is a plain object; adding one is a `render` function and a `fields` array, roughly 30 lines. Seasonal sets (Avurudu, Christmas, Deepavali) are the obvious win.
4. **Logo refinement pass** — let the customer nudge the mark (letter spacing, weight, container padding) rather than only switching styles.
5. **Direct publishing** — push a finished design straight to the client's Facebook/Instagram via the Meta Graph API instead of downloading and re-uploading.
