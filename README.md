<div align="center">
  <img src="public/Base Logo.png" alt="PictoolsApp" width="96" height="96">
  <h1>PictoolsApp</h1>
  <p>A local-first image toolbox. No uploads, no third-party servers — your files stay on your machine.</p>
</div>

---

## Why

I got tired of uploading images to random websites just to resize or convert them. Most of those sites are sketchy, slow, or both — and you're handing over your files to who knows what.

PictoolsApp does the same job offline, instantly, with no data leaving your computer.

## What it does

- **Image conversion** — PNG, JPEG, WEBP, ICO (per-size files), and a full **App Icons** pack in one click: PNG set + `.icns` (macOS) + `.ico` (Windows) + Windows Store sizes
- Drag & drop or file picker
- Live progress feedback per file during conversion
- Output folder of your choice

More tools are planned.

## Stack

Built with [Tauri v2](https://tauri.app) + [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org).

Image processing runs entirely in Rust — [`image`](https://crates.io/crates/image), [`ico`](https://crates.io/crates/ico), [`icns`](https://crates.io/crates/icns). No native system dependencies required.

UI: [Tailwind CSS v4](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) · [Lucide](https://lucide.dev) · [Radix UI](https://www.radix-ui.com)

## Getting started

**Requirements:** [Rust](https://rustup.rs) · [Node.js](https://nodejs.org) · [pnpm](https://pnpm.io)

```bash
git clone https://github.com/Onivoid/PictoolsApp
cd PictoolsApp
pnpm install
pnpm tauri dev
```

Build a distributable:

```bash
pnpm tauri build
```

## i18n

Fully translated in **English** and **French**. Language can be switched from the Settings page inside the app.

## License

MIT
