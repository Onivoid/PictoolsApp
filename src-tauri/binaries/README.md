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

Binaries are gitignored — they are GPL-licensed and large. The Release workflow runs `scripts/fetch-ffmpeg.sh` per platform before `tauri-action` bundles the sidecar.
