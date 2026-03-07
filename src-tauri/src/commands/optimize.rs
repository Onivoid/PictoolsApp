use image::ImageFormat;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::task::spawn_blocking;

#[derive(Debug, Serialize, Deserialize)]
pub struct OptimizeOptions {
    pub output_format: String, // "png", "jpeg", "webp", "original"
    pub quality: u8,           // 1-100
    pub resize_width: Option<u32>,
    pub resize_height: Option<u32>,
    pub output_naming: String, // "suffix" or "replace"
    pub custom_suffix: String, // e.g., "_optimized"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OptimizeResult {
    pub input: String,
    pub output: Option<String>,
    pub original_size: u64,
    pub optimized_size: u64,
    pub original_dimensions: (u32, u32),
    pub optimized_dimensions: (u32, u32),
    pub reduction_percent: f32,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub size: u64,
    pub format: String,
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

#[tauri::command]
pub async fn get_image_metadata(file_path: String) -> Result<ImageMetadata, String> {
    let path = Path::new(&file_path);

    let metadata =
        std::fs::metadata(path).map_err(|e| format!("Cannot read file metadata: {}", e))?;

    let img = image::open(path).map_err(|e| format!("Cannot open image: {}", e))?;

    let format = get_format_from_path(path)
        .map(|f| format!("{:?}", f))
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(ImageMetadata {
        width: img.width(),
        height: img.height(),
        size: metadata.len(),
        format,
    })
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
        let opts = OptimizeOptions {
            output_format: options.output_format.clone(),
            quality: options.quality,
            resize_width: options.resize_width,
            resize_height: options.resize_height,
            output_naming: options.output_naming.clone(),
            custom_suffix: options.custom_suffix.clone(),
        };
        let od = output_dir.clone();

        let app2 = app.clone();
        let result = spawn_blocking(move || {
            let input_path = Path::new(&fp);

            // Get original file size
            let original_size = match std::fs::metadata(input_path) {
                Ok(meta) => meta.len(),
                Err(e) => {
                    return OptimizeResult {
                        input: fp.clone(),
                        output: None,
                        original_size: 0,
                        optimized_size: 0,
                        original_dimensions: (0, 0),
                        optimized_dimensions: (0, 0),
                        reduction_percent: 0.0,
                        error: Some(format!("Cannot read file metadata: {}", e)),
                    };
                }
            };

            // Load image
            let img = match image::open(input_path) {
                Ok(i) => i,
                Err(e) => {
                    let _ = app2.emit("optimize:progress", (100u32, fp.clone()));
                    return OptimizeResult {
                        input: fp.clone(),
                        output: None,
                        original_size,
                        optimized_size: 0,
                        original_dimensions: (0, 0),
                        optimized_dimensions: (0, 0),
                        reduction_percent: 0.0,
                        error: Some(format!("Cannot open image: {}", e)),
                    };
                }
            };

            let original_dimensions = (img.width(), img.height());
            let _ = app2.emit("optimize:progress", (20u32, fp.clone()));

            // Resize if needed
            let processed_img = if opts.resize_width.is_some() || opts.resize_height.is_some() {
                let new_width = opts.resize_width.unwrap_or(img.width());
                let new_height = opts.resize_height.unwrap_or(img.height());
                img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3)
            } else {
                img
            };

            let optimized_dimensions = (processed_img.width(), processed_img.height());
            let _ = app2.emit("optimize:progress", (50u32, fp.clone()));

            // Determine output format
            let original_format = get_format_from_path(input_path).unwrap_or(ImageFormat::Png);
            let output_format = get_output_format(&opts.output_format, original_format);

            // Build output filename
            let file_stem = input_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("output");

            let output_filename = if opts.output_naming == "replace" {
                format!("{}.{}", file_stem, format_to_extension(output_format))
            } else {
                format!(
                    "{}{}.{}",
                    file_stem,
                    opts.custom_suffix,
                    format_to_extension(output_format)
                )
            };

            let output_path = Path::new(&od)
                .join(output_filename)
                .to_string_lossy()
                .to_string();

            // Encode with quality
            let mut buf = Cursor::new(Vec::new());
            let encode_result: Result<(), image::ImageError> = match output_format {
                ImageFormat::Jpeg => {
                    let encoder =
                        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, opts.quality);
                    processed_img.write_with_encoder(encoder)
                }
                ImageFormat::Png => {
                    let compression_type = if opts.quality >= 90 {
                        image::codecs::png::CompressionType::Fast
                    } else if opts.quality >= 70 {
                        image::codecs::png::CompressionType::Default
                    } else {
                        image::codecs::png::CompressionType::Best
                    };
                    let encoder = image::codecs::png::PngEncoder::new_with_quality(
                        &mut buf,
                        compression_type,
                        image::codecs::png::FilterType::Adaptive,
                    );
                    processed_img.write_with_encoder(encoder)
                }
                ImageFormat::WebP => match webp::Encoder::from_image(&processed_img) {
                    Ok(encoder) => {
                        let webp_data = encoder.encode(opts.quality as f32);
                        buf.get_mut().extend_from_slice(&webp_data);
                        Ok(())
                    }
                    Err(e) => Err(image::ImageError::IoError(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("WebP encoder error: {:?}", e),
                    ))),
                },
                _ => processed_img.write_to(&mut buf, output_format),
            };

            if let Err(e) = encode_result {
                let _ = app2.emit("optimize:progress", (100u32, fp.clone()));
                return OptimizeResult {
                    input: fp.clone(),
                    output: None,
                    original_size,
                    optimized_size: 0,
                    original_dimensions,
                    optimized_dimensions,
                    reduction_percent: 0.0,
                    error: Some(format!("Encoding error: {}", e)),
                };
            }

            let _ = app2.emit("optimize:progress", (80u32, fp.clone()));

            // Write to file
            let data = buf.into_inner();
            let optimized_size = data.len() as u64;

            if let Err(e) = std::fs::write(&output_path, &data) {
                let _ = app2.emit("optimize:progress", (100u32, fp.clone()));
                return OptimizeResult {
                    input: fp.clone(),
                    output: None,
                    original_size,
                    optimized_size: 0,
                    original_dimensions,
                    optimized_dimensions,
                    reduction_percent: 0.0,
                    error: Some(format!("Write error: {}", e)),
                };
            }

            let _ = app2.emit("optimize:progress", (100u32, fp.clone()));

            // Calculate reduction percentage
            let reduction_percent = if original_size > 0 {
                ((original_size as f64 - optimized_size as f64) / original_size as f64 * 100.0)
                    as f32
            } else {
                0.0
            };

            OptimizeResult {
                input: fp.clone(),
                output: Some(output_path),
                original_size,
                optimized_size,
                original_dimensions,
                optimized_dimensions,
                reduction_percent,
                error: None,
            }
        })
        .await;

        match result {
            Ok(r) => results.push(r),
            Err(e) => results.push(OptimizeResult {
                input: file_path.clone(),
                output: None,
                original_size: 0,
                optimized_size: 0,
                original_dimensions: (0, 0),
                optimized_dimensions: (0, 0),
                reduction_percent: 0.0,
                error: Some(format!("Task error: {}", e)),
            }),
        }
    }

    results
}
