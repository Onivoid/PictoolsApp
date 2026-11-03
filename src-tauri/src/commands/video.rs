use crate::ffmpeg::ffmpeg_command;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;

const DEFAULT_SUFFIX: &str = "_compressed";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOptions {
    pub preset: String,
    pub output_format: String,
    pub output_naming: String,
    pub custom_suffix: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub path: String,
    pub size: u64,
    pub format: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_secs: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoResult {
    pub input: String,
    pub output: Option<String>,
    pub original_size: u64,
    pub output_size: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoProgress {
    index: usize,
    total: usize,
    file: String,
    percent: Option<u32>,
}

struct PresetProfile {
    crf_h264: u8,
    crf_vp9: u8,
    max_width: Option<u32>,
}

fn preset_profile(preset: &str) -> PresetProfile {
    match preset.to_lowercase().as_str() {
        "light" => PresetProfile {
            crf_h264: 32,
            crf_vp9: 36,
            max_width: Some(1280),
        },
        "quality" => PresetProfile {
            crf_h264: 23,
            crf_vp9: 28,
            max_width: None,
        },
        _ => PresetProfile {
            crf_h264: 28,
            crf_vp9: 32,
            max_width: Some(1920),
        },
    }
}

fn normalize_format(format: &str) -> Result<&'static str, String> {
    match format.to_lowercase().as_str() {
        "mp4" => Ok("mp4"),
        "webm" => Ok("webm"),
        "mov" => Ok("mov"),
        "mkv" => Ok("mkv"),
        other => Err(format!("Unsupported output format: {other}")),
    }
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn stem_of(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video")
        .to_string()
}

fn parent_folder(path: &Path) -> PathBuf {
    path.parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn resolve_output_path(
    input: &Path,
    output_dir: &str,
    format: &str,
    naming: &str,
    custom_suffix: &str,
) -> PathBuf {
    let dir = if output_dir.trim().is_empty() {
        parent_folder(input)
    } else {
        PathBuf::from(output_dir)
    };

    let stem = stem_of(input);
    let suffix = if naming == "replace" {
        String::new()
    } else if custom_suffix.trim().is_empty() {
        DEFAULT_SUFFIX.to_string()
    } else {
        custom_suffix.trim().to_string()
    };

    let mut candidate = dir.join(format!("{stem}{suffix}.{format}"));
    if candidate == input {
        candidate = dir.join(format!("{stem}{DEFAULT_SUFFIX}.{format}"));
    }
    candidate
}

fn parse_duration_secs(stderr: &str) -> Option<f64> {
    // Duration: 00:01:23.45
    let marker = "Duration: ";
    let start = stderr.find(marker)? + marker.len();
    let slice = stderr.get(start..start + 11)?;
    let parts: Vec<&str> = slice.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours: f64 = parts[0].trim().parse().ok()?;
    let minutes: f64 = parts[1].trim().parse().ok()?;
    let seconds: f64 = parts[2].trim().parse().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn parse_video_dimensions(stderr: &str) -> (Option<u32>, Option<u32>) {
    // Look for patterns like 1920x1080 in a Video: stream line
    for line in stderr.lines() {
        if !line.contains("Video:") {
            continue;
        }
        let bytes = line.as_bytes();
        let mut i = 0;
        while i + 3 < bytes.len() {
            if bytes[i].is_ascii_digit() {
                let mut j = i;
                while j < bytes.len() && bytes[j].is_ascii_digit() {
                    j += 1;
                }
                if j < bytes.len() && bytes[j] == b'x' {
                    let mut k = j + 1;
                    while k < bytes.len() && bytes[k].is_ascii_digit() {
                        k += 1;
                    }
                    if k > j + 1 {
                        if let (Ok(w), Ok(h)) = (
                            line[i..j].parse::<u32>(),
                            line[j + 1..k].parse::<u32>(),
                        ) {
                            if w >= 16 && h >= 16 && w <= 7680 && h <= 4320 {
                                return (Some(w), Some(h));
                            }
                        }
                    }
                }
                i = j;
            } else {
                i += 1;
            }
        }
    }
    (None, None)
}

fn parse_out_time_secs(line: &str) -> Option<f64> {
    // progress pipe: out_time_ms=1234567  OR out_time=00:00:01.234456
    if let Some(rest) = line.strip_prefix("out_time_ms=") {
        let ms: f64 = rest.trim().parse().ok()?;
        return Some(ms / 1_000_000.0);
    }
    if let Some(rest) = line.strip_prefix("out_time=") {
        let value = rest.trim();
        if value == "N/A" {
            return None;
        }
        let parts: Vec<&str> = value.split(':').collect();
        if parts.len() != 3 {
            return None;
        }
        let hours: f64 = parts[0].parse().ok()?;
        let minutes: f64 = parts[1].parse().ok()?;
        let seconds: f64 = parts[2].parse().ok()?;
        return Some(hours * 3600.0 + minutes * 60.0 + seconds);
    }
    None
}

async fn run_ffmpeg_capture(
    app: &AppHandle,
    args: Vec<String>,
) -> Result<(i32, String, String), String> {
    let cmd = ffmpeg_command(app)?.args(args);
    let (mut rx, _child) = cmd.spawn().map_err(|err| format!("Failed to spawn FFmpeg: {err}"))?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut code = 1;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                stdout.push_str(&String::from_utf8_lossy(&line));
                stdout.push('\n');
            }
            CommandEvent::Stderr(line) => {
                stderr.push_str(&String::from_utf8_lossy(&line));
                stderr.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                code = payload.code.unwrap_or(1);
            }
            CommandEvent::Error(message) => {
                return Err(format!("FFmpeg process error: {message}"));
            }
            _ => {}
        }
    }

    Ok((code, stdout, stderr))
}

async fn probe_video(app: &AppHandle, path: &str) -> Result<VideoMetadata, String> {
    let size = std::fs::metadata(path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    let format = extension_of(Path::new(path));

    let args = vec![
        "-hide_banner".into(),
        "-i".into(),
        path.to_string(),
    ];
    let (_code, _stdout, stderr) = run_ffmpeg_capture(app, args).await?;
    let (width, height) = parse_video_dimensions(&stderr);
    let duration_secs = parse_duration_secs(&stderr);

    Ok(VideoMetadata {
        path: path.to_string(),
        size,
        format,
        width,
        height,
        duration_secs,
    })
}

fn build_encode_args(
    input: &str,
    output: &str,
    format: &str,
    preset: &str,
) -> Vec<String> {
    let profile = preset_profile(preset);
    let mut args = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-i".into(),
        input.to_string(),
    ];

    if let Some(max_width) = profile.max_width {
        args.extend([
            "-vf".into(),
            format!("scale='min({max_width},iw)':-2"),
        ]);
    }

    match format {
        "webm" => {
            args.extend([
                "-c:v".into(),
                "libvpx-vp9".into(),
                "-b:v".into(),
                "0".into(),
                "-crf".into(),
                profile.crf_vp9.to_string(),
                "-c:a".into(),
                "libopus".into(),
                "-b:a".into(),
                "96k".into(),
            ]);
        }
        _ => {
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "medium".into(),
                "-crf".into(),
                profile.crf_h264.to_string(),
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                "128k".into(),
            ]);
            if format == "mp4" || format == "mov" {
                args.extend(["-movflags".into(), "+faststart".into()]);
            }
        }
    }

    args.extend([
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.to_string(),
    ]);
    args
}

