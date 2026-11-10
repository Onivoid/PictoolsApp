export const APP_NAME = "PictoolsApp";
export const APP_VERSION = __APP_VERSION__;

export const ROUTES = {
    HOME: "/",
    CONVERT: "/convert",
    OPTIMIZE: "/optimize",
    VIDEO: "/video",
    EXIF: "/exif",
    SETTINGS: "/settings",
} as const;

export const STORAGE_KEYS = {
    THEME: "theme",
    LANGUAGE: "language",
    EXIF_RIGHTS_TEMPLATE: "exif-rights-template",
} as const;

/** Common raster formats accepted by Convert / Optimize dropzones. */
export const ACCEPTED_IMAGE_EXTENSIONS = [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "bmp",
    "gif",
    "tiff",
    "tif",
] as const;

/** Convert also accepts ICO sources. */
export const ACCEPTED_CONVERT_EXTENSIONS = [
    ...ACCEPTED_IMAGE_EXTENSIONS,
    "ico",
] as const;

/** Common video containers accepted by the Video tool. */
export const ACCEPTED_VIDEO_EXTENSIONS = [
    "mp4",
    "mov",
    "mkv",
    "webm",
    "avi",
    "m4v",
    "mpeg",
    "mpg",
] as const;

/** Formats with Exif read/write support via little_exif. */
export const ACCEPTED_EXIF_EXTENSIONS = [
    "jpg",
    "jpeg",
    "png",
    "tif",
    "tiff",
    "webp",
] as const;
