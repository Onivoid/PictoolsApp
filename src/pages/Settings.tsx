import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Tag, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { APP_VERSION } from "@/constants";
import { motion } from "framer-motion";
import { FadeIn } from "@/components/animated";

type Lang = "en" | "fr";
type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "error";

const LANGS: { value: Lang; flag: string; label: string; sub: string }[] = [
  { value: "en", flag: "🇬🇧", label: "English", sub: "English" },
  { value: "fr", flag: "🇫🇷", label: "Français", sub: "French" },
];

export default function Settings() {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language?.slice(0, 2) as Lang) ?? "en";
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    try {
      const update = await check();
      if (update?.available) {
        setUpdateStatus("available");
      } else {
        setUpdateStatus("upToDate");
      }
    } catch {
      setUpdateStatus("error");
    }
  };

  const updateLabel = {
    idle: t("settings.version.checkUpdate"),
    checking: t("settings.version.checking"),
    upToDate: t("settings.version.upToDate"),
    available: t("settings.version.updateAvailable"),
    error: t("settings.version.noUpdater"),
  }[updateStatus];

  return (
    <div className="flex flex-col h-full overflow-y-auto page-enter">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border/50">
        <h1 className="text-xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("settings.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-3 p-4 max-w-lg">
        {/* Language */}
        <FadeIn delay={0.1}>
          <motion.div
            className="rounded-md border border-border/50 overflow-hidden"
            whileHover={{ borderColor: "hsl(var(--primary) / 0.3)" }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-muted/20">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t("settings.language.label")}
              </span>
            </div>
            {LANGS.map((lang, i) => {
              const active = currentLang === lang.value;
              return (
                <motion.button
                  key={lang.value}
                  onClick={() => i18n.changeLanguage(lang.value)}
                  className={`flex items-center w-full px-4 py-3.5 gap-3 transition-colors duration-150
                    ${i < LANGS.length - 1 ? "border-b border-border/40" : ""}
                    ${active ? "bg-primary/8 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-base leading-none">{lang.flag}</span>
                  <div className="flex flex-col items-start gap-0.5 flex-1">
                    <span className="text-sm font-medium leading-none">{lang.label}</span>
                    <span className="text-xs text-muted-foreground leading-none">{lang.sub}</span>
                  </div>
                  <motion.span
                    className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${active ? "bg-primary" : "bg-transparent"}`}
                    animate={active ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  />
                </motion.button>
              );
            })}
          </motion.div>
        </FadeIn>

        {/* Version */}
        <FadeIn delay={0.2}>
          <motion.div
            className="rounded-md border border-border/50 overflow-hidden"
            whileHover={{ borderColor: "hsl(var(--primary) / 0.3)" }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-muted/20">
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t("settings.version.label")}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 gap-3">
              <span className="text-sm text-muted-foreground font-mono">v{APP_VERSION}</span>
              <motion.button
                onClick={handleCheckUpdate}
                disabled={updateStatus === "checking"}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-all duration-150
                  ${updateStatus === "available"
                    ? "border-primary text-primary bg-primary/8"
                    : updateStatus === "upToDate"
                      ? "border-border text-muted-foreground"
                      : updateStatus === "error"
                        ? "border-destructive/50 text-destructive"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  } disabled:opacity-50`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {updateStatus === "checking" && <RefreshCw className="w-3 h-3 animate-spin" />}
                {updateStatus === "upToDate" && <CheckCircle2 className="w-3 h-3" />}
                {updateStatus === "available" && <AlertCircle className="w-3 h-3" />}
                {updateStatus === "idle" && <RefreshCw className="w-3 h-3" />}
                {updateLabel}
              </motion.button>
            </div>
          </motion.div>
        </FadeIn>
      </div>
    </div>
  );
}
