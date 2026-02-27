import { useEffect, useState } from "react";
import { useUpdater } from "@/composables";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Loader2 } from "lucide-react";

export function UpdateNotification() {
  const { update, isDownloading, downloadProgress, downloadAndInstall } = useUpdater();
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (update) {
      setIsVisible(true);
    }
  }, [update]);

  if (!update) return null;

  const handleInstall = () => {
    downloadAndInstall();
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-4 right-4 z-50 w-80"
        >
          <div className="bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {t("updater.available.title", "Update Available")}
                </span>
              </div>
              {!isDownloading && (
                <button
                  onClick={handleDismiss}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground mb-3">
                {t("updater.available.body", { version: update.version })}
              </p>

              {isDownloading && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{t("updater.downloading.progress", "Downloading...")}</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <motion.button
                  onClick={handleInstall}
                  disabled={isDownloading}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={!isDownloading ? { scale: 1.02 } : {}}
                  whileTap={!isDownloading ? { scale: 0.98 } : {}}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("updater.downloading.title", "Downloading...")}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      {t("updater.install", "Install Now")}
                    </>
                  )}
                </motion.button>
                {!isDownloading && (
                  <motion.button
                    onClick={handleDismiss}
                    className="px-3 py-2 border border-border rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {t("updater.later", "Later")}
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
