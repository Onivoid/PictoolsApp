export const APP_NAME = "PictoolsApp";
export const APP_VERSION = __APP_VERSION__;

export const ROUTES = {
    HOME: "/",
    CONVERT: "/convert",
    OPTIMIZE: "/optimize",
    SETTINGS: "/settings",
} as const;

export const STORAGE_KEYS = {
    THEME: "theme",
    LANGUAGE: "language",
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
