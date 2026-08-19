# Design — PictoolsApp

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre
modern-minimal

## Macrostructure family
- Marketing pages: Home stays as-is (centered wordmark + subtitle). Do not restyle.
- App pages: Stage + filmstrip. The photo is the page. Empty = full-canvas drop.
  Loaded = stage (before/after) + plan dock + horizontal filmstrip. No three-pane
  settings workbench.
- Content pages: Settings uses the same header rhythm and bordered cards, no enrichment.

## Theme
Existing tokens in `src/index.css`. Do not invent a second palette.

- `--background`  oklch(98.511% 0.00011 271.152) (dark: oklch(18% 0.002 286.055))
- `--foreground`  oklch(21.82% 0.00195 286.055)
- `--card`        oklch(96.5% 0.00015 271.152)
- `--primary`     oklch(59.01% 0.19675 278.523) — violet accent, ≤ 5% of viewport
- `--secondary`   oklch(78.158% 0.14381 171.311) — mint, success/done only
- `--muted`       oklch(93% 0.00025 271.152)
- `--destructive` oklch(0.577 0.245 27.325)
- `--border`      oklch(88% 0.005 278.523)
- `--radius`      0.625rem

## Typography
- Display / body: inherited system UI stack (no extra webfont).
- Mono: system mono for sizes, versions, percents.
- Headings: roman, `font-style: normal`. Tracking tight on titles (`tracking-tight`).
- App page title: `text-lg font-semibold`. Section labels: `text-xs uppercase tracking-widest text-muted-foreground`.

## Spacing
4-point scale via Tailwind.
- Header: `px-5 py-3`.
- Stage: edge-to-edge, no side columns.
- Dock: `px-5 py-3`.
- Filmstrip thumbs: `w-24`, horizontal scroll.

## Motion
- Page enter: `.page-enter` (opacity + 10px translate, 250ms).
- Interactive: color/opacity 150–200ms. Transforms only on hover of chrome already using them (Home, Sidebar).
- CTA: 1.5px lift on hover, press `translateY(1px)`. Reduced-motion: opacity only.
- Reduced-motion: existing `useReducedMotion` — keep opacity-only there.
- App pages: no celebratory toasts. Silent success (check icon + size delta).

## Microinteractions stance
- Silent success. No confetti, no extra toast on optimize/convert.
- Hover delay on tooltips 300ms (sidebar). Focus delay 0ms.
- Primary CTA disabled only while in-flight or missing files (and Convert: missing output folder).

## CTA voice
- Primary: filled `--primary`, `rounded-lg`, verb label (“Prêt pour le web”, “Convertir”).
- Secondary: outline `border-border`, muted text (“Ouvrir le dossier”, “Avancé”).
- Segmented format chips: selected = primary fill.

## Per-page allowances
- Home MAY keep its existing logo motion. Do not restyle Home or Sidebar.
- App pages MUST NOT use enrichment — function carries the page.
- Settings: cards only.

## What pages MUST share
- Wordmark / logotype in the TopBar.
- Accent colour and placement.
- Display + body fonts (system stack).
- CTA voice (button shape, radius, padding).
- Section heading rhythm (uppercase tracking label above controls).
- Stage + filmstrip chrome on Convert and Optimize.

## What pages MAY differ on
- Convert dock content (format chips + folder) vs Optimize dock (plan + one CTA).
- Settings has no stage.

## Notes
- App pages are destinations, not settings panels. Optimize is « Pour le web »: detect orientation, show the plan, one CTA.
- Web fit (no crop, no upscale): landscape max 1920 wide, portrait max 1350 tall, square max 1080.
- Web profile encodes WebP at quality 78 (JPEG 82 if forced), then drops toward quality 55 only to hit the ceiling. Never climbs to quality 100.
- Web ceilings after fit: landscape 300 KiB, portrait 220 KiB, square 200 KiB.
- `keep_percent` is ignored by the web profile. The slider lives in Advanced for custom (non-web) runs only.
- Never overwrite the source file: if output path equals input path, force a suffix.
- Default web output sits next to the source with `_web`.
- PNG output is lossless; the UI must say so instead of pretending the slider will shrink it.
