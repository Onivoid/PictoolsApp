# FFmpeg sidecars

Tauri expects one binary per Rust target triple next to this README:

- `ffmpeg-aarch64-apple-darwin`
- `ffmpeg-x86_64-apple-darwin`
- `ffmpeg-x86_64-pc-windows-msvc.exe`
- `ffmpeg-x86_64-unknown-linux-gnu`
- `ffmpeg-aarch64-unknown-linux-gnu`

Fetch the host binary locally:

```bash
./scripts/fetch-ffmpeg.sh
```

Fetch a specific target (GitHub Actions release matrix):

```bash
./scripts/fetch-ffmpeg.sh aarch64-apple-darwin
./scripts/fetch-ffmpeg.sh x86_64-pc-windows-msvc
```

Pass `--all` to download every supported target.

Binaries are gitignored — they are GPL-licensed and large.

- **CI** (`.github/workflows/ci.yml`): fetches the Linux sidecar before `cargo test` / Clippy — Tauri’s build script fails if the host `externalBin` is missing.
- **Release** (`.github/workflows/release.yml`): fetches the matching sidecar per OS/arch before `tauri-action` bundles it.
