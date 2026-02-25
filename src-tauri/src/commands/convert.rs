use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use std::io::{BufWriter, Cursor};
use tauri::{AppHandle, Emitter};
use tokio::task::spawn_blocking;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConvertResult {
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

fn format_from_str(s: &str) -> Option<ImageFormat> {
    match s.to_lowercase().as_str() {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "webp" => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn convert_to_ico_single(img: &DynamicImage, size: u32, output_path: &str) -> Result<(), String> {
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

    Ok(())
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

    for file_path in &files {
        let _ = app.emit("convert:progress", 0u32);
        tokio::task::yield_now().await;

        let fp = file_path.clone();
        let tf = target_format.clone();
        let od = output_dir.clone();
        let is = ico_sizes.clone();

        let app2 = app.clone();
        let batch = spawn_blocking(move || {
            let input_path = std::path::Path::new(&fp);

            let file_stem = match input_path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_string(),
                None => {
                    return vec![ConvertResult {
                        input: fp.clone(),
                        output: None,
                        error: Some("Invalid file name".to_string()),
                    }]
                }
            };

            let target_lower = tf.to_lowercase();
            let ext = match target_lower.as_str() {
                "jpg" | "jpeg" => "jpg",
                "png" => "png",
                "webp" => "webp",
                "ico" => "ico",
                other => other,
            };

            let output_path = std::path::Path::new(&od)
                .join(format!("{}.{}", file_stem, ext))
                .to_string_lossy()
                .to_string();

            let img = match image::open(input_path) {
                Ok(i) => i,
                Err(e) => {
                    let _ = app2.emit("convert:progress", 100u32);
                    return vec![ConvertResult {
                        input: fp.clone(),
                        output: None,
                        error: Some(format!("Cannot open image: {}", e)),
                    }];
                }
            };
            let _ = app2.emit("convert:progress", 30u32);

            let mut batch_results = Vec::new();
            if tf.to_lowercase() == "ico" {
                let default_sizes: &[u32] = &[16, 32, 48, 64, 128, 256];
                let sizes = is.as_deref().unwrap_or(default_sizes);
                let total = sizes.len();
                for (i, &size) in sizes.iter().enumerate() {
                    let pct = 30 + (i * 70 / total) as u32;
                    let _ = app2.emit("convert:progress", pct);
                    let sized_output = std::path::Path::new(&od)
                        .join(format!("{}_{}x{}.ico", file_stem, size, size))
                        .to_string_lossy()
                        .to_string();
                    match convert_to_ico_single(&img, size, &sized_output) {
                        Ok(_) => batch_results.push(ConvertResult {
                            input: fp.clone(),
                            output: Some(sized_output),
                            error: None,
                        }),
                        Err(e) => batch_results.push(ConvertResult {
                            input: fp.clone(),
                            output: None,
                            error: Some(e),
                        }),
                    }
                }
                let _ = app2.emit("convert:progress", 100u32);
            } else {
                let format = match format_from_str(&tf) {
                    Some(f) => f,
                    None => {
                        let _ = app2.emit("convert:progress", 100u32);
                        return vec![ConvertResult {
                            input: fp.clone(),
                            output: None,
                            error: Some(format!("Unsupported format: {}", tf)),
                        }];
                    }
                };
                let mut buf = Cursor::new(Vec::new());
                if let Err(e) = img.write_to(&mut buf, format) {
                    let _ = app2.emit("convert:progress", 100u32);
                    return vec![ConvertResult {
                        input: fp.clone(),
                        output: None,
                        error: Some(format!("Conversion error: {}", e)),
                    }];
                }
                let _ = app2.emit("convert:progress", 80u32);
                if let Err(e) = std::fs::write(&output_path, buf.into_inner()) {
                    let _ = app2.emit("convert:progress", 100u32);
                    return vec![ConvertResult {
                        input: fp.clone(),
                        output: None,
                        error: Some(format!("Write error: {}", e)),
                    }];
                }
                let _ = app2.emit("convert:progress", 100u32);
                batch_results.push(ConvertResult {
                    input: fp.clone(),
                    output: Some(output_path),
                    error: None,
                });
            }
            batch_results
        })
        .await;

        match batch {
            Ok(mut r) => results.append(&mut r),
            Err(e) => results.push(ConvertResult {
                input: file_path.clone(),
                output: None,
                error: Some(format!("Task error: {}", e)),
            }),
        }
    }

    results
}
