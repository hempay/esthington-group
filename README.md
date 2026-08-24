# Esthington Group : landing

Vanilla `index.html` + `styles.css` + `script.js`. No build step, no local binary assets.
Three.js is loaded from CDN via an import map; Sora + Inter from Google Fonts.

## Run

```bash
cd landing
python3 -m http.server 8777
# → http://localhost:8777
```

An HTTP server is required : the ES module import map will not resolve over `file://`.

## Structure

| Region | Scroll range | What happens |
|---|---|---|
| Sticky cinema stage | `0 – 3600px` | Three.js camera flies from ground level, through the skyline, up to an aerial. DOM scenes are keyed to the same scroll value. |
| Hero title + intro | `90 – 650` | `ESTHINGTON` lifts `-210px`, scales to `0.92`, fades; intro copy sinks `+90px`. |
| Panel A : *One group, many grounds* | `560 – 1620` | Fades in at 56%, slides `+58px → -86px`. Colour wash ramps. |
| Panel B : *Verified before it is offered* | `1760 – 2700` | Same choreography at 50%. |
| Projects slider | `2760 – 3500` | Flies in from `420vw` on X, eased `enter^1.55`. Infinite via 3-set clone + instant-jump normalisation. |
| Slider controls | `3300 – 3600` | Fade in, clickable past `0.98`. |

Below the stage: Divisions → Track record (count-up on scroll) → The Hub (RESIH) → Footer.

## The 3D world (`buildWorld`)

- **Ground** : a surveyor's grid: orange at the origin, through the logo violet, to electric blue in the far field. The land-banking motif.
- **Towers** : dark solids that occlude, orange edge-lines that draw. Two merged `BufferGeometry` buffers, no per-object draw calls. Layout is seeded (`_seed = 20260824`) so the skyline is identical on every load.
- **Horizon glow** : a radial gradient painted to a 256×256 `<canvas>`, so nothing is fetched.
- **Dust** : 900 additive points.
- A lane down the centre (`|x| < 4.5`) is kept clear so the camera flies *between* the towers.

## Accessibility / resilience

- `prefers-reduced-motion` bypasses scroll smoothing and pointer parallax; values snap, `--mx/--my` forced to `0`, count-ups skipped.
- `buildWorld()` is wrapped in try/catch : if WebGL is unavailable the canvas is hidden and the whole page still works as a static layout.
- Slider cards are `role="button"` + `tabindex="0"`, driven by Enter/Space.

## Brand

Colours are sampled from the logo mark itself (`assets/icon.png`), not guessed.

Palette and content are extracted from the live Esthington properties : see `../docs/brand-research.md`
for provenance of every colour, name and figure.

```
--ink #070515   --ink-2 #0F0A2A   --surface #1A1145   --surface-2 #2A1B6E
--accent #F58634 (logo bar)       --accent-2 #D96A1A   --water #29A9E0
--violet #5B2FB0 (logo top)       --electric #2B17F4 (logo bottom)
```

## Data provenance

`PROJECTS` in `script.js`, the divisions grid and the track-record figures are parsed
**verbatim** from the `Av` / `hs` / `WR` object arrays in esthingtongroup.org's JS bundle:
not inferred. Leadership names and roles likewise. See `../docs/brand-research.md` §4.3–4.4.

## Known substitutions

- **No em dashes** anywhere in the build, by request.
- **Photography** : none used. The design is built to not need it: the Three.js world carries the visual weight. The Water site's factory shoot is the only real imagery the group owns.
- **Principal contact details** : the bundle exposes a direct phone and `@esthington.com` email for each MD/GMD. Deliberately not published here.
- **Sector coverage** : Energy & Power, Hospitality, Sports & Recreation and Foundation & Charity are named as group sectors but have no companies or projects attached in any source. They appear only in the sector strip.
