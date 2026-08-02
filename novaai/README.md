# NovaAI — landing page

Dark, cinematic single-page site with a full-viewport video background whose
playhead is driven entirely by page scroll.

Stack: React + TypeScript + Vite + Tailwind CSS + lucide-react.

## Run

```bash
npm install
npm run dev      # http://localhost:5199
npm run build    # tsc -b && vite build
npm run preview
```

## Structure

```
src/
  App.tsx                     root layout: video layer, nav, two sections, 80vh spacer
  components/
    ScrollVideo.tsx           fixed background, scroll-scrubbed playhead
    Navbar.tsx                fixed glass nav
    SectionOne.tsx            hero
    SectionTwo.tsx            capability section
    Reveal.tsx                IntersectionObserver fade-up primitive
```

## Scroll-scrubbed background

`ScrollVideo` never autoplays. It maps

```
progress = scrollY / (scrollHeight - innerHeight)
```

clamped to 0–1, then eases toward it each animation frame
(`smoothed += (target - smoothed) * 0.12`).

Three stacked layers cross-fade over 500ms:

1. **Poster** `<img>` — visible until the video has a decoded frame.
2. **`<video>`** — muted / `playsInline`; shown once it has a frame, and used as
   the scrub surface by seeking `currentTime` when the delta exceeds 0.04s.
3. **`<canvas>`** — takes over once a frame cache is warm.

The cache is built from an offscreen copy of the same clip: up to 90 frames
(`duration × 12`, minimum 24) at a maximum width of 960px, extracted after the
visible video fires `loadeddata` plus a 300ms yield. Frames are stored as
`ImageBitmap`s and drawn with object-cover math at `min(devicePixelRatio, 2)`.

Extraction needs a CORS-readable source. If the response is not readable the
canvas path is skipped silently and the `<video>` seek fallback keeps the scrub
working.

The `h-[80vh]` spacer between the two sections is what gives the timeline room
to advance — removing it collapses most of the scrub range.

## Media

The hero clip is loaded from CloudFront (see `HERO_VIDEO_URL` in
`ScrollVideo.tsx`). Two optional local mirrors are picked up automatically when
present and are gitignored:

- `public/hero.mp4` — same clip; used if the remote source errors.
- `public/hero-poster.jpg` — first-frame still; the poster layer hides itself if
  the file is absent.
