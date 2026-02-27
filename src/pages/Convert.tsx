import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { StaggerContainer, StaggerItem } from "@/components/animated";

type TargetFormat = "png" | "jpeg" | "webp" | "ico" | "appicons";

interface FileEntry {
  id: string;
  path: string;
  name: string;
  status: "pending" | "converting" | "done" | "error";
  outputPath?: string;
  error?: string;
}

interface ConvertResult {
  input: string;
  output: string | null;
  error: string | null;
}

interface AppIconsResult {
  file: string;
  ok: boolean;
  error: string | null;
}

const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif", "ico"];

const FORMATS: { label: string; value: TargetFormat; special?: boolean }[] = [
  { label: "PNG", value: "png" },
  { label: "JPEG", value: "jpeg" },
  { label: "WEBP", value: "webp" },
  { label: "ICO", value: "ico" },
  { label: "App Icons", value: "appicons", special: true },
];

export default function Convert() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>("png");
  const [icoSizes, setIcoSizes] = useState<number[]>([...ICO_SIZES]);
  const [outputDir, setOutputDir] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [fileProgress, setFileProgress] = useState<{ pct: number; label: string } | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<number | [number, string]>("convert:progress", (event) => {
      const payload = event.payload;
      if (Array.isArray(payload)) {
        setFileProgress({ pct: payload[0], label: payload[1] });
      } else {
        setFileProgress((prev) => ({ pct: payload, label: prev?.label ?? "" }));
      }
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  const addFiles = useCallback((paths: string[]) => {
    const newEntries: FileEntry[] = paths
      .filter((p) => {
        const ext = p.split(".").pop()?.toLowerCase() ?? "";
        return ACCEPTED_EXTENSIONS.includes(ext);
      })
      .map((p) => ({
        id: crypto.randomUUID(),
        path: p,
        name: p.split(/[\\/]/).pop() ?? p,
        status: "pending",
      }));
    setFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path));
      return [...prev, ...newEntries.filter((e) => !existingPaths.has(e.path))];
    });
  }, []);

  const handleBrowse = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ACCEPTED_EXTENSIONS }],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      addFiles(paths);
    }
  };

  const handleSelectOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir && typeof dir === "string") setOutputDir(dir);
  };

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    win.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragging(false);
        const paths: string[] = (event.payload as any).paths ?? [];
        if (paths.length) addFiles(paths);
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      }
    }).then((fn) => { unlisten = fn; });

    return () => { if (unlisten) unlisten(); };
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleIcoSize = (size: number) => {
    setIcoSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size].sort((a, b) => a - b)
    );
  };

  const handleConvert = async () => {
    if (!files.length || !outputDir) return;
    setIsConverting(true);
    setFileProgress({ pct: 0, label: "" });
    setFiles((prev) => prev.map((f) => ({ ...f, status: "converting" as const })));

    try {
      if (targetFormat === "appicons") {
        const next: FileEntry[] = [];
        for (const f of files) {
          setFileProgress({ pct: 0, label: f.name });
          const iconResults: AppIconsResult[] = await invoke("generate_app_icons", {
            input: f.path,
            outputDir,
          });
          for (const r of iconResults) {
            next.push({
              id: crypto.randomUUID(),
              path: f.path,
              name: r.file,
              status: r.ok ? "done" : "error",
              error: r.error ?? undefined,
            });
          }
        }
        setFiles(next);
      } else {
        const next: FileEntry[] = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setFileProgress({ pct: 0, label: f.name });
          const results: ConvertResult[] = await invoke("convert_images", {
            files: [f.path],
            targetFormat,
            icoSizes: targetFormat === "ico" ? icoSizes : null,
            outputDir,
          });
          if (results.length === 0) {
            next.push({ ...f, status: "error", error: t("convert.status.noResult") });
          } else if (results.length === 1) {
            const r = results[0];
            next.push(r.error
              ? { ...f, status: "error", error: r.error }
              : { ...f, status: "done", outputPath: r.output ?? undefined }
            );
          } else {
            for (const r of results) {
              const outputName = r.output?.split(/[\\/]/).pop() ?? "";
              next.push(r.error
                ? { ...f, id: crypto.randomUUID(), name: outputName || f.name, status: "error", error: r.error }
                : { ...f, id: crypto.randomUUID(), name: outputName, status: "done", outputPath: r.output ?? undefined }
              );
            }
          }
          setFiles([...next, ...files.slice(i + 1).map((ff) => ({ ...ff, status: "converting" as const }))]);
        }
      }
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: "error" as const, error: String(err) }))
      );
    } finally {
      setIsConverting(false);
      setFileProgress(null);
    }
  };

  const handleOpenOutputDir = async () => {
    if (outputDir) await openPath(outputDir);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const canConvert = files.length > 0 && outputDir && !isConverting && pendingCount + files.filter(f => f.status === "converting").length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("convert.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("convert.subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — settings */}
        <div className="w-64 border-r border-border flex flex-col gap-5 p-5 shrink-0 overflow-y-auto">
          {/* Format selector */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("convert.outputFormat")}</span>
            <div className="grid grid-cols-2 gap-1.5">
              {FORMATS.filter((f) => !f.special).map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTargetFormat(f.value)}
                  className={`py-1.5 rounded-lg text-sm font-medium transition-colors ${targetFormat === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* App Icons — special full-width option */}
            <button
              onClick={() => setTargetFormat("appicons")}
              className={`w-full flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border ${targetFormat === "appicons"
                ? "bg-primary/10 border-primary text-primary"
                : "bg-muted border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
            >
              <span className="font-semibold">{t("appIcons.format")}</span>
              <span className="text-xs font-normal leading-snug opacity-80">{t("appIcons.description")}</span>
            </button>
          </div>

          {/* ICO sizes */}
          {targetFormat === "ico" && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("convert.icoSizes")}</span>
              <div className="flex flex-col gap-1">
                {ICO_SIZES.map((size) => (
                  <label
                    key={size}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={icoSizes.includes(size)}
                      onChange={() => toggleIcoSize(size)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <span className="text-sm text-foreground">{size}×{size}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Output directory */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("convert.outputFolder")}</span>
            <button
              onClick={handleSelectOutputDir}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted hover:bg-accent transition-colors text-sm text-left"
            >
              <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
              <span className="truncate text-muted-foreground">
                {outputDir ? outputDir.split(/[\\/]/).pop() : t("convert.chooseFolder")}
              </span>
            </button>
            {outputDir && (
              <p className="text-xs text-muted-foreground truncate" title={outputDir}>{outputDir}</p>
            )}
          </div>

          {/* Convert button */}
          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={handleConvert}
              disabled={!canConvert}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isConverting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {targetFormat === "appicons" ? t("appIcons.invoking") : t("convert.converting")}</>
              ) : (
                targetFormat === "appicons" ? t("appIcons.invoke") : t("convert.convert")
              )}
            </button>
            {doneCount > 0 && outputDir && (
              <button
                onClick={handleOpenOutputDir}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <FolderOpen className="w-4 h-4" /> {t("convert.openFolder")}
              </button>
            )}
          </div>
        </div>

        {/* Right panel — file list + drop zone */}
        <div className="flex flex-1 flex-col gap-4 p-5 overflow-hidden">
          {/* Status bar */}
          {files.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
              <span>{files.length} {files.length !== 1 ? t("convert.status.files") : t("convert.status.file")}</span>
              {doneCount > 0 && <span className="text-secondary-foreground">✓ {doneCount} {t("convert.status.done")}</span>}
              {errorCount > 0 && <span className="text-destructive">✕ {errorCount} {errorCount !== 1 ? t("convert.status.errors") : t("convert.status.error")}</span>}
              <button
                onClick={() => setFiles([])}
                className="ml-auto hover:text-foreground transition-colors"
              >
                {t("convert.clearAll")}
              </button>
            </div>
          )}

          {/* Progress bar */}
          {isConverting && fileProgress !== null && (
            <div className="flex flex-col gap-1.5 shrink-0">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                  <span className="truncate">{fileProgress.label || (targetFormat === "appicons" ? t("appIcons.invoking") : t("convert.converting"))}</span>
                </span>
                <span className="tabular-nums shrink-0 ml-2">{fileProgress.pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${fileProgress.pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Drop zone */}
          <motion.div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl transition-colors cursor-pointer shrink-0 py-8 ${isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
              }`}
            onClick={handleBrowse}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            animate={isDragging ? { scale: 1.02 } : { scale: 1 }}
          >
            <motion.div
              className={`p-3 rounded-xl ${isDragging ? "bg-primary/10" : "bg-muted"}`}
              animate={isDragging ? { y: [0, -5, 0] } : {}}
              transition={{ duration: 0.5, repeat: isDragging ? Infinity : 0 }}
            >
              <Upload className={`w-6 h-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            </motion.div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {isDragging ? t("convert.dropzone.dragging") : t("convert.dropzone.idle")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("convert.dropzone.hint")}</p>
            </div>
          </motion.div>

          {/* File list */}
          {files.length > 0 && (
            <StaggerContainer className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-0">
              <AnimatePresence mode="popLayout">
                {files.map((file) => (
                  <StaggerItem key={file.id}>
                    <motion.div
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border group"
                      whileHover={{ scale: 1.01, borderColor: "hsl(var(--primary) / 0.3)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                        {file.error && (
                          <p className="text-xs text-destructive truncate mt-0.5">{file.error}</p>
                        )}
                        {file.outputPath && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{file.outputPath.split(/[\\/]/).pop()}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {file.status === "pending" && (
                          <span className="text-xs text-muted-foreground">{t("convert.status.pending")}</span>
                        )}
                        {file.status === "converting" && (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        )}
                        {file.status === "done" && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 25 }}
                          >
                            <CheckCircle2 className="w-4 h-4 text-secondary" />
                          </motion.div>
                        )}
                        {file.status === "error" && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 25 }}
                          >
                            <AlertCircle className="w-4 h-4 text-destructive" />
                          </motion.div>
                        )}
                        {!isConverting && (
                          <motion.button
                            onClick={() => removeFile(file.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  </StaggerItem>
                ))}
              </AnimatePresence>
            </StaggerContainer>
          )}
        </div>
      </div>
    </div>
  );
}
