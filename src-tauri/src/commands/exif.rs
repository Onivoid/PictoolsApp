use little_exif::exif_tag::ExifTag;
use little_exif::ifd::ExifTagGroup;
use little_exif::metadata::Metadata;
use little_exif::rational::uR64;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::task::spawn_blocking;

const DEFAULT_SUFFIX: &str = "_exif";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExifCommonFields {
    pub description: String,
    pub datetime_original: String,
    pub make: String,
    pub model: String,
    pub artist: String,
    pub copyright: String,
    pub credit: String,
    pub rights_usage: String,
    pub contact: String,
    pub software: String,
    pub orientation: String,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    pub gps_altitude: Option<f64>,
    pub clear_gps: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifTagEntry {
    pub name: String,
    pub hex: String,
    pub group: String,
    pub value: String,
    pub editable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifTagUpdate {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifReadResult {
    pub path: String,
    pub supported: bool,
    pub common: ExifCommonFields,
    pub tags: Vec<ExifTagEntry>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifWritePatch {
    pub common: ExifCommonFields,
    #[serde(default)]
    pub tag_updates: Vec<ExifTagUpdate>,
    /// `"full"` writes every common field; `"rights"` only artist protection fields.
    #[serde(default = "default_write_mode")]
    pub mode: String,
}

fn default_write_mode() -> String {
    "full".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifWriteOptions {
    pub output_naming: String,
    pub custom_suffix: String,
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExifWriteResult {
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

fn is_supported_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "tif" | "tiff" | "webp"
            )
        })
        .unwrap_or(false)
}

fn group_label(group: ExifTagGroup) -> &'static str {
    match group {
        ExifTagGroup::GENERIC => "IFD0",
        ExifTagGroup::EXIF => "Exif",
        ExifTagGroup::GPS => "GPS",
        ExifTagGroup::INTEROP => "Interop",
    }
}

fn tag_variant_name(tag: &ExifTag) -> String {
    let debug = format!("{:?}", tag);
    debug
        .split('(')
        .next()
        .unwrap_or(&debug)
        .trim()
        .to_string()
}

fn format_rational_list(values: &[uR64]) -> String {
    values
        .iter()
        .map(|r| {
            if r.denominator == 0 {
                format!("{}/{}", r.nominator, r.denominator)
            } else if r.denominator == 1 {
                r.nominator.to_string()
            } else {
                let as_f: f64 = r.clone().into();
                if (as_f - as_f.round()).abs() < 1e-9 {
                    format!("{}", as_f.round() as i64)
                } else {
                    format!("{:.6}", as_f)
                        .trim_end_matches('0')
                        .trim_end_matches('.')
                        .to_string()
                }
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn tag_value_string(tag: &ExifTag) -> String {
    match tag {
        ExifTag::ImageDescription(v)
        | ExifTag::Make(v)
        | ExifTag::Model(v)
        | ExifTag::Software(v)
        | ExifTag::Artist(v)
        | ExifTag::Copyright(v)
        | ExifTag::DateTimeOriginal(v)
        | ExifTag::CreateDate(v)
        | ExifTag::ModifyDate(v)
        | ExifTag::GPSLatitudeRef(v)
        | ExifTag::GPSLongitudeRef(v)
        | ExifTag::GPSDateStamp(v)
        | ExifTag::GPSSatellites(v)
        | ExifTag::GPSStatus(v)
        | ExifTag::GPSMeasureMode(v)
        | ExifTag::GPSSpeedRef(v)
        | ExifTag::GPSTrackRef(v)
        | ExifTag::GPSImgDirectionRef(v)
        | ExifTag::GPSMapDatum(v)
        | ExifTag::UnknownSTRING(v, _, _) => v.trim_end_matches('\0').to_string(),
        ExifTag::Orientation(v)
        | ExifTag::ISO(v)
        | ExifTag::Flash(v)
        | ExifTag::WhiteBalance(v)
        | ExifTag::MeteringMode(v)
        | ExifTag::ExposureProgram(v)
        | ExifTag::UnknownINT16U(v, _, _) => v
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(", "),
        ExifTag::ImageWidth(v)
        | ExifTag::ImageHeight(v)
        | ExifTag::ExifImageWidth(v)
        | ExifTag::ExifImageHeight(v)
        | ExifTag::UnknownINT32U(v, _, _) => v
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(", "),
        ExifTag::GPSAltitudeRef(v) | ExifTag::UnknownINT8U(v, _, _) => v
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join(", "),
        ExifTag::UserComment(bytes) | ExifTag::UnknownUNDEF(bytes, _, _) => {
            decode_user_comment_bytes(bytes)
        }
        ExifTag::GPSLatitude(v)
        | ExifTag::GPSLongitude(v)
        | ExifTag::GPSAltitude(v)
        | ExifTag::ExposureTime(v)
        | ExifTag::FNumber(v)
        | ExifTag::FocalLength(v)
        | ExifTag::XResolution(v)
        | ExifTag::YResolution(v)
        | ExifTag::UnknownRATIONAL64U(v, _, _) => format_rational_list(v),
        other => {
            let debug = format!("{:?}", other);
            if let Some(start) = debug.find('(') {
                let mut inner = debug[start + 1..].to_string();
                if inner.ends_with(')') {
                    inner.pop();
                }
                inner
            } else {
                debug
            }
        }
    }
}

fn tag_is_editable(tag: &ExifTag) -> bool {
    tag.is_writable()
        && matches!(
            tag_variant_name(tag).as_str(),
            "ImageDescription"
                | "Make"
                | "Model"
                | "Software"
                | "Artist"
                | "Copyright"
                | "DateTimeOriginal"
                | "CreateDate"
                | "ModifyDate"
                | "Orientation"
                | "UserComment"
        )
}

fn dms_to_decimal(values: &[uR64], ref_value: &str) -> Option<f64> {
    if values.len() < 3 {
        return None;
    }
    let deg: f64 = values[0].clone().into();
    let min: f64 = values[1].clone().into();
    let sec: f64 = values[2].clone().into();
    let mut decimal = deg + (min / 60.0) + (sec / 3600.0);
    let r = ref_value.trim_end_matches('\0').trim();
    if r.eq_ignore_ascii_case("S") || r.eq_ignore_ascii_case("W") {
        decimal = -decimal;
    }
    Some(decimal)
}

fn decimal_to_dms(decimal: f64) -> Vec<uR64> {
    let abs = decimal.abs();
    let deg = abs.floor();
    let min_f = (abs - deg) * 60.0;
    let min = min_f.floor();
    let sec = (min_f - min) * 60.0;
    vec![
        uR64 {
            nominator: deg as u32,
            denominator: 1,
        },
        uR64 {
            nominator: min as u32,
            denominator: 1,
        },
        uR64::from(sec),
    ]
}

fn first_string_tag(meta: &Metadata, probe: ExifTag) -> String {
    meta.get_tag(&probe)
        .next()
        .map(tag_value_string)
        .unwrap_or_default()
}

fn first_orientation(meta: &Metadata) -> String {
    meta.get_tag(&ExifTag::Orientation(Vec::new()))
        .next()
        .map(tag_value_string)
        .unwrap_or_default()
}

fn decode_user_comment_bytes(data: &[u8]) -> String {
    let text = if data.len() >= 8 {
        let header = &data[..8];
        let is_charset = header.starts_with(b"ASCII")
            || header.starts_with(b"UNICODE")
            || header.starts_with(b"JIS")
            || header.iter().all(|b| *b == 0);
        if is_charset {
            String::from_utf8_lossy(&data[8..]).to_string()
        } else {
            String::from_utf8_lossy(data).to_string()
        }
    } else {
        String::from_utf8_lossy(data).to_string()
    };
    text.trim_end_matches('\0').trim().to_string()
}

fn read_user_comment(meta: &Metadata) -> String {
    meta.get_tag(&ExifTag::UserComment(Vec::new()))
        .next()
        .and_then(|tag| match tag {
            ExifTag::UserComment(bytes) => Some(decode_user_comment_bytes(bytes)),
            _ => None,
        })
        .unwrap_or_default()
}

#[derive(Default)]
struct RightsExtras {
    credit: String,
    rights_usage: String,
    contact: String,
}

fn parse_rights_extras(raw: &str) -> RightsExtras {
    let trimmed = raw.trim();
    if !trimmed.starts_with("PictoolsRights1") {
        return RightsExtras {
            rights_usage: trimmed.to_string(),
            ..RightsExtras::default()
        };
    }
    let mut extras = RightsExtras::default();
    for line in trimmed.lines().skip(1) {
        if let Some((key, value)) = line.split_once('=') {
            match key.trim() {
                "credit" => extras.credit = value.to_string(),
                "usage" => extras.rights_usage = value.to_string(),
                "contact" => extras.contact = value.to_string(),
                _ => {}
            }
        }
    }
    extras
}

fn encode_user_comment(credit: &str, usage: &str, contact: &str) -> Option<Vec<u8>> {
    let credit = credit.trim();
    let usage = usage.trim();
    let contact = contact.trim();
    if credit.is_empty() && usage.is_empty() && contact.is_empty() {
        return None;
    }
    let mut body = String::from("PictoolsRights1\n");
    if !credit.is_empty() {
        body.push_str(&format!("credit={credit}\n"));
    }
    if !usage.is_empty() {
        body.push_str(&format!("usage={usage}\n"));
    }
    if !contact.is_empty() {
        body.push_str(&format!("contact={contact}\n"));
    }
    let mut bytes = b"ASCII\0\0\0".to_vec();
    bytes.extend_from_slice(body.as_bytes());
    Some(bytes)
}

fn apply_user_comment(meta: &mut Metadata, credit: &str, usage: &str, contact: &str) {
    match encode_user_comment(credit, usage, contact) {
        Some(bytes) => meta.set_tag(ExifTag::UserComment(bytes)),
        None => {
            meta.remove_tag(ExifTag::UserComment(Vec::new()));
        }
    }
}

fn read_common(meta: &Metadata) -> ExifCommonFields {
    let lat_ref = first_string_tag(meta, ExifTag::GPSLatitudeRef(String::new()));
    let lon_ref = first_string_tag(meta, ExifTag::GPSLongitudeRef(String::new()));
    let lat = meta
        .get_tag(&ExifTag::GPSLatitude(Vec::new()))
        .next()
        .and_then(|tag| match tag {
            ExifTag::GPSLatitude(v) => dms_to_decimal(v, &lat_ref),
            _ => None,
        });
    let lon = meta
        .get_tag(&ExifTag::GPSLongitude(Vec::new()))
        .next()
        .and_then(|tag| match tag {
            ExifTag::GPSLongitude(v) => dms_to_decimal(v, &lon_ref),
            _ => None,
        });
    let alt_below = meta
        .get_tag(&ExifTag::GPSAltitudeRef(Vec::new()))
        .next()
        .and_then(|tag| match tag {
            ExifTag::GPSAltitudeRef(refs) => refs.first().copied(),
            _ => None,
        })
        .unwrap_or(0)
        == 1;
    let alt = meta
        .get_tag(&ExifTag::GPSAltitude(Vec::new()))
        .next()
        .and_then(|tag| match tag {
            ExifTag::GPSAltitude(v) => v.first().map(|r| {
                let value: f64 = r.clone().into();
                if alt_below { -value } else { value }
            }),
            _ => None,
        });

    let extras = parse_rights_extras(&read_user_comment(meta));

    ExifCommonFields {
        description: first_string_tag(meta, ExifTag::ImageDescription(String::new())),
        datetime_original: first_string_tag(meta, ExifTag::DateTimeOriginal(String::new())),
        make: first_string_tag(meta, ExifTag::Make(String::new())),
        model: first_string_tag(meta, ExifTag::Model(String::new())),
        artist: first_string_tag(meta, ExifTag::Artist(String::new())),
        copyright: first_string_tag(meta, ExifTag::Copyright(String::new())),
        credit: extras.credit,
        rights_usage: extras.rights_usage,
        contact: extras.contact,
        software: first_string_tag(meta, ExifTag::Software(String::new())),
        orientation: first_orientation(meta),
        gps_latitude: lat,
        gps_longitude: lon,
        gps_altitude: alt,
        clear_gps: false,
    }
}

fn collect_tags(meta: &Metadata) -> Vec<ExifTagEntry> {
    let mut tags: Vec<ExifTagEntry> = meta
        .into_iter()
        .filter(|tag| {
            !matches!(
                tag,
                ExifTag::ExifOffset(_)
                    | ExifTag::GPSInfo(_)
                    | ExifTag::InteropOffset(_)
                    | ExifTag::StripOffsets(_, _)
                    | ExifTag::StripByteCounts(_)
                    | ExifTag::ThumbnailOffset(_, _)
                    | ExifTag::ThumbnailLength(_)
            )
        })
        .map(|tag| ExifTagEntry {
            name: tag_variant_name(tag),
            hex: format!("0x{:04X}", tag.as_u16()),
            group: group_label(tag.get_group()).to_string(),
            value: tag_value_string(tag),
            editable: tag_is_editable(tag),
        })
        .collect();
    tags.sort_by(|a, b| a.group.cmp(&b.group).then(a.name.cmp(&b.name)));
    tags
}

fn read_path(path: &str) -> ExifReadResult {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return ExifReadResult {
            path: path.to_string(),
            supported: false,
            common: ExifCommonFields::default(),
            tags: Vec::new(),
            error: Some("File not found".into()),
        };
    }
    if !is_supported_extension(file_path) {
        return ExifReadResult {
            path: path.to_string(),
            supported: false,
            common: ExifCommonFields::default(),
            tags: Vec::new(),
            error: Some("Format not supported for Exif (use JPEG, PNG, TIFF, or WebP)".into()),
        };
    }

    match Metadata::new_from_path(file_path) {
        Ok(meta) => ExifReadResult {
            path: path.to_string(),
            supported: true,
            common: read_common(&meta),
            tags: collect_tags(&meta),
            error: None,
        },
        Err(e) => {
            // Missing Exif is a normal starting point (fresh export, stripped file).
            let message = e.to_string();
            let empty = message.to_ascii_lowercase().contains("no exif")
                || message.to_ascii_lowercase().contains("exif data");
            if empty {
                ExifReadResult {
                    path: path.to_string(),
                    supported: true,
                    common: ExifCommonFields::default(),
                    tags: Vec::new(),
                    error: None,
                }
            } else {
                ExifReadResult {
                    path: path.to_string(),
                    supported: true,
                    common: ExifCommonFields::default(),
                    tags: Vec::new(),
                    error: Some(format!("Could not read Exif: {}", message)),
                }
            }
        }
    }
}

fn set_or_clear_string(meta: &mut Metadata, empty_probe: ExifTag, value: &str, make: fn(String) -> ExifTag) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        meta.remove_tag(empty_probe);
    } else {
        meta.set_tag(make(trimmed.to_string()));
    }
}

fn clear_gps_tags(meta: &mut Metadata) {
    let probes = [
        ExifTag::GPSVersionID(Vec::new()),
        ExifTag::GPSLatitudeRef(String::new()),
        ExifTag::GPSLatitude(Vec::new()),
        ExifTag::GPSLongitudeRef(String::new()),
        ExifTag::GPSLongitude(Vec::new()),
        ExifTag::GPSAltitudeRef(Vec::new()),
        ExifTag::GPSAltitude(Vec::new()),
        ExifTag::GPSTimeStamp(Vec::new()),
        ExifTag::GPSSatellites(String::new()),
        ExifTag::GPSStatus(String::new()),
        ExifTag::GPSMeasureMode(String::new()),
        ExifTag::GPSDOP(Vec::new()),
        ExifTag::GPSSpeedRef(String::new()),
        ExifTag::GPSSpeed(Vec::new()),
        ExifTag::GPSTrackRef(String::new()),
        ExifTag::GPSTrack(Vec::new()),
        ExifTag::GPSImgDirectionRef(String::new()),
        ExifTag::GPSImgDirection(Vec::new()),
        ExifTag::GPSMapDatum(String::new()),
        ExifTag::GPSDestLatitudeRef(String::new()),
        ExifTag::GPSDestLatitude(Vec::new()),
        ExifTag::GPSDestLongitudeRef(String::new()),
        ExifTag::GPSDestLongitude(Vec::new()),
        ExifTag::GPSDestBearingRef(String::new()),
        ExifTag::GPSDestBearing(Vec::new()),
        ExifTag::GPSDestDistanceRef(String::new()),
        ExifTag::GPSDestDistance(Vec::new()),
        ExifTag::GPSProcessingMethod(Vec::new()),
        ExifTag::GPSAreaInformation(Vec::new()),
        ExifTag::GPSDateStamp(String::new()),
        ExifTag::GPSDifferential(Vec::new()),
        ExifTag::GPSHPositioningError(Vec::new()),
        ExifTag::GPSInfo(Vec::new()),
    ];
    for probe in probes {
        meta.remove_tag(probe);
    }
}

fn apply_gps(meta: &mut Metadata, common: &ExifCommonFields) {
    if common.clear_gps {
        clear_gps_tags(meta);
        return;
    }
    if let (Some(lat), Some(lon)) = (common.gps_latitude, common.gps_longitude) {
        let lat_ref = if lat < 0.0 { "S" } else { "N" };
        let lon_ref = if lon < 0.0 { "W" } else { "E" };
        meta.set_tag(ExifTag::GPSLatitudeRef(lat_ref.to_string()));
        meta.set_tag(ExifTag::GPSLatitude(decimal_to_dms(lat)));
        meta.set_tag(ExifTag::GPSLongitudeRef(lon_ref.to_string()));
        meta.set_tag(ExifTag::GPSLongitude(decimal_to_dms(lon)));
    }
    if let Some(alt) = common.gps_altitude {
        let below = alt < 0.0;
        meta.set_tag(ExifTag::GPSAltitudeRef(vec![if below { 1 } else { 0 }]));
        meta.set_tag(ExifTag::GPSAltitude(vec![uR64::from(alt.abs())]));
    }
}

fn apply_rights(meta: &mut Metadata, common: &ExifCommonFields) {
    set_or_clear_string(
        meta,
        ExifTag::Artist(String::new()),
        &common.artist,
        ExifTag::Artist,
    );
    set_or_clear_string(
        meta,
        ExifTag::Copyright(String::new()),
        &common.copyright,
        ExifTag::Copyright,
    );
    apply_user_comment(
        meta,
        &common.credit,
        &common.rights_usage,
        &common.contact,
    );
}

fn apply_common(meta: &mut Metadata, common: &ExifCommonFields) {
    set_or_clear_string(
        meta,
        ExifTag::ImageDescription(String::new()),
        &common.description,
        ExifTag::ImageDescription,
    );
    set_or_clear_string(
        meta,
        ExifTag::DateTimeOriginal(String::new()),
        &common.datetime_original,
        ExifTag::DateTimeOriginal,
    );
    set_or_clear_string(meta, ExifTag::Make(String::new()), &common.make, ExifTag::Make);
    set_or_clear_string(meta, ExifTag::Model(String::new()), &common.model, ExifTag::Model);
    set_or_clear_string(
        meta,
        ExifTag::Software(String::new()),
        &common.software,
        ExifTag::Software,
    );

    apply_rights(meta, common);

    let orientation = common.orientation.trim();
    if orientation.is_empty() {
        meta.remove_tag(ExifTag::Orientation(Vec::new()));
    } else if let Ok(value) = orientation.parse::<u16>() {
        meta.set_tag(ExifTag::Orientation(vec![value]));
    }

    apply_gps(meta, common);
}

fn apply_tag_updates(meta: &mut Metadata, updates: &[ExifTagUpdate]) {
    for update in updates {
        let name = update.name.trim();
        let value = update.value.trim();
        match name {
            "ImageDescription" => set_or_clear_string(
                meta,
                ExifTag::ImageDescription(String::new()),
                value,
                ExifTag::ImageDescription,
            ),
            "Make" => set_or_clear_string(meta, ExifTag::Make(String::new()), value, ExifTag::Make),
            "Model" => {
                set_or_clear_string(meta, ExifTag::Model(String::new()), value, ExifTag::Model)
            }
            "Software" => set_or_clear_string(
                meta,
                ExifTag::Software(String::new()),
                value,
                ExifTag::Software,
            ),
            "Artist" => {
                set_or_clear_string(meta, ExifTag::Artist(String::new()), value, ExifTag::Artist)
            }
            "Copyright" => set_or_clear_string(
                meta,
                ExifTag::Copyright(String::new()),
                value,
                ExifTag::Copyright,
            ),
            "DateTimeOriginal" => set_or_clear_string(
                meta,
                ExifTag::DateTimeOriginal(String::new()),
                value,
                ExifTag::DateTimeOriginal,
            ),
            "CreateDate" => set_or_clear_string(
                meta,
                ExifTag::CreateDate(String::new()),
                value,
                ExifTag::CreateDate,
            ),
            "ModifyDate" => set_or_clear_string(
                meta,
                ExifTag::ModifyDate(String::new()),
                value,
                ExifTag::ModifyDate,
            ),
            "Orientation" => {
                if value.is_empty() {
                    meta.remove_tag(ExifTag::Orientation(Vec::new()));
                } else if let Ok(n) = value.parse::<u16>() {
                    meta.set_tag(ExifTag::Orientation(vec![n]));
                }
            }
            _ => {}
        }
    }
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

fn build_output_path(input_path: &Path, output_dir: &Path, options: &ExifWriteOptions) -> PathBuf {
    let stem = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let ext = input_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("jpg");
    let suffix = if !options.custom_suffix.is_empty() {
        options.custom_suffix.as_str()
    } else {
        DEFAULT_SUFFIX
    };

    let same_name = output_dir.join(format!("{}.{}", stem, ext));
    if options.output_naming == "replace" && same_name != input_path {
        return same_name;
    }

    let mut candidate = output_dir.join(format!("{}{}.{}", stem, suffix, ext));
    if candidate == input_path {
        candidate = output_dir.join(format!("{}{}.{}", stem, DEFAULT_SUFFIX, ext));
    }
    candidate
}

fn prepare_output_file(input: &Path, output: &Path) -> Result<(), String> {
    if input == output {
        return Ok(());
    }
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create folder: {}", e))?;
    }
    std::fs::copy(input, output).map_err(|e| format!("Cannot copy source: {}", e))?;
    Ok(())
}

fn write_metadata_to(meta: &Metadata, output: &Path) -> Result<(), String> {
    meta.write_to_file(output)
        .map_err(|e| format!("Cannot write Exif: {}", e))
}

fn apply_patch_to_file(
    input: &str,
    patch: &ExifWritePatch,
    options: &ExifWriteOptions,
) -> ExifWriteResult {
    let input_path = Path::new(input);
    if !is_supported_extension(input_path) {
        return ExifWriteResult {
            input: input.to_string(),
            output: None,
            error: Some("Format not supported for Exif".into()),
        };
    }

    let mut meta = Metadata::new_from_path(input_path).unwrap_or_else(|_| Metadata::new());

    if patch.mode == "rights" {
        apply_rights(&mut meta, &patch.common);
    } else {
        apply_common(&mut meta, &patch.common);
        apply_tag_updates(&mut meta, &patch.tag_updates);
    }

    let destination = resolve_output_dir(input_path, &options.output_dir);
    let output_path = build_output_path(input_path, &destination, options);

    if let Err(e) = prepare_output_file(input_path, &output_path) {
        return ExifWriteResult {
            input: input.to_string(),
            output: None,
            error: Some(e),
        };
    }

    if let Err(e) = write_metadata_to(&meta, &output_path) {
        return ExifWriteResult {
            input: input.to_string(),
            output: None,
            error: Some(e),
        };
    }

    ExifWriteResult {
        input: input.to_string(),
        output: Some(output_path.to_string_lossy().to_string()),
        error: None,
    }
}

fn strip_file(input: &str, mode: &str, options: &ExifWriteOptions) -> ExifWriteResult {
    let input_path = Path::new(input);
    if !is_supported_extension(input_path) {
        return ExifWriteResult {
            input: input.to_string(),
            output: None,
            error: Some("Format not supported for Exif".into()),
        };
    }

    let destination = resolve_output_dir(input_path, &options.output_dir);
    let output_path = build_output_path(input_path, &destination, options);

    if let Err(e) = prepare_output_file(input_path, &output_path) {
        return ExifWriteResult {
            input: input.to_string(),
            output: None,
            error: Some(e),
        };
    }

    match mode {
        "all" => {
            if let Err(e) = Metadata::file_clear_metadata(&output_path) {
                return ExifWriteResult {
                    input: input.to_string(),
                    output: None,
                    error: Some(format!("Cannot strip metadata: {}", e)),
                };
            }
        }
        "gps" => {
            let mut meta = match Metadata::new_from_path(&output_path) {
                Ok(m) => m,
                Err(e) => {
                    return ExifWriteResult {
                        input: input.to_string(),
                        output: None,
                        error: Some(format!("Cannot read Exif: {}", e)),
                    };
                }
            };
            clear_gps_tags(&mut meta);
            if let Err(e) = write_metadata_to(&meta, &output_path) {
                return ExifWriteResult {
                    input: input.to_string(),
                    output: None,
                    error: Some(e),
                };
            }
        }
        other => {
            return ExifWriteResult {
                input: input.to_string(),
                output: None,
                error: Some(format!("Unknown strip mode: {}", other)),
            };
        }
    }

    ExifWriteResult {
        input: input.to_string(),
        output: Some(output_path.to_string_lossy().to_string()),
        error: None,
    }
}

#[tauri::command]
pub async fn read_exif(path: String) -> ExifReadResult {
    spawn_blocking(move || read_path(&path))
        .await
        .unwrap_or_else(|e| ExifReadResult {
            path: String::new(),
            supported: false,
            common: ExifCommonFields::default(),
            tags: Vec::new(),
            error: Some(format!("Task failed: {}", e)),
        })
}

#[tauri::command]
pub async fn write_exif(
    app: AppHandle,
    files: Vec<String>,
    patch: ExifWritePatch,
    options: ExifWriteOptions,
) -> Vec<ExifWriteResult> {
    let total = files.len().max(1);
    spawn_blocking(move || {
        let mut results = Vec::with_capacity(files.len());
        for (index, path) in files.iter().enumerate() {
            let _ = app.emit(
                "exif:progress",
                ((index * 100 / total) as u32, path.clone()),
            );
            let result = apply_patch_to_file(path, &patch, &options);
            results.push(result);
            let _ = app.emit("exif:progress", (100u32, path.clone()));
        }
        results
    })
    .await
    .unwrap_or_else(|e| {
        vec![ExifWriteResult {
            input: String::new(),
            output: None,
            error: Some(format!("Task failed: {}", e)),
        }]
    })
}

#[tauri::command]
pub async fn strip_exif(
    app: AppHandle,
    files: Vec<String>,
    mode: String,
    options: ExifWriteOptions,
) -> Vec<ExifWriteResult> {
    let total = files.len().max(1);
    spawn_blocking(move || {
        let mut results = Vec::with_capacity(files.len());
        for (index, path) in files.iter().enumerate() {
            let _ = app.emit(
                "exif:progress",
                ((index * 100 / total) as u32, path.clone()),
            );
            let result = strip_file(path, &mode, &options);
            results.push(result);
            let _ = app.emit("exif:progress", (100u32, path.clone()));
        }
        results
    })
    .await
    .unwrap_or_else(|e| {
        vec![ExifWriteResult {
            input: String::new(),
            output: None,
            error: Some(format!("Task failed: {}", e)),
        }]
    })
}
