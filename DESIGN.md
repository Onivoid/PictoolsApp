---
name: PictoolsApp
description: Local-first media toolbox — calm operate UI, stage-first tools
colors:
  background: "oklch(98.511% 0.00011 271.152)"
  foreground: "oklch(21.82% 0.00195 286.055)"
  card: "oklch(96.5% 0.00015 271.152)"
  primary: "oklch(59.01% 0.19675 278.523)"
  primary-foreground: "oklch(98% 0 0)"
  secondary: "oklch(78.158% 0.14381 171.311)"
  muted: "oklch(93% 0.00025 271.152)"
  muted-foreground: "oklch(50% 0.01 278.523)"
  accent: "oklch(90% 0.04 278.523)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(88% 0.005 278.523)"
  ring: "oklch(59.01% 0.19675 278.523)"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "calc(0.625rem - 4px)"
  md: "calc(0.625rem - 2px)"
  lg: "0.625rem"
spacing:
  header-x: "1.25rem"
  header-y: "0.75rem"
  dock-x: "1.25rem"
  dock-y: "0.75rem"
  filmstrip-thumb: "6rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
  format-chip-on:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.625rem"
  format-chip-off:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.625rem"
---

# Design System: PictoolsApp

## Overview

**Creative North Star: "The Quiet Workbench"**

PictoolsApp is an operate surface, not a marketing spectacle. The media is the page: empty tools are a full-canvas drop zone; loaded tools are stage + plan dock + horizontal filmstrip. Chrome stays thin, utilitarian, and calm so attention stays on the file being processed.

Personality is modern-minimal and restrained. Accent color is rare. Success is silent (check + size delta), never celebratory. Home keeps its centered wordmark; tool pages must not invent enrichment, second palettes, or dashboard chrome.

**Key Characteristics:**
- Stage + filmstrip macrostructure on tool pages
- System UI type only; tight title tracking
- Violet primary used sparingly; mint secondary for done/success only
- Flat tonal surfaces; motion is short and optional
- Verb-led CTAs; segmented format chips

## Colors

Cool near-white paper with a restrained violet accent and a mint reserved for completion.

### Primary
- **Workbench Violet** (`oklch(59.01% 0.19675 278.523)`): primary CTA fill, selected chips, focus ring, active nav bar. ≤ ~5% of any viewport.

### Secondary
- **Done Mint** (`oklch(78.158% 0.14381 171.311)`): success / done indicators only — never as a second brand accent on idle chrome.

### Neutral
- **Cool Paper** (`oklch(98.511% 0.00011 271.152)`): app background
- **Ink** (`oklch(21.82% 0.00195 286.055)`): body text
- **Card Mist** (`oklch(96.5% 0.00015 271.152)`): cards / elevated panels
- **Mute Wash** (`oklch(93% 0.00025 271.152)`): muted fills, active nav row
- **Hairline** (`oklch(88% 0.005 278.523)`): borders and inputs

### Named Rules
**The One Voice Rule.** Primary accent appears on ≤ ~5% of the viewport; rarity is the signal.

**The Mint Is Done Rule.** Secondary mint is reserved for success/done states only.

## Typography

**Display / Body Font:** system UI stack (`ui-sans-serif, system-ui, sans-serif`)  
**Mono Font:** system mono for sizes, versions, percents

**Character:** Quiet OS-native type. No webfonts. Hierarchy comes from size, weight, and tracking — not personality typefaces.

### Hierarchy
- **Title** (600, `text-lg`, tight tracking): tool page titles
- **Body** (400, `text-sm`): supporting copy, dock summaries
- **Label** (500, `text-xs`, uppercase, `tracking-widest`, muted): section labels above controls
- **Mono** (400, `text-xs`): byte sizes, dimensions, percents

### Named Rules
**The System Stack Rule.** Do not add display webfonts to tool pages.

## Layout

Desktop operate shell: custom TopBar + collapsible Sidebar + content outlet. Tool pages share header rhythm `px-5 py-3`, edge-to-edge stage, dock `px-5 py-3`, filmstrip thumbs `w-24` with horizontal scroll. No three-pane settings workbench on media tools. Settings uses bordered cards and the same header rhythm. Home stays a centered wordmark composition.

Spacing follows Tailwind’s 4-point scale. Density is comfortable but chrome-light — the file owns the canvas.

## Elevation & Depth

Flat by default. Depth comes from tonal layering (background → card → muted) and hairline borders, not multi-layer shadows. Interactive lift on primary CTAs is a 1.5px translate on hover (opacity-only under reduced motion).

### Named Rules
**The Flat-By-Default Rule.** Surfaces rest flat. Motion and tint carry state, not drop shadows.

## Shapes

Base radius `--radius: 0.625rem` with sm/md/lg steps derived in CSS. Buttons and chips use `rounded-lg` / `rounded-md`. Cards and settings panels use the same radius language with `border-border`. No pill-full chrome on primary actions.

## Components

### Buttons
Primary: filled primary, `rounded-lg`, verb label, hover lift 1.5px, press `translateY(1px)`. Secondary: outline `border-border`, muted text. Disabled only while in-flight or missing required inputs (files; Convert also needs output folder).

### Format chips
Segmented control feel: selected = primary fill; idle = background + hairline border + muted text.

### Tool workbench
Header (icon + title + subtitle) → stage (empty drop or media preview) → optional dock → optional filmstrip. Drag overlay and busy overlay are first-class states.

### Sidebar / TopBar
Shared shell. Active nav: muted fill + 2px primary left bar. Tooltips delay 300ms on hover. Do not restyle Home or Sidebar as part of tool work.

### Settings cards
Bordered cards only; no stage, no enrichment.

## Do's and Don'ts

**Do**
- Keep tool pages stage-first with filmstrip + dock
- Use silent success (check + size delta)
- Preserve source files; force a suffix on path collision
- Extend this system when adding tools (Video matches Convert/Optimize chrome)

**Don't**
- Invent a second palette or loud enrichment on app pages
- Add celebratory toasts/confetti on convert/optimize/video success
- Restyle Home or Sidebar opportunistically
- Expose encoder knobs when presets carry the product voice
- Overwrite source media
