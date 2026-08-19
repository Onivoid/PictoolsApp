use crate::commands::encode::{encode_at_quality, format_supports_quality};
use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::task::spawn_blocking;

const MIN_KEEP_PERCENT: u8 = 10;
const MAX_KEEP_PERCENT: u8 = 100;
const DEFAULT_SUFFIX: &str = "_optimized";
const DEFAULT_WEB_SUFFIX: &str = "_web";
const WEB_LANDSCAPE_MAX_WIDTH: u32 = 1920;
const WEB_PORTRAIT_MAX_HEIGHT: u32 = 1350;
const WEB_SQUARE_MAX_SIDE: u32 = 1080;
const SQUARE_RATIO_TOLERANCE: f64 = 0.05;
const WEB_LANDSCAPE_MAX_BYTES: u64 = 300 * 1024;
const WEB_PORTRAIT_MAX_BYTES: u64 = 220 * 1024;
const WEB_SQUARE_MAX_BYTES: u64 = 200 * 1024;
const WEB_WEBP_QUALITY: u8 = 78;
const WEB_JPEG_QUALITY: u8 = 82;
const WEB_QUALITY_FLOOR: u8 = 55;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Orientation {
    Landscape,
    Portrait,
    Square,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeOptions {
    pub output_format: String,
    pub keep_percent: u8,
    pub max_side: Option<u32>,
    pub resize_width: Option<u32>,
    pub resize_height: Option<u32>,
    pub lock_ratio: bool,
    pub output_naming: String,
    pub custom_suffix: String,
    #[serde(default)]
    pub profile: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeResult {
    pub input: String,
    pub output: Option<String>,
    pub original_size: u64,
    pub optimized_size: u64,
    pub original_dimensions: (u32, u32),
    pub optimized_dimensions: (u32, u32),
    pub reduction_percent: f32,
    pub quality_used: Option<u8>,
    pub hit_target: bool,
    pub used_original: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub size: u64,
    pub format: String,
    pub orientation: Orientation,
    pub web_width: u32,
    pub web_height: u32,
}

pub(crate) struct EncodeOutcome {
    pub data: Vec<u8>,
    pub dimensions: (u32, u32),
    pub quality_used: Option<u8>,
    pub used_original: bool,
    pub hit_target: bool,
}

fn get_format_from_path(path: &Path) -> Option<ImageFormat> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .and_then(|ext| match ext.to_lowercase().as_str() {
            "png" => Some(ImageFormat::Png),
            "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
            "webp" => Some(ImageFormat::WebP),
            _ => None,
        })
}

fn format_from_str(s: &str) -> Option<ImageFormat> {
    match s.to_lowercase().as_str() {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "webp" => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn get_output_format(requested: &str, original_format: ImageFormat) -> ImageFormat {
    if requested == "original" {
        original_format
    } else {
        format_from_str(requested).unwrap_or(original_format)
    }
}

fn format_to_extension(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::WebP => "webp",
        _ => "png",
    }
}

fn clamp_keep_percent(value: u8) -> u8 {
    value.clamp(MIN_KEEP_PERCENT, MAX_KEEP_PERCENT)
}

fn is_web_profile(opts: &OptimizeOptions) -> bool {
    opts.profile.as_deref() == Some("web")
}

pub(crate) fn classify_orientation(width: u32, height: u32) -> Orientation {
    let longest = width.max(height) as f64;
    if longest > 0.0 && (width.abs_diff(height) as f64) / longest <= SQUARE_RATIO_TOLERANCE {
        return Orientation::Square;
    }
    if height > width {
        Orientation::Portrait
    } else {
        Orientation::Landscape
    }
}

pub(crate) fn web_fit_size(width: u32, height: u32) -> (Orientation, u32, u32) {
    let orientation = classify_orientation(width, height);
    let (max_width, max_height) = match orientation {
        Orientation::Landscape => (WEB_LANDSCAPE_MAX_WIDTH, u32::MAX),
        Orientation::Portrait => (u32::MAX, WEB_PORTRAIT_MAX_HEIGHT),
        Orientation::Square => (WEB_SQUARE_MAX_SIDE, WEB_SQUARE_MAX_SIDE),
    };

    let scale_w = max_width as f64 / width.max(1) as f64;
    let scale_h = max_height as f64 / height.max(1) as f64;
    let scale = scale_w.min(scale_h).min(1.0);
    if (scale - 1.0).abs() < f64::EPSILON {
        return (orientation, width, height);
    }

    let fitted_width = ((width as f64) * scale).round().max(1.0) as u32;
    let fitted_height = ((height as f64) * scale).round().max(1.0) as u32;
    (orientation, fitted_width, fitted_height)
}

pub(crate) fn web_ceiling_bytes(orientation: Orientation) -> u64 {
    match orientation {
        Orientation::Landscape => WEB_LANDSCAPE_MAX_BYTES,
        Orientation::Portrait => WEB_PORTRAIT_MAX_BYTES,
        Orientation::Square => WEB_SQUARE_MAX_BYTES,
    }
}

fn web_start_quality(format: ImageFormat) -> u8 {
    match format {
        ImageFormat::Jpeg => WEB_JPEG_QUALITY,
        _ => WEB_WEBP_QUALITY,
    }
}

fn reduction_percent(original_size: u64, optimized_size: u64) -> f32 {
    if original_size == 0 {
        return 0.0;
    }
    ((original_size as f64 - optimized_size as f64) / original_size as f64 * 100.0) as f32
}

fn apply_resize(img: DynamicImage, opts: &OptimizeOptions) -> (DynamicImage, bool) {
    if is_web_profile(opts) {
        let (_, target_width, target_height) = web_fit_size(img.width(), img.height());
        if target_width == img.width() && target_height == img.height() {
            return (img, false);
        }
        return (
            img.resize(
                target_width,
                target_height,
                image::imageops::FilterType::Lanczos3,
            ),
            true,
        );
    }

    if let Some(max_side) = opts.max_side {
        let longest = img.width().max(img.height());
        if longest > max_side {
            return (
                img.resize(max_side, max_side, image::imageops::FilterType::Lanczos3),
                true,
            );
        }
        return (img, false);
    }

    if opts.resize_width.is_none() && opts.resize_height.is_none() {
        return (img, false);
    }

    let target_w = opts.resize_width.unwrap_or(img.width());
    let target_h = opts.resize_height.unwrap_or(img.height());
    if target_w == img.width() && target_h == img.height() {
        return (img, false);
    }

    let resized = if opts.lock_ratio {
        img.resize(target_w, target_h, image::imageops::FilterType::Lanczos3)
    } else {
        img.resize_exact(target_w, target_h, image::imageops::FilterType::Lanczos3)
    };
    (resized, true)
}

fn encode_to_target(
    img: &DynamicImage,
    format: ImageFormat,
    target_bytes: u64,
) -> Result<(Vec<u8>, Option<u8>), String> {
    if !format_supports_quality(format) {
        return Ok((encode_at_quality(img, format, MAX_KEEP_PERCENT)?, None));
    }

    let at_max = encode_at_quality(img, format, MAX_KEEP_PERCENT)?;
    if at_max.len() as u64 <= target_bytes {
        return Ok((at_max, Some(MAX_KEEP_PERCENT)));
    }

    let mut low: u8 = 1;
    let mut high: u8 = 99;
    let mut best: Option<(Vec<u8>, u8)> = None;

    while low <= high {
        let quality = low + (high - low) / 2;
        let encoded = encode_at_quality(img, format, quality)?;
        if (encoded.len() as u64) <= target_bytes {
            best = Some((encoded, quality));
            if quality == 100 {
                break;
            }
            low = quality + 1;
        } else if quality == 1 {
            if best.is_none() {
                best = Some((encoded, 1));
            }
            break;
        } else {
            high = quality - 1;
        }
    }

    match best {
        Some(result) => Ok((result.0, Some(result.1))),
        None => {
            let fallback = encode_at_quality(img, format, 1)?;
            Ok((fallback, Some(1)))
        }
    }
}

fn encode_for_web(
    img: &DynamicImage,
    format: ImageFormat,
    orientation: Orientation,
) -> Result<(Vec<u8>, Option<u8>), String> {
    if !format_supports_quality(format) {
        return Ok((encode_at_quality(img, format, MAX_KEEP_PERCENT)?, None));
    }

    let start = web_start_quality(format);
    let ceiling = web_ceiling_bytes(orientation);
    let at_start = encode_at_quality(img, format, start)?;
    if (at_start.len() as u64) <= ceiling {
        return Ok((at_start, Some(start)));
    }

    let mut low = WEB_QUALITY_FLOOR;
    let mut high = start.saturating_sub(1);
    let mut best: Option<(Vec<u8>, u8)> = None;

    while low <= high {
        let quality = low + (high - low) / 2;
        let encoded = encode_at_quality(img, format, quality)?;
        if (encoded.len() as u64) <= ceiling {
            best = Some((encoded, quality));
            if quality == high {
                break;
            }
            low = quality + 1;
        } else if quality == WEB_QUALITY_FLOOR {
            break;
        } else {
            high = quality - 1;
        }
    }

    match best {
        Some(result) => Ok((result.0, Some(result.1))),
        None => {
            let at_floor = encode_at_quality(img, format, WEB_QUALITY_FLOOR)?;
            Ok((at_floor, Some(WEB_QUALITY_FLOOR)))
        }
    }
}

pub(crate) fn optimize_image(
    original_bytes: &[u8],
    img: DynamicImage,
    original_format: ImageFormat,
    opts: &OptimizeOptions,
) -> Result<EncodeOutcome, String> {
    let keep_percent = clamp_keep_percent(opts.keep_percent);
    let original_size = original_bytes.len() as u64;
    let original_dimensions = (img.width(), img.height());
    let output_format = get_output_format(&opts.output_format, original_format);
    let same_format = output_format == original_format;

    let (processed, was_resized) = apply_resize(img, opts);
    let dimensions = (processed.width(), processed.height());
    let was_enlarged = dimensions.0 > original_dimensions.0 || dimensions.1 > original_dimensions.1;
    let orientation = classify_orientation(original_dimensions.0, original_dimensions.1);

    if is_web_profile(opts) {
        let (data, quality_used) = encode_for_web(&processed, output_format, orientation)?;
        let hit_target = data.len() as u64 <= web_ceiling_bytes(orientation);
        return Ok(EncodeOutcome {
            data,
            dimensions,
            quality_used,
            used_original: false,
            hit_target,
        });
    }

    if keep_percent == MAX_KEEP_PERCENT && same_format && !was_resized {
        return Ok(EncodeOutcome {
            data: original_bytes.to_vec(),
            dimensions: original_dimensions,
            quality_used: None,
            used_original: true,
            hit_target: true,
        });
    }

    let target_bytes = (original_size as f64 * f64::from(keep_percent) / 100.0).round() as u64;
    let (data, quality_used) = encode_to_target(&processed, output_format, target_bytes.max(1))?;
    let hit_target = data.len() as u64 <= target_bytes;

    if data.len() as u64 >= original_size && same_format && !was_enlarged {
        return Ok(EncodeOutcome {
            data: original_bytes.to_vec(),
            dimensions: original_dimensions,
            quality_used: None,
            used_original: true,
            hit_target: original_size <= target_bytes,
        });
    }

    Ok(EncodeOutcome {
        data,
        dimensions,
        quality_used,
        used_original: false,
        hit_target,
    })
}

fn error_result(input: String, original_size: u64, message: String) -> OptimizeResult {
    OptimizeResult {
        input,
        output: None,
        original_size,
        optimized_size: 0,
        original_dimensions: (0, 0),
        optimized_dimensions: (0, 0),
        reduction_percent: 0.0,
        quality_used: None,
        hit_target: false,
        used_original: false,
        error: Some(message),
    }
}

fn build_output_path(
    input_path: &Path,
    output_dir: &Path,
    output_format: ImageFormat,
    opts: &OptimizeOptions,
) -> PathBuf {
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let ext = format_to_extension(output_format);
    let suffix = if !opts.custom_suffix.is_empty() {
        opts.custom_suffix.as_str()
    } else if is_web_profile(opts) {
        DEFAULT_WEB_SUFFIX
    } else {
        DEFAULT_SUFFIX
    };

    let same_name = output_dir.join(format!("{}.{}", stem, ext));
    if opts.output_naming == "replace" && same_name != input_path {
        return same_name;
    }

    output_dir.join(format!("{}{}.{}", stem, suffix, ext))
}

fn resolve_output_dir(input_path: &Path, output_dir: &str) -> PathBuf {
    if output_dir.is_empty() {
        input_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(output_dir)
    }
}

fn optimize_file(file_path: &str, opts: &OptimizeOptions, output_dir: &str) -> OptimizeResult {
    let input_path = Path::new(file_path);
    let original_bytes = match std::fs::read(input_path) {
        Ok(bytes) => bytes,
        Err(e) => {
            return error_result(file_path.to_string(), 0, format!("Cannot read file: {}", e))
        }
    };
    let original_size = original_bytes.len() as u64;

    let img = match image::load_from_memory(&original_bytes) {
        Ok(i) => i,
        Err(e) => {
            return error_result(
                file_path.to_string(),
                original_size,
                format!("Cannot open image: {}", e),
            )
        }
    };

    let original_format = get_format_from_path(input_path).unwrap_or(ImageFormat::Png);
    let original_dimensions = (img.width(), img.height());
    let output_format = get_output_format(&opts.output_format, original_format);

    let outcome = match optimize_image(&original_bytes, img, original_format, opts) {
        Ok(o) => o,
        Err(e) => {
            return error_result(file_path.to_string(), original_size, e);
        }
    };

    let destination = resolve_output_dir(input_path, output_dir);
    let output_path = build_output_path(input_path, &destination, output_format, opts);
    if let Err(e) = std::fs::write(&output_path, &outcome.data) {
        return error_result(
            file_path.to_string(),
            original_size,
            format!("Write error: {}", e),
        );
    }

    OptimizeResult {
        input: file_path.to_string(),
        output: Some(output_path.to_string_lossy().to_string()),
        original_size,
        optimized_size: outcome.data.len() as u64,
        original_dimensions,
        optimized_dimensions: outcome.dimensions,
        reduction_percent: reduction_percent(original_size, outcome.data.len() as u64),
        quality_used: outcome.quality_used,
        hit_target: outcome.hit_target,
        used_original: outcome.used_original,
        error: None,
    }
}

fn read_image_metadata(file_path: &str) -> Result<ImageMetadata, String> {
    let path = Path::new(file_path);
    let metadata =
        std::fs::metadata(path).map_err(|e| format!("Cannot read file metadata: {}", e))?;
    let (width, height) = image::image_dimensions(path)
        .map_err(|e| format!("Cannot read image size: {}", e))?;
    let format = get_format_from_path(path)
        .map(|f| format!("{:?}", f))
        .unwrap_or_else(|| "Unknown".to_string());
    let (orientation, web_width, web_height) = web_fit_size(width, height);

    Ok(ImageMetadata {
        path: file_path.to_string(),
        width,
        height,
        size: metadata.len(),
        format,
        orientation,
        web_width,
        web_height,
    })
}

#[tauri::command]
pub async fn get_images_metadata(file_paths: Vec<String>) -> Vec<ImageMetadata> {
    spawn_blocking(move || {
        file_paths
            .iter()
            .filter_map(|path| read_image_metadata(path).ok())
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn optimize_images(
    app: AppHandle,
    files: Vec<String>,
    options: OptimizeOptions,
    output_dir: String,
) -> Vec<OptimizeResult> {
    let mut results = Vec::new();

    for file_path in &files {
        let _ = app.emit("optimize:progress", (0u32, file_path.clone()));
        tokio::task::yield_now().await;

        let fp = file_path.clone();
        let opts = options.clone();
        let od = output_dir.clone();
        let app2 = app.clone();

        let result = spawn_blocking(move || {
            let _ = app2.emit("optimize:progress", (20u32, fp.clone()));
            let result = optimize_file(&fp, &opts, &od);
            let _ = app2.emit("optimize:progress", (100u32, fp.clone()));
            result
        })
        .await;

        match result {
            Ok(r) => results.push(r),
            Err(e) => results.push(error_result(
                file_path.clone(),
                0,
                format!("Task error: {}", e),
            )),
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    fn noisy_jpeg(width: u32, height: u32, quality: u8) -> (Vec<u8>, DynamicImage) {
        let mut img = ImageBuffer::<Rgb<u8>, _>::new(width, height);
        for (x, y, pixel) in img.enumerate_pixels_mut() {
            let v = ((x.wrapping_mul(7) + y.wrapping_mul(13)) % 256) as u8;
            let r = v;
            let g = v.wrapping_mul(3);
            let b = ((x + y * 2) % 256) as u8;
            *pixel = Rgb([r, g, b]);
        }
        let dynamic = DynamicImage::ImageRgb8(img);
        let bytes = encode_at_quality(&dynamic, ImageFormat::Jpeg, quality).unwrap();
        (bytes, dynamic)
    }

    fn default_opts(keep_percent: u8) -> OptimizeOptions {
        OptimizeOptions {
            output_format: "original".into(),
            keep_percent,
            max_side: None,
            resize_width: None,
            resize_height: None,
            lock_ratio: true,
            output_naming: "suffix".into(),
            custom_suffix: "_optimized".into(),
            profile: None,
        }
    }

    fn web_opts() -> OptimizeOptions {
        OptimizeOptions {
            output_format: "webp".into(),
            keep_percent: 100,
            max_side: None,
            resize_width: None,
            resize_height: None,
            lock_ratio: true,
            output_naming: "suffix".into(),
            custom_suffix: "_web".into(),
            profile: Some("web".into()),
        }
    }

    #[test]
    fn keep_100_without_resize_copies_bytes() {
        let (bytes, img) = noisy_jpeg(120, 80, 70);
        let original = bytes.clone();
        let outcome = optimize_image(&bytes, img, ImageFormat::Jpeg, &default_opts(100)).unwrap();
        assert!(outcome.used_original);
        assert_eq!(outcome.data, original);
    }

    #[test]
    fn same_format_never_heavier_than_original() {
        let (bytes, img) = noisy_jpeg(160, 120, 25);
        let original_len = bytes.len();
        let outcome = optimize_image(&bytes, img, ImageFormat::Jpeg, &default_opts(90)).unwrap();
        assert!(
            outcome.data.len() <= original_len,
            "optimized {} > original {}",
            outcome.data.len(),
            original_len
        );
    }

    #[test]
    fn keep_80_lands_near_target_on_high_quality_jpeg() {
        let (bytes, img) = noisy_jpeg(320, 240, 95);
        let original_len = bytes.len() as f64;
        let outcome = optimize_image(&bytes, img, ImageFormat::Jpeg, &default_opts(80)).unwrap();
        let ratio = outcome.data.len() as f64 / original_len;
        assert!(
            ratio <= 0.80 + 0.02,
            "expected at most ~80% of original, got {:.1}% ({} / {})",
            ratio * 100.0,
            outcome.data.len(),
            original_len
        );
        assert!(
            ratio >= 0.45,
            "expected a result near the target, not a collapse to {:.1}%",
            ratio * 100.0
        );
        assert!(outcome.hit_target);
    }

    #[test]
    fn landscape_6000x4000_fits_1920_wide() {
        let (orientation, width, height) = web_fit_size(6000, 4000);
        assert_eq!(orientation, Orientation::Landscape);
        assert_eq!((width, height), (1920, 1280));
    }

    #[test]
    fn portrait_4000x6000_fits_1350_tall() {
        let (orientation, width, height) = web_fit_size(4000, 6000);
        assert_eq!(orientation, Orientation::Portrait);
        assert_eq!((width, height), (900, 1350));
    }

    #[test]
    fn square_fits_1080() {
        let (orientation, width, height) = web_fit_size(4000, 4000);
        assert_eq!(orientation, Orientation::Square);
        assert_eq!((width, height), (1080, 1080));
    }

    #[test]
    fn sixteen_by_nine_fits_1920x1080() {
        let (orientation, width, height) = web_fit_size(6000, 3375);
        assert_eq!(orientation, Orientation::Landscape);
        assert_eq!((width, height), (1920, 1080));
    }

    #[test]
    fn already_web_sized_is_unchanged() {
        assert_eq!(web_fit_size(1200, 800), (Orientation::Landscape, 1200, 800));
        assert_eq!(web_fit_size(800, 1200), (Orientation::Portrait, 800, 1200));
        assert_eq!(web_fit_size(800, 800), (Orientation::Square, 800, 800));
    }

    #[test]
    fn web_profile_resizes_oversized_landscape() {
        let (bytes, img) = noisy_jpeg(2000, 1333, 90);
        let outcome = optimize_image(&bytes, img, ImageFormat::Jpeg, &web_opts()).unwrap();
        let (_, width, height) = web_fit_size(2000, 1333);
        assert_eq!(outcome.dimensions, (width, height));
        assert_eq!(width, 1920);
    }

    #[test]
    fn mixed_batch_uses_per_file_fit() {
        let landscape = web_fit_size(6000, 4000);
        let portrait = web_fit_size(4000, 6000);
        let square = web_fit_size(3000, 3000);
        assert_eq!(landscape, (Orientation::Landscape, 1920, 1280));
        assert_eq!(portrait, (Orientation::Portrait, 900, 1350));
        assert_eq!(square, (Orientation::Square, 1080, 1080));
    }

    #[test]
    fn web_ceiling_matches_orientation() {
        assert_eq!(web_ceiling_bytes(Orientation::Landscape), 300 * 1024);
        assert_eq!(web_ceiling_bytes(Orientation::Portrait), 220 * 1024);
        assert_eq!(web_ceiling_bytes(Orientation::Square), 200 * 1024);
    }

    #[test]
    fn web_profile_uses_web_quality_not_max() {
        let (bytes, img) = noisy_jpeg(2000, 1333, 90);
        let outcome = optimize_image(&bytes, img, ImageFormat::Jpeg, &web_opts()).unwrap();
        let quality = outcome.quality_used.expect("lossy web encode");
        assert!(
            quality <= WEB_WEBP_QUALITY,
            "web encode should not climb to max quality, got {quality}"
        );
        assert!(
            quality >= WEB_QUALITY_FLOOR,
            "web encode should not go below the floor, got {quality}"
        );
        assert_ne!(quality, 100);
    }

    #[test]
    fn web_profile_ignores_keep_percent() {
        let (bytes, img) = noisy_jpeg(800, 500, 90);
        let mut low = web_opts();
        low.keep_percent = 10;
        let mut high = web_opts();
        high.keep_percent = 100;
        let at_low = optimize_image(&bytes, img.clone(), ImageFormat::Jpeg, &low).unwrap();
        let at_high = optimize_image(&bytes, img, ImageFormat::Jpeg, &high).unwrap();
        assert_eq!(at_low.quality_used, at_high.quality_used);
        assert_eq!(at_low.data.len(), at_high.data.len());
    }

    #[test]
    fn web_profile_stays_under_ceiling_or_floor() {
        let (bytes, img) = noisy_jpeg(2000, 1333, 95);
        let outcome = optimize_image(&bytes, img, ImageFormat::Jpeg, &web_opts()).unwrap();
        let ceiling = web_ceiling_bytes(Orientation::Landscape);
        assert!(
            outcome.data.len() as u64 <= ceiling || outcome.quality_used == Some(WEB_QUALITY_FLOOR),
            "web file {} B exceeds {ceiling} B without hitting quality floor",
            outcome.data.len()
        );
    }
}
