use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

pub const DEFAULT_LOSSY_QUALITY: u8 = 85;

fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = DynamicImage::ImageRgb8(img.to_rgb8());
    let mut buf = Cursor::new(Vec::new());
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    rgb.write_with_encoder(encoder)
        .map_err(|e| format!("JPEG encode error: {}", e))?;
    Ok(buf.into_inner())
}

fn encode_webp(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let encoder =
        webp::Encoder::from_image(img).map_err(|e| format!("WebP encoder error: {:?}", e))?;
    Ok(encoder.encode(quality as f32).to_vec())
}

fn encode_png(img: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut buf = Cursor::new(Vec::new());
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut buf,
        image::codecs::png::CompressionType::Best,
        image::codecs::png::FilterType::Adaptive,
    );
    img.write_with_encoder(encoder)
        .map_err(|e| format!("PNG encode error: {}", e))?;
    Ok(buf.into_inner())
}

pub fn encode_at_quality(
    img: &DynamicImage,
    format: ImageFormat,
    quality: u8,
) -> Result<Vec<u8>, String> {
    match format {
        ImageFormat::Jpeg => encode_jpeg(img, quality),
        ImageFormat::WebP => encode_webp(img, quality),
        ImageFormat::Png => encode_png(img),
        other => {
            let mut buf = Cursor::new(Vec::new());
            img.write_to(&mut buf, other)
                .map_err(|e| format!("Encode error: {}", e))?;
            Ok(buf.into_inner())
        }
    }
}

pub fn format_supports_quality(format: ImageFormat) -> bool {
    matches!(format, ImageFormat::Jpeg | ImageFormat::WebP)
}
