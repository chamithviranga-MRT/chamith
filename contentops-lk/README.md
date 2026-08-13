# ContentOps LK — landing page

A single-file, dependency-free landing page for a done-for-you content-operations
service aimed at Sri Lankan small business owners (bakeries, salons, cafés, tuition
classes, guest houses, boutiques and the like).

Open `index.html` in any browser, or drop it on any static host (GitHub Pages,
Netlify, Cloudflare Pages, cPanel). There is no build step and no external
requests — fonts are system stacks, icons are inline SVG, and the favicon is a
data URI.

## What's on the page

| Section | Purpose |
| --- | --- |
| Announcement bar | Scarcity line ("5 client slots open") |
| Sticky nav | Anchor links + WhatsApp CTA, collapses to a hamburger under 860px |
| Hero | Headline, trilingual subline, dual CTA, animated phone mockup, 3 proof stats |
| Trust strip | Business categories served |
| Problem section | Six pain points owners recognise, plus a full-width pull quote |
| Services | Six service cards: strategy, production, design, copy, publishing, ads/reporting |
| How it works | Four numbered steps (audit → shoot → approve → publish) |
| Deliverables band | Monthly counts on a dark band with count-up animation |
| Pricing | Three LKR tiers (Rs. 24,500 / 49,500 / 89,500) with a featured middle plan |
| Comparison table | DIY vs freelancer vs ContentOps LK (scrolls horizontally on mobile) |
| Audience | Industry chips + fit / not-a-fit cards |
| Results | Testimonial cards — **placeholders, see below** |
| FAQ | Eight `<details>` accordions |
| Contact | Free-audit form that composes a prefilled WhatsApp message |
| Footer + mobile CTA bar | Sitemap, contact details, sticky bottom bar on phones |

## Before you publish — things to replace

1. ~~**WhatsApp number.**~~ Set to **+94 74 112 2901**. If it ever changes, edit
   the `CONFIGURE ME` block near the bottom of `index.html` — every WhatsApp
   button and the contact form read from these two constants:

   ```js
   var WA_NUMBER  = "94741122901";      // international format, digits only
   var WA_DISPLAY = "+94 74 112 2901";  // how it's shown in the contact list
   ```

2. **Testimonials.** The three quotes in the `#results` section are illustrative
   placeholders and the page says so in a visible warning box. Swap in real,
   permissioned client quotes and delete the `.disclaimer` paragraph.

3. **Email address.** `hello@contentops.lk` appears in the contact list and the
   footer.

4. **Prices and deliverable counts.** The tiers and the "what lands every month"
   band are a sensible starting point for the Sri Lankan market — adjust to your
   real cost base.

5. **Brand name / logo.** The mark is the letter `C` in a rounded tile
   (`.brand__mark`) plus an inline-SVG favicon in `<head>`. Replace both if you
   have real brand assets.

6. **Social preview.** `og:title` / `og:description` are set; add an `og:image`
   once you have a share graphic.

## Form handling

The audit form has no backend. On submit it validates the three required fields
and opens `wa.me` with the answers formatted as a message, so it works on a
purely static host. If you'd rather collect submissions by email or into a sheet,
point the `<form>` at Formspree / Google Forms / your own endpoint and remove the
submit handler in the script block.

## Design tokens

Colours, radii, shadows and font stacks are CSS custom properties on `:root` —
change the palette in one place:

```css
--teal:#0E6B5C;      /* primary */
--saffron:#E8A33D;   /* accent */
--ink:#0B1F1C;       /* dark sections & text */
--bg:#FBF8F3;        /* warm off-white page */
```

## Accessibility & performance notes

- Respects `prefers-reduced-motion` (reveals, float animation and count-ups all
  switch off).
- Keyboard-operable nav toggle with `aria-expanded` / `aria-controls`, native
  `<details>` accordions, visible focus rings on all inputs.
- Sinhala and Tamil text is real Unicode with `Noto Sans Sinhala` / `Noto Sans
  Tamil` in the font stack, falling back to the system Indic fonts.
- No external requests, so there's nothing to block the first paint.
