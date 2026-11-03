#!/usr/bin/env bash
# Download FFmpeg builds into src-tauri/binaries/ with Tauri sidecar naming.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/binaries"
# Static macOS/Windows builds from eugeneware/ffmpeg-static (b6.0)
FFMPEG_STATIC_TAG="b6.0"
mkdir -p "$BIN_DIR"

host_triple() {
  rustc -vV | sed -n 's/^host: //p'
}

download_gzip_binary() {
  local url="$1"
  local dest="$2"
  local tmp
  tmp="$(mktemp)"
  curl -fsSL "$url" -o "$tmp"
  gzip -dc "$tmp" > "$dest"
  chmod 755 "$dest"
  rm -f "$tmp"
}

download_macos() {
  local triple="$1"
  local arch url
  case "$triple" in
    aarch64-apple-darwin) arch="darwin-arm64" ;;
    x86_64-apple-darwin) arch="darwin-x64" ;;
    *)
      echo "Unsupported macOS triple: $triple" >&2
      return 1
      ;;
  esac
  url="https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_TAG}/ffmpeg-${arch}.gz"
  echo "→ macOS FFmpeg for ${triple}"
  download_gzip_binary "$url" "$BIN_DIR/ffmpeg-${triple}"
  echo "  ✓ $BIN_DIR/ffmpeg-${triple}"
}

download_windows() {
  local triple="x86_64-pc-windows-msvc"
  local url="https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_TAG}/ffmpeg-win32-x64.gz"
  echo "→ Windows FFmpeg for ${triple}"
  download_gzip_binary "$url" "$BIN_DIR/ffmpeg-${triple}.exe"
  echo "  ✓ $BIN_DIR/ffmpeg-${triple}.exe"
}

download_linux() {
  local triple="$1"
  local arch url
  case "$triple" in
    x86_64-unknown-linux-gnu) arch="linux-x64" ;;
    aarch64-unknown-linux-gnu) arch="linux-arm64" ;;
    *)
      echo "Unsupported Linux triple: $triple" >&2
      return 1
      ;;
  esac
  url="https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_TAG}/ffmpeg-${arch}.gz"
  echo "→ Linux FFmpeg for ${triple}"
  download_gzip_binary "$url" "$BIN_DIR/ffmpeg-${triple}"
  echo "  ✓ $BIN_DIR/ffmpeg-${triple}"
}

fetch_one() {
  local triple="$1"
  case "$triple" in
    aarch64-apple-darwin|x86_64-apple-darwin)
      download_macos "$triple"
      ;;
    x86_64-pc-windows-msvc)
      download_windows
      ;;
    x86_64-unknown-linux-gnu|aarch64-unknown-linux-gnu)
      download_linux "$triple"
      ;;
    *)
      echo "No fetch recipe for triple: $triple" >&2
      return 1
      ;;
  esac
}

main() {
  local arg="${1:-}"
  if [[ "$arg" == "--all" ]]; then
    fetch_one aarch64-apple-darwin
    fetch_one x86_64-apple-darwin
    fetch_one x86_64-pc-windows-msvc
    fetch_one x86_64-unknown-linux-gnu
    fetch_one aarch64-unknown-linux-gnu
  elif [[ -n "$arg" ]]; then
    # Explicit triple for CI / cross builds (e.g. x86_64-apple-darwin on arm64 runners)
    fetch_one "$arg"
  else
    fetch_one "$(host_triple)"
  fi
  echo "Done."
}

main "$@"
