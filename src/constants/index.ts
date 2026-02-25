export const APP_NAME = "Tauri Boilerplate";
export const APP_VERSION = "0.1.0";

export const ROUTES = {
    HOME: "/",
    ABOUT: "/about",
    SETTINGS: "/settings",
    EXAMPLES: "/examples",
    UPDATE: "/update",
} as const;

export const STORAGE_KEYS = {
    THEME: "theme",
    LANGUAGE: "language",
} as const;
