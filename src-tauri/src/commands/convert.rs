use crate::commands::encode::{encode_at_quality, DEFAULT_LOSSY_QUALITY};
use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::io::BufWriter;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::task::spawn_blocking;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertResult {
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub original_size: u64,
    pub output_size: u64,
    pub original_dimensions: (u32, u32),
    pub output_dimensions: (u32, u32),
}

fn format_from_str(s: &str) -> Option<ImageFormat> {
    match s.to_lowercase().as_str() {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "webp" => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn empty_result(input: String, original_size: u64, error: Option<String>) -> ConvertResult {
    ConvertResult {
        input,
        output: None,
        error,
        original_size,
        output_size: 0,
        original_dimensions: (0, 0),
        output_dimensions: (0, 0),
    }
}

fn convert_to_ico_single(img: &DynamicImage, size: u32, output_path: &str) -> Result<u64, String> {
    let mut icon_dir = ico::IconDir::new(ico::ResourceType::Icon);

    let resized = img.resize_exact(size, size, image::imageops::FilterType::Lanczos3);
    let rgba = resized.to_rgba8();
    let icon_image = ico::IconImage::from_rgba_data(size, size, rgba.into_raw());
    let entry = ico::IconDirEntry::encode(&icon_image)
        .map_err(|e| format!("ICO encode error at size {}: {}", size, e))?;
    icon_dir.add_entry(entry);

    let file =
        std::fs::File::create(output_path).map_err(|e| format!("Cannot create file: {}", e))?;
    let writer = BufWriter::new(file);
    icon_dir
        .write(writer)
        .map_err(|e| format!("ICO write error: {}", e))?;

    std::fs::metadata(output_path)
        .map(|m| m.len())
        .map_err(|e| format!("Cannot read output size: {}", e))
}

fn convert_one(
    file_path: &str,
    target_format: &str,
    ico_sizes: Option<&[u32]>,
    output_dir: &str,
) -> Vec<ConvertResult> {
    let input_path = Path::new(file_path);
    let original_bytes = match std::fs::read(input_path) {
        Ok(b) => b,
        Err(e) => {
            return vec![empty_result(
                file_path.to_string(),
                0,
                Some(format!("Cannot read file: {}", e)),
            )]
        }
    };
    let original_size = original_bytes.len() as u64;

    let file_stem = match input_path.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s.to_string(),
        None => {
            return vec![empty_result(
                file_path.to_string(),
                original_size,
                Some("Invalid file name".to_string()),
            )]
        }
    };

    let img = match image::load_from_memory(&original_bytes) {
        Ok(i) => i,
        Err(e) => {
            return vec![empty_result(
                file_path.to_string(),
                original_size,
                Some(format!("Cannot open image: {}", e)),
            )]
        }
    };

    let original_dimensions = (img.width(), img.height());
    let target_lower = target_format.to_lowercase();

    if target_lower == "ico" {
        let default_sizes: &[u32] = &[16, 32, 48, 64, 128, 256];
        let sizes = ico_sizes.unwrap_or(default_sizes);
        let mut batch_results = Vec::new();
        for &size in sizes {
            let sized_output = Path::new(output_dir)
                .join(format!("{}_{}x{}.ico", file_stem, size, size))
                .to_string_lossy()
                .to_string();
            match convert_to_ico_single(&img, size, &sized_output) {
                Ok(output_size) => batch_results.push(ConvertResult {
                    input: file_path.to_string(),
                    output: Some(sized_output),
                    error: None,
                    original_size,
                    output_size,
                    original_dimensions,
                    output_dimensions: (size, size),
                }),
                Err(e) => {
                    batch_results.push(empty_result(file_path.to_string(), original_size, Some(e)))
                }
            }
        }
        return batch_results;
    }

    let format = match format_from_str(&target_lower) {
        Some(f) => f,
        None => {
            return vec![empty_result(
                file_path.to_string(),
                original_size,
                Some(format!("Unsupported format: {}", target_format)),
            )]
        }
    };

    let ext = match target_lower.as_str() {
        "jpg" | "jpeg" => "jpg",
        "png" => "png",
        "webp" => "webp",
        other => other,
    };
    let output_path = Path::new(output_dir)
        .join(format!("{}.{}", file_stem, ext))
        .to_string_lossy()
        .to_string();

    let encoded = match encode_at_quality(&img, format, DEFAULT_LOSSY_QUALITY) {
        Ok(data) => data,
        Err(e) => {
            return vec![empty_result(
                file_path.to_string(),
                original_size,
                Some(format!("Conversion error: {}", e)),
            )]
        }
    };

    if let Err(e) = std::fs::write(&output_path, &encoded) {
        return vec![empty_result(
            file_path.to_string(),
            original_size,
            Some(format!("Write error: {}", e)),
        )];
    }

    vec![ConvertResult {
        input: file_path.to_string(),
        output: Some(output_path),
        error: None,
        original_size,
        output_size: encoded.len() as u64,
        original_dimensions,
        output_dimensions: original_dimensions,
    }]
}

#[tauri::command]
pub async fn convert_images(
    app: AppHandle,
    files: Vec<String>,
    target_format: String,
    ico_sizes: Option<Vec<u32>>,
    output_dir: String,
) -> Vec<ConvertResult> {
    let mut results = Vec::new();
    let total = files.len().max(1);

    for (index, file_path) in files.iter().enumerate() {
        let start_pct = (index * 100 / total) as u32;
        let _ = app.emit("convert:progress", (start_pct, file_path.clone()));
        tokio::task::yield_now().await;

        let fp = file_path.clone();
        let tf = target_format.clone();
        let od = output_dir.clone();
        let is = ico_sizes.clone();
        let app2 = app.clone();

        let batch = spawn_blocking(move || {
            let converted = convert_one(&fp, &tf, is.as_deref(), &od);
            let _ = app2.emit("convert:progress", (100u32, fp.clone()));
            converted
        })
        .await;

        match batch {
            Ok(mut r) => results.append(&mut r),
            Err(e) => results.push(empty_result(
                file_path.clone(),
                0,
                Some(format!("Task error: {}", e)),
            )),
        }
    }

    results
}
