import { useState, useRef, useCallback, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FolderOpen, Sparkles, Lock, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";

type OutputFormat = "png" | "jpeg" | "webp" | "original";
type PresetType = "web" | "mobile" | "thumbnail" | "social" | "print" | "custom";
type OutputNaming = "suffix" | "replace";

interface OptimizeFileEntry {
  id: string;
  path: string;
  name: string;
  status: "pending" | "optimizing" | "done" | "error";
  originalSize: number;
  originalDimensions: { width: number; height: number };
  optimizedSize?: number;
  optimizedDimensions?: { width: number; height: number };
  reduction?: number;
  outputPath?: string;
  error?: string;
}

interface OptimizeResult {
  input: string;
  output: string | null;
  original_size: number;
  optimized_size: number;
  original_dimensions: [number, number];
  optimized_dimensions: [number, number];
  reduction_percent: number;
  error: string | null;
}

interface ImageMetadata {
  width: number;
  height: number;
  size: number;
  format: string;
}

const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif"];

const PRESETS = {
  web: { maxSize: 1920, quality: 85, format: "original" as OutputFormat },
  mobile: { maxSize: 750, quality: 80, format: "jpeg" as OutputFormat },
  thumbnail: { maxSize: 300, quality: 75, format: "jpeg" as OutputFormat },
  social: { maxSize: 1200, quality: 90, format: "jpeg" as OutputFormat },
  print: { maxSize: null, quality: 95, format: "png" as OutputFormat },
  custom: { maxSize: null, quality: 85, format: "original" as OutputFormat },
};

export default function Optimize() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<OptimizeFileEntry[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<PresetType>("web");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("original");
  const [quality, setQuality] = useState(85);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [targetWidth, setTargetWidth] = useState<number | null>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [outputNaming, setOutputNaming] = useState<OutputNaming>("suffix");
  const [customSuffix, setCustomSuffix] = useState("_optimized");
  const [outputDir, setOutputDir] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<[number, string]>("optimize:progress", (event) => {
      const [pct, filePath] = event.payload;
      setFiles((prev) =>
        prev.map((f) =>
          f.path === filePath ? { ...f, status: pct === 100 ? "done" : "optimizing" } : f
        )
      );
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const applyPreset = useCallback((preset: PresetType) => {
    setSelectedPreset(preset);
    const config = PRESETS[preset];
    setQuality(config.quality);
    setOutputFormat(config.format);

    if (config.maxSize && files.length > 0) {
      setResizeEnabled(true);
      const firstFile = files[0];
      const ratio = firstFile.originalDimensions.width / firstFile.originalDimensions.height;
      if (firstFile.originalDimensions.width > config.maxSize) {
        setTargetWidth(config.maxSize);
        setTargetHeight(Math.round(config.maxSize / ratio));
      }
    } else {
      setResizeEnabled(false);
      setTargetWidth(null);
      setTargetHeight(null);
    }
  }, [files]);

  const addFiles = useCallback(async (paths: string[]) => {
    const validPaths = paths.filter((p) => {
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      return ACCEPTED_EXTENSIONS.includes(ext);
    });

    const newEntries: OptimizeFileEntry[] = [];
    for (const path of validPaths) {
      try {
        const metadata: ImageMetadata = await invoke("get_image_metadata", { filePath: path });
        newEntries.push({
          id: crypto.randomUUID(),
          path,
          name: path.split(/[\\/]/).pop() ?? path,
          status: "pending",
          originalSize: metadata.size,
          originalDimensions: { width: metadata.width, height: metadata.height },
        });
      } catch (error) {
        console.error("Error getting metadata:", error);
      }
    }

    if (newEntries.length > 0) {
      setFiles((prev) => {
        const existingPaths = new Set(prev.map((f) => f.path));
        const filtered = newEntries.filter((e) => !existingPaths.has(e.path));
        console.log("Adding files:", filtered.length, "new files");
        console.log("Total files after:", prev.length + filtered.length);
        return [...prev, ...filtered];
      });
    }
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
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
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

  const handleOptimize = async () => {
    if (!files.length || !outputDir) return;
    setIsOptimizing(true);

    try {
      const results: OptimizeResult[] = await invoke("optimize_images", {
        files: files.map((f) => f.path),
        options: {
          output_format: outputFormat,
          quality,
          resize_width: resizeEnabled ? targetWidth : null,
          resize_height: resizeEnabled ? targetHeight : null,
          output_naming: outputNaming,
          custom_suffix: customSuffix,
        },
        outputDir,
      });

      setFiles((prev) =>
        prev.map((f) => {
          const result = results.find((r) => r.input === f.path);
          if (!result) return f;

          return {
            ...f,
            status: result.error ? "error" : "done",
            optimizedSize: result.optimized_size,
            optimizedDimensions: {
              width: result.optimized_dimensions[0],
              height: result.optimized_dimensions[1],
            },
            reduction: result.reduction_percent,
            outputPath: result.output ?? undefined,
            error: result.error ?? undefined,
          };
        })
      );
    } catch (error) {
      console.error("Optimization error:", error);
      setFiles((prev) => prev.map((f) => ({ ...f, status: "error", error: String(error) })));
    } finally {
      setIsOptimizing(false);
    }
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const canOptimize = files.length > 0 && outputDir && !isOptimizing && pendingCount > 0;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <Sparkles className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("optimize.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("optimize.subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — settings */}
        <div className="w-80 border-r border-border flex flex-col gap-5 p-5 shrink-0 overflow-y-auto">
          {/* Presets */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("optimize.presets.label")}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(["web", "mobile", "thumbnail", "social", "print"] as PresetType[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPreset === preset
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                >
                  {t(`optimize.presets.${preset}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Section */}
          <div className="flex flex-col gap-3 p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("optimize.presets.custom")}
              </span>
              <button
                onClick={() => setSelectedPreset("custom")}
                className={`px-2 py-1 text-xs rounded ${selectedPreset === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
              >
                {selectedPreset === "custom" ? "Active" : "Activer"}
              </button>
            </div>

            {/* Format Selector */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-foreground">{t("optimize.format.label")}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(["original", "png", "jpeg", "webp"] as OutputFormat[]).map((format) => (
                  <button
                    key={format}
                    onClick={() => setOutputFormat(format)}
                    disabled={selectedPreset !== "custom"}
                    className={`py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${outputFormat === format
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                  >
                    {t(`optimize.format.${format}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Slider */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{t("optimize.quality.label")}</span>
                <span className="text-xs font-mono text-muted-foreground">{quality}</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                disabled={selectedPreset !== "custom"}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer disabled:opacity-50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{t("optimize.quality.low")}</span>
                <span>{t("optimize.quality.high")}</span>
              </div>
            </div>

            {/* Resize Toggle */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{t("optimize.resize.label")}</span>
                <button
                  onClick={() => setResizeEnabled(!resizeEnabled)}
                  disabled={selectedPreset !== "custom"}
                  className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${resizeEnabled ? "bg-primary" : "bg-muted"
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${resizeEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                  />
                </button>
              </div>

              {resizeEnabled && (
                <div className="flex flex-col gap-2 pl-2 border-l-2 border-primary/30">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="W"
                      value={targetWidth ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setTargetWidth(val);
                        if (lockRatio && val && files.length > 0) {
                          const ratio = files[0].originalDimensions.width / files[0].originalDimensions.height;
                          setTargetHeight(Math.round(val / ratio));
                        }
                      }}
                      disabled={selectedPreset !== "custom"}
                      className="w-16 px-1.5 py-1 text-xs rounded border border-border bg-background disabled:opacity-50"
                    />
                    <button
                      onClick={() => setLockRatio(!lockRatio)}
                      disabled={selectedPreset !== "custom"}
                      className="p-1 hover:bg-muted rounded disabled:opacity-50 shrink-0"
                      title={lockRatio ? "Déverrouiller le ratio" : "Verrouiller le ratio"}
                    >
                      {lockRatio ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    <input
                      type="number"
                      placeholder="H"
                      value={targetHeight ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        setTargetHeight(val);
                        if (lockRatio && val && files.length > 0) {
                          const ratio = files[0].originalDimensions.width / files[0].originalDimensions.height;
                          setTargetWidth(Math.round(val * ratio));
                        }
                      }}
                      disabled={selectedPreset !== "custom"}
                      className="w-16 px-1.5 py-1 text-xs rounded border border-border bg-background disabled:opacity-50"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Output Naming */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-foreground">{t("optimize.output.naming")}</span>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="naming"
                    checked={outputNaming === "suffix"}
                    onChange={() => setOutputNaming("suffix")}
                    disabled={selectedPreset !== "custom"}
                    className="disabled:opacity-50"
                  />
                  <span>{t("optimize.output.suffix")}</span>
                </label>
                {outputNaming === "suffix" && (
                  <input
                    type="text"
                    value={customSuffix}
                    onChange={(e) => setCustomSuffix(e.target.value)}
                    disabled={selectedPreset !== "custom"}
                    placeholder="_optimized"
                    className="ml-5 px-2 py-1 text-xs rounded border border-border bg-background disabled:opacity-50"
                  />
                )}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="naming"
                    checked={outputNaming === "replace"}
                    onChange={() => setOutputNaming("replace")}
                    disabled={selectedPreset !== "custom"}
                    className="disabled:opacity-50"
                  />
                  <span>{t("optimize.output.replace")}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Output folder */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("optimize.output.folder")}
            </span>
            <button
              onClick={handleSelectOutputDir}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              <span className="truncate flex-1 text-left">
                {outputDir || t("convert.chooseFolder")}
              </span>
            </button>
          </div>

          {/* Optimize button */}
          <button
            onClick={handleOptimize}
            disabled={!canOptimize}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("optimize.optimizing")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t("optimize.optimize")}
              </>
            )}
          </button>

          {files.length > 0 && (
            <div className="text-xs text-muted-foreground text-center">
              {files.length} {t("optimize.stats.filesSelected")}
            </div>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {files.length === 0 ? (
            <div
              ref={dropRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowse}
              className={`flex-1 flex flex-col items-center justify-center gap-4 m-6 border-2 border-dashed rounded-lg cursor-pointer transition-all ${isDragging
                ? "border-primary bg-primary/5 scale-[0.98]"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
            >
              <motion.div
                animate={isDragging ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Upload className="w-12 h-12 text-muted-foreground" />
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? t("convert.dropzone.dragging") : t("convert.dropzone.idle")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("convert.dropzone.hint")}</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              {/* Add more images button */}
              <div className="mb-4">
                <button
                  onClick={handleBrowse}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t("convert.dropzone.idle")}</span>
                </button>
              </div>

              <AnimatePresence mode="popLayout">
                {files.map((file) => (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg mb-3"
                  >
                    {/* Thumbnail */}
                    <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center">
                      <img
                        src={convertFileSrc(file.path)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {file.name}
                        </span>
                        {file.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                        {file.status === "error" && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
                        {file.status === "optimizing" && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">{t("optimize.stats.original")}:</span>{" "}
                          {file.originalDimensions.width}×{file.originalDimensions.height} •{" "}
                          {formatBytes(file.originalSize)}
                        </div>
                        {file.optimizedSize && file.optimizedDimensions && (
                          <div>
                            <span className="font-medium">{t("optimize.stats.optimized")}:</span>{" "}
                            {file.optimizedDimensions.width}×{file.optimizedDimensions.height} •{" "}
                            {formatBytes(file.optimizedSize)}
                          </div>
                        )}
                      </div>
                      {file.reduction !== undefined && (
                        <div className="mt-2">
                          <span className={`text-xs font-medium ${file.reduction > 50 ? "text-green-500" : file.reduction > 20 ? "text-orange-500" : "text-muted-foreground"}`}>
                            {t("optimize.stats.reduction")}: {file.reduction.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {file.error && (
                        <div className="mt-2 text-xs text-destructive">{file.error}</div>
                      )}
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
