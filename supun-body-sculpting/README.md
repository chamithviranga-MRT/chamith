# Supun — Body Sculpting

Single-page hero landing page for Supun's personal training business. One
self-contained `index.html`, no build step and no dependencies — open the file
in a browser and it runs.

The design, typography, colour, animation timings and responsive behaviour are
unchanged from the original hero: cream `#efeee9` on black, Helvetica Neue ME,
the 30s scrolling name, and the mobile drawer.

## Required steps

### 1. Drop in Supun's headshot

Replace `assets/supun-headshot.png` with his photo, **keeping the same
filename**. Nothing in `index.html` needs to change.

For the layout to work, the photo should be a **background-removed cutout PNG**
— transparent behind him. That transparency is what lets the giant scrolling
name pass behind his shoulders. A plain rectangular photo will cover the text
and lose the effect.

- Head-and-shoulders or half-body, roughly 1280×800 or wider
- Free background removers: remove.bg, Photoshop's Remove Background, or the
  iPhone Photos "lift subject" trick (long-press the subject, copy, paste)

If the crop sits wrong after swapping, open `index.html` and change
`--headshot-position` near the top of the CSS (marked **EDIT ME #1**):

```css
--headshot-position: center center;  /* try "center top" or "center 20%" */
```

That only moves the framing — it does not change the layout.

### 2. Fill in the links

In the `<script>` at the bottom of `index.html` (marked **EDIT ME #2**):

```js
var LINKS = {
  instagram: '',
  tiktok:    '',
  youtube:   '',
  whatsapp:  '',   // country code + number, digits only: '94771234567'
  email:     ''
};
```

Fill in what exists and leave the rest empty. Blank entries stay inert, so the
page is safe to publish before every channel is set up.

The three nav links (Programs, Results, Contact) all open an enquiry, each with
its own pre-filled message. WhatsApp is used if a number is set; otherwise it
falls back to email. If both are blank the links do nothing.

### 3. Publish

Upload the folder — `index.html` plus `assets/` — to any static host: Netlify
drop, Vercel, GitHub Pages, or ordinary shared hosting. There is nothing to
build or install.

## Optional

`assets/backdrop.png` is the background behind everything. Swap it the same way
if you have a gym or studio shot you'd rather use. The current file is a plain
dark gradient, which works fine as a permanent choice.

The only external request the page makes is the Helvetica Neue ME webfont. If
it is ever unavailable the page falls back to Helvetica/Arial and still renders
correctly.

## What's a placeholder right now

- `assets/supun-headshot.png` — a generic silhouette, replace it with the real
  photo (step 1)
- `LINKS` — all empty, fill in the real accounts (step 2)