async fn encode_one(
    app: &AppHandle,
    input: &str,
    options: &VideoOptions,
    output_dir: &str,
    index: usize,
    total: usize,
    duration_hint: Option<f64>,
) -> VideoResult {
    let original_size = std::fs::metadata(input).map(|m| m.len()).unwrap_or(0);
    let format = match normalize_format(&options.output_format) {
        Ok(fmt) => fmt,
        Err(error) => {
            return VideoResult {
                input: input.to_string(),
                output: None,
                original_size,
                output_size: 0,
                error: Some(error),
            };
        }
    };

    let output_path = resolve_output_path(
        Path::new(input),
        output_dir,
        format,
        &options.output_naming,
        &options.custom_suffix,
    );

    if let Some(parent) = output_path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return VideoResult {
                input: input.to_string(),
                output: None,
                original_size,
                output_size: 0,
                error: Some(format!("Cannot create output folder: {error}")),
            };
        }
    }

    let output_str = output_path.to_string_lossy().to_string();
    let file_label = Path::new(input)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(input)
        .to_string();

    let _ = app.emit(
        "video:progress",
        VideoProgress {
            index,
            total,
            file: file_label.clone(),
            percent: Some(0),
        },
    );

    let args = build_encode_args(input, &output_str, format, &options.preset);
    let cmd = match ffmpeg_command(app) {
        Ok(cmd) => cmd.args(args),
        Err(error) => {
            return VideoResult {
                input: input.to_string(),
                output: None,
                original_size,
                output_size: 0,
                error: Some(error),
            };
        }
    };

    let (mut rx, _child) = match cmd.spawn() {
        Ok(pair) => pair,
        Err(error) => {
            return VideoResult {
                input: input.to_string(),
                output: None,
                original_size,
                output_size: 0,
                error: Some(format!("Failed to spawn FFmpeg: {error}")),
            };
        }
    };

    let mut stderr = String::new();
    let mut code = 1;
    let mut last_percent: Option<u32> = Some(0);

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let text = String::from_utf8_lossy(&line);
                for part in text.split(|c| c == '\n' || c == '\r') {
                    if let Some(secs) = parse_out_time_secs(part) {
                        if let Some(duration) = duration_hint.filter(|d| *d > 0.0) {
                            let percent = ((secs / duration) * 100.0).clamp(0.0, 99.0) as u32;
                            if last_percent != Some(percent) {
                                last_percent = Some(percent);
                                let _ = app.emit(
                                    "video:progress",
                                    VideoProgress {
                                        index,
                                        total,
                                        file: file_label.clone(),
                                        percent: Some(percent),
                                    },
                                );
                            }
                        }
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                stderr.push_str(&String::from_utf8_lossy(&line));
                stderr.push('\n');
            }
            CommandEvent::Terminated(payload) => {
                code = payload.code.unwrap_or(1);
            }
            CommandEvent::Error(message) => {
                return VideoResult {
                    input: input.to_string(),
                    output: None,
                    original_size,
                    output_size: 0,
                    error: Some(format!("FFmpeg process error: {message}")),
                };
            }
            _ => {}
        }
    }

    if code != 0 {
        let detail = stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("FFmpeg failed")
            .to_string();
        return VideoResult {
            input: input.to_string(),
            output: None,
            original_size,
            output_size: 0,
            error: Some(detail),
        };
    }

    let output_size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
    let _ = app.emit(
        "video:progress",
        VideoProgress {
            index,
            total,
            file: file_label,
            percent: Some(100),
        },
    );

    VideoResult {
        input: input.to_string(),
        output: Some(output_str),
        original_size,
        output_size,
        error: None,
    }
}

#[tauri::command]
pub async fn get_videos_metadata(
    app: AppHandle,
    file_paths: Vec<String>,
) -> Result<Vec<VideoMetadata>, String> {
    let mut results = Vec::with_capacity(file_paths.len());
    for path in file_paths {
        match probe_video(&app, &path).await {
            Ok(meta) => results.push(meta),
            Err(_) => results.push(VideoMetadata {
                path: path.clone(),
                size: std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
                format: extension_of(Path::new(&path)),
                width: None,
                height: None,
                duration_secs: None,
            }),
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn process_videos(
    app: AppHandle,
    files: Vec<String>,
    options: VideoOptions,
    output_dir: String,
) -> Result<Vec<VideoResult>, String> {
    normalize_format(&options.output_format)?;

    let total = files.len();
    let mut results = Vec::with_capacity(total);

    for (index, input) in files.into_iter().enumerate() {
        let duration_hint = probe_video(&app, &input)
            .await
            .ok()
            .and_then(|meta| meta.duration_secs);

        let result = encode_one(
            &app,
            &input,
            &options,
            &output_dir,
            index,
            total,
            duration_hint,
        )
        .await;
        results.push(result);
    }

    Ok(results)
}
