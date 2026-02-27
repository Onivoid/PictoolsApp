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
