import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Tag, RefreshCw, CheckCircle2, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { APP_VERSION } from "@/constants";

type Lang = "en" | "fr";
type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "error";

const LANGS: { value: Lang; codeKey: "enCode" | "frCode"; labelKey: "en" | "fr" }[] = [
  { value: "en", codeKey: "enCode", labelKey: "en" },
  { value: "fr", codeKey: "frCode", labelKey: "fr" },
];

export default function Settings() {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language?.slice(0, 2) as Lang) ?? "en";
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    try {
      const update = await check();
      setUpdateStatus(update?.available ? "available" : "upToDate");
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
    <div className="flex flex-col h-full overflow-hidden page-enter">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-border/50 shrink-0">
        <SettingsIcon className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("settings.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("settings.subtitle")}</p>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4 max-w-lg overflow-y-auto">
        <section className="rounded-md border border-border/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-muted/20">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("settings.language.label")}
            </span>
          </div>
          {LANGS.map((lang, index) => {
            const active = currentLang === lang.value;
            return (
              <button
                key={lang.value}
                type="button"
                onClick={() => i18n.changeLanguage(lang.value)}
                className={`flex items-center w-full px-4 py-3.5 gap-3 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2
                  ${index < LANGS.length - 1 ? "border-b border-border/40" : ""}
                  ${active ? "bg-primary/8 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}
              >
                <span className="w-8 text-xs font-mono font-semibold tracking-wider">
                  {t(`settings.language.${lang.codeKey}`)}
                </span>
                <span className="text-sm font-medium flex-1 text-left">
                  {t(`settings.language.${lang.labelKey}`)}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${active ? "bg-primary" : "bg-transparent"}`}
                />
              </button>
            );
          })}
        </section>

        <section className="rounded-md border border-border/50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-muted/20">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("settings.version.label")}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 gap-3">
            <span className="text-sm text-muted-foreground font-mono">v{APP_VERSION}</span>
            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={updateStatus === "checking"}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring
                ${
                  updateStatus === "available"
                    ? "border-primary text-primary bg-primary/8"
                    : updateStatus === "upToDate"
                      ? "border-border text-muted-foreground"
                      : updateStatus === "error"
                        ? "border-destructive/50 text-destructive"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
            >
              {updateStatus === "checking" && <RefreshCw className="w-3 h-3 animate-spin" />}
              {updateStatus === "upToDate" && <CheckCircle2 className="w-3 h-3" />}
              {updateStatus === "available" && <AlertCircle className="w-3 h-3" />}
              {updateStatus === "idle" && <RefreshCw className="w-3 h-3" />}
              {updateLabel}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
