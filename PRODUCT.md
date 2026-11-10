# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who need to convert, compress, or prepare images and videos on their own machine — freelancers, developers, and anyone tired of uploading media to untrusted websites. They work locally, often in short task bursts: drop files, pick an output, leave with smaller or converted files.

## Product Purpose

PictoolsApp is a local-first media toolbox. It converts and optimizes images (and video) entirely on-device so files never leave the computer. Success means fast, predictable offline processing with clear progress and no account, upload, or third-party server.

## Positioning

Offline media tools that stay on the user’s machine — not a browser SaaS, not a cloud encoder. Processing runs in the desktop app (Rust + bundled codecs); privacy and speed are the product, not a feature checklist.

## Operating Context

Desktop app (Tauri v2) on macOS, Windows, and Linux. Typical flow: open a tool from the sidebar, drag-and-drop or pick files, choose format/preset and output folder, run, then open the result folder. Languages: English and French (in-app Settings). Home is a quiet wordmark landing; tools use a stage + filmstrip workbench.

## Capabilities and Constraints

Confirmed:
- Image conversion: PNG, JPEG, WEBP, ICO; App Icons pack (PNG + ICNS + ICO)
- Image optimize « Pour le web »: resize ceilings, WebP/JPEG quality search, never overwrite sources
- Video compress + convert (presets light / balanced / quality; outputs mp4, webm, mov, mkv) via bundled FFmpeg sidecar
- Exif editor: creator rights (artist, copyright, credit, usage, contact) with bulk stamp that leaves camera/GPS alone; per-file photo/camera/location edits; strip GPS or all Exif; JPEG/PNG/TIFF/WebP; `_exif` suffix by default
- Drag-and-drop, file picker, per-file progress events
- Auto-updater for shipped builds

Constraints:
- Local-only: no uploads, no remote processing APIs
- Never overwrite source files; force a suffix when paths collide
- FFmpeg is GPL: the sidecar binary’s license obligations apply to distribution of builds that include it
- Impeccable Live mode is not available inside the Tauri webview; design work uses PRODUCT.md / DESIGN.md and shipped UI inspection

Undecided / out of current scope:
- Advanced video controls (manual CRF, AV1, fine audio routing)
- Full IPTC/XMP editing (Exif tool covers EXIF IFD tags via little_exif only)
- Cloud sync, accounts, collaboration

## Brand Commitments

- Name: PictoolsApp
- Voice: utilitarian, calm, verb-led CTAs (“Convert”, “Ready for the web”); silent success (no celebratory toasts)
- Assets: wordmark / logo in TopBar and Home (`public/Base Logo.png`)
- Visual world is owned by DESIGN.md; do not invent a second palette on tool pages

## Evidence on Hand

- README product story and feature list
- Implemented tools: Convert, Optimize, Video, Exif, Settings; Home landing
- Design tokens and workbench in `src/index.css` and `src/components/workbench/`
- No fabricated testimonials, benchmarks, or customer quotes — do not invent them

## Product Principles

1. Files stay on the machine — privacy is default, not a setting.
2. Tools are destinations: one job per page, stage-first, minimal chrome.
3. Silent success: show size deltas and checks, not confetti.
4. Never destroy the original; always write beside or into a chosen folder.
5. Prefer clear presets over exposed encoder knobs unless the user asks for advanced control.

## Accessibility & Inclusion

Keyboard-reachable controls and focus-visible styles on interactive chrome. Respect `prefers-reduced-motion` (opacity-only where motion exists). Full UI available in English and French.
