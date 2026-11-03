# FFmpeg sidecars

Tauri expects one binary per Rust target triple next to this README:

- `ffmpeg-aarch64-apple-darwin`
- `ffmpeg-x86_64-apple-darwin`
- `ffmpeg-x86_64-pc-windows-msvc.exe`
- `ffmpeg-x86_64-unknown-linux-gnu`
- `ffmpeg-aarch64-unknown-linux-gnu`

Fetch the host binary:

```bash
./scripts/fetch-ffmpeg.sh
```

Pass `--all` to attempt downloads for every supported target (CI / release machines).

Binaries are gitignored — they are GPL-licensed and large. Ship them only via the fetch script or your release pipeline.
