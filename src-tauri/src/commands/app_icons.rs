use icns::{IconFamily, IconType, Image as IcnsImage};
use ico::{IconDir, IconDirEntry, IconImage, ResourceType};
use image::imageops::FilterType;
use serde::{Deserialize, Serialize};
use std::io::BufWriter;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppIconsResult {
    pub file: String,
    pub ok: bool,
    pub error: Option<String>,
}

fn save_png(img: &image::DynamicImage, size: u32, path: &Path) -> Result<(), String> {
    let resized = img.resize_exact(size, size, FilterType::Lanczos3);
    resized
        .save_with_format(path, image::ImageFormat::Png)
        .map_err(|e| format!("{}: {}", path.display(), e))
}

fn save_ico_multi(img: &image::DynamicImage, sizes: &[u32], path: &Path) -> Result<(), String> {
    let mut icon_dir = IconDir::new(ResourceType::Icon);
    for &size in sizes {
        let resized = img.resize_exact(size, size, FilterType::Lanczos3);
        let rgba = resized.to_rgba8();
        let icon_image = IconImage::from_rgba_data(size, size, rgba.into_raw());
        let entry = IconDirEntry::encode(&icon_image)
            .map_err(|e| format!("ICO encode {}x{}: {}", size, size, e))?;
        icon_dir.add_entry(entry);
    }
    let file = std::fs::File::create(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    icon_dir
        .write(BufWriter::new(file))
        .map_err(|e| format!("{}: {}", path.display(), e))
}

fn save_icns(img: &image::DynamicImage, path: &Path) -> Result<(), String> {
    let mut family = IconFamily::new();

    let sizes: &[(u32, IconType)] = &[
        (16, IconType::RGBA32_16x16),
        (32, IconType::RGBA32_32x32),
        (64, IconType::RGBA32_64x64),
        (128, IconType::RGBA32_128x128),
        (256, IconType::RGBA32_256x256),
        (512, IconType::RGBA32_512x512),
    ];

    for &(size, icon_type) in sizes {
        let resized = img.resize_exact(size, size, FilterType::Lanczos3);
        let rgba8 = resized.to_rgba8();
        let icns_img = IcnsImage::from_data(icns::PixelFormat::RGBA, size, size, rgba8.into_raw())
            .map_err(|e| format!("ICNS image {}x{}: {}", size, size, e))?;
        family
            .add_icon_with_type(&icns_img, icon_type)
            .map_err(|e| format!("ICNS add {}x{}: {}", size, size, e))?;
    }

    let file = std::fs::File::create(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    family
        .write(BufWriter::new(file))
        .map_err(|e| format!("{}: {}", path.display(), e))
}

#[tauri::command]
pub async fn generate_app_icons(
    app: AppHandle,
    input: String,
    output_dir: String,
) -> Vec<AppIconsResult> {
    let src = match image::open(&input) {
        Ok(i) => i,
        Err(e) => {
            return vec![AppIconsResult {
                file: input.clone(),
                ok: false,
                error: Some(format!("Cannot open image: {}", e)),
            }]
        }
    };

    let out = Path::new(&output_dir);
    let mut results: Vec<AppIconsResult> = Vec::new();

    let png_targets: &[(&str, u32)] = &[
        ("icon.png", 512),
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("Square30x30Logo.png", 30),
        ("Square44x44Logo.png", 44),
        ("Square71x71Logo.png", 71),
        ("Square89x89Logo.png", 89),
        ("Square107x107Logo.png", 107),
        ("Square142x142Logo.png", 142),
        ("Square150x150Logo.png", 150),
        ("Square284x284Logo.png", 284),
        ("Square310x310Logo.png", 310),
        ("StoreLogo.png", 50),
    ];
    let total = png_targets.len() + 2;

    for (i, &(name, size)) in png_targets.iter().enumerate() {
        let _ = app.emit("convert:progress", (i * 100 / total, name));
        let path = out.join(name);
        match save_png(&src, size, &path) {
            Ok(_) => results.push(AppIconsResult {
                file: name.to_string(),
                ok: true,
                error: None,
            }),
            Err(e) => results.push(AppIconsResult {
                file: name.to_string(),
                ok: false,
                error: Some(e),
            }),
        }
    }

    let ico_idx = png_targets.len();
    let _ = app.emit("convert:progress", (ico_idx * 100 / total, "icon.ico"));
    let ico_path = out.join("icon.ico");
    match save_ico_multi(&src, &[16, 24, 32, 48, 64, 128, 256], &ico_path) {
        Ok(_) => results.push(AppIconsResult {
            file: "icon.ico".to_string(),
            ok: true,
            error: None,
        }),
        Err(e) => results.push(AppIconsResult {
            file: "icon.ico".to_string(),
            ok: false,
            error: Some(e),
        }),
    }

    let icns_idx = png_targets.len() + 1;
    let _ = app.emit("convert:progress", (icns_idx * 100 / total, "icon.icns"));
    let icns_path = out.join("icon.icns");
    match save_icns(&src, &icns_path) {
        Ok(_) => results.push(AppIconsResult {
            file: "icon.icns".to_string(),
            ok: true,
            error: None,
        }),
        Err(e) => results.push(AppIconsResult {
            file: "icon.icns".to_string(),
            ok: false,
            error: Some(e),
        }),
    }

    let _ = app.emit("convert:progress", (100usize, "done"));
    results
}
