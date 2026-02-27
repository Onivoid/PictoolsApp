import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useNotification } from "./useNotification";
import { useTranslation } from "react-i18next";

export function useUpdater() {
    const [update, setUpdate] = useState<Update | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const { notify } = useNotification();
    const { t } = useTranslation();

    useEffect(() => {
        checkForUpdates();
    }, []);

    const checkForUpdates = async () => {
        try {
            console.log("[Updater] Checking for updates...");
            const updateInfo = await check();

            if (updateInfo?.available) {
                console.log("[Updater] Update available:", updateInfo.version);
                setUpdate(updateInfo);

                // Notify user
                await notify(
                    t("updater.available.title", "Update Available"),
                    t(
                        "updater.available.body",
                        `Version ${updateInfo.version} is available. Click to install.`,
                    ),
                );
            } else {
                console.log("[Updater] No updates available");
            }
        } catch (error) {
            console.error("[Updater] Error checking for updates:", error);
        }
    };

    const downloadAndInstall = async () => {
        if (!update) return;

        try {
            setIsDownloading(true);
            console.log("[Updater] Downloading update...");

            await notify(
                t("updater.downloading.title", "Downloading Update"),
                t("updater.downloading.body", "Please wait..."),
            );

            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case "Started":
                        console.log("[Updater] Download started");
                        setDownloadProgress(0);
                        break;
                    case "Progress":
                        console.log(
                            `[Updater] Download progress: ${event.data.chunkLength} bytes`,
                        );
                        setDownloadProgress(50); // Indeterminate progress
                        break;
                    case "Finished":
                        console.log("[Updater] Download finished");
                        setDownloadProgress(100);
                        break;
                }
            });

            console.log("[Updater] Update installed, relaunching...");
            await notify(
                t("updater.installed.title", "Update Installed"),
                t("updater.installed.body", "Restarting application..."),
            );

            // Relaunch the app
            await relaunch();
        } catch (error) {
            console.error(
                "[Updater] Error downloading/installing update:",
                error,
            );
            await notify(
                t("updater.error.title", "Update Failed"),
                t(
                    "updater.error.body",
                    "Failed to install update. Please try again.",
                ),
            );
            setIsDownloading(false);
        }
    };

    return {
        update,
        isDownloading,
        downloadProgress,
        checkForUpdates,
        downloadAndInstall,
    };
}
