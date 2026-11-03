//! FFmpeg sidecar helpers. Binary is configured as `bundle.externalBin: ["binaries/ffmpeg"]`.

use tauri::AppHandle;
use tauri_plugin_shell::process::Command;
use tauri_plugin_shell::ShellExt;

/// Filename passed to `shell().sidecar(...)` (not the `binaries/` prefix).
pub const FFMPEG_SIDECAR_NAME: &str = "ffmpeg";

pub fn ffmpeg_command(app: &AppHandle) -> Result<Command, String> {
    app.shell()
        .sidecar(FFMPEG_SIDECAR_NAME)
        .map_err(|err| format!("FFmpeg sidecar unavailable: {err}"))
}
