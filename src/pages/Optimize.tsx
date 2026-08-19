import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Loader2, Lock, Sparkles, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BeforeAfterCompare,
  FileDropzone,
  FileQueue,
  ToolDock,
  ToolWorkbench,
  type QueueFile,
} from "@/components/workbench";
import { loadImageEntries, useImageDrop, type Orientation } from "@/composables";
import { formatBytes } from "@/utils/format";

type OutputFormat = "png" | "jpeg" | "webp" | "original";
type OutputNaming = "suffix" | "replace";

interface OptimizeFile extends QueueFile {
  originalDimensions: { width: number; height: number };
  format: string;
  orientation: Orientation;
  webWidth: number;
  webHeight: number;
  outputPath?: string;
}

interface OptimizeResult {
  input: string;
  output: string | null;
  originalSize: number;
  optimizedSize: number;
  error: string | null;
}

const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tif"];

const WEB_CEILING_KIB: Record<Orientation, number> = {
  landscape: 300,
  portrait: 220,
  square: 200,
};

const CHIP =
  "py-1.5 px-2.5 rounded-md text-xs font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring";
const CHIP_ON = "bg-primary text-primary-foreground";
const CHIP_OFF = "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border/60";

function parentFolder(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, "") || path;
}

function formatName(format: OutputFormat): string {
  if (format === "original") return "original";
  if (format === "jpeg") return "JPEG";
  if (format === "png") return "PNG";
  return "WebP";
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function Optimize() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<OptimizeFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("webp");
  const [keepPercent, setKeepPercent] = useState(80);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [targetWidth, setTargetWidth] = useState<number | null>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [outputNaming, setOutputNaming] = useState<OutputNaming>("suffix");
  const [customSuffix, setCustomSuffix] = useState("_web");
  const [outputDir, setOutputDir] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectCount, setDetectCount] = useState(0);

  const selectedFile = files.find((file) => file.id === selectedId) ?? files[0] ?? null;
  const useWebProfile = !resizeEnabled;

  const addPaths = useCallback(async (paths: string[]) => {
    let toAdd: string[] = [];
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.path));
      toAdd = paths.filter((path) => !existing.has(path));
      if (toAdd.length === 0) return prev;
      const placeholders: OptimizeFile[] = toAdd.map((path) => ({
        id: crypto.randomUUID(),
        path,
        name: fileNameFromPath(path),
        status: "pending",
        originalSize: 0,
        originalDimensions: { width: 0, height: 0 },
        format: "",
        orientation: "landscape",
        webWidth: 0,
        webHeight: 0,
      }));
      return [...prev, ...placeholders];
    });
    if (toAdd.length === 0) return;

    setIsDetecting(true);
    setDetectCount(toAdd.length);
    try {
      const entries = await loadImageEntries(toAdd);
      const byPath = new Map(entries.map((entry) => [entry.path, entry]));
      setFiles((prev) =>
        prev.flatMap((file) => {
          if (!toAdd.includes(file.path)) return [file];
          const entry = byPath.get(file.path);
          if (!entry) return [];
          return [
            {
              ...file,
              originalSize: entry.size,
              originalDimensions: { width: entry.width, height: entry.height },
              format: entry.format,
              orientation: entry.orientation,
              webWidth: entry.webWidth,
              webHeight: entry.webHeight,
            },
          ];
        })
      );
    } finally {
      setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId && files.length > 0) {
      setSelectedId(files[0].id);
    }
  }, [files, selectedId]);

  const { isDragging, dropRef, handleBrowse, handleDragOver, handleDragLeave, handleDrop } =
    useImageDrop(ACCEPTED_EXTENSIONS, addPaths);

  const handleSelectOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir && typeof dir === "string") setOutputDir(dir);
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<[number, string]>("optimize:progress", (event) => {
      const [, filePath] = event.payload;
      setFiles((prev) =>
        prev.map((file) =>
          file.path === filePath ? { ...file, status: "processing" } : file
        )
      );
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const options = useMemo(
    () => ({
      outputFormat,
      keepPercent,
      maxSide: null,
      resizeWidth: resizeEnabled ? targetWidth : null,
      resizeHeight: resizeEnabled ? targetHeight : null,
      lockRatio,
      outputNaming,
      customSuffix,
      profile: useWebProfile ? "web" : null,
    }),
    [
      outputFormat,
      keepPercent,
      resizeEnabled,
      targetWidth,
      targetHeight,
      lockRatio,
      outputNaming,
      customSuffix,
      useWebProfile,
    ]
  );

  const handleOptimize = async () => {
    if (!files.length || isDetecting) return;
    setIsOptimizing(true);
    setFiles((prev) => prev.map((file) => ({ ...file, status: "processing" as const })));

    try {
      const results = await invoke<OptimizeResult[]>("optimize_images", {
        files: files.map((file) => file.path),
        options,
        outputDir,
      });

      setFiles((prev) =>
        prev.map((file) => {
          const result = results.find((item) => item.input === file.path);
          if (!result) return { ...file, status: "error" as const, error: t("convert.status.noResult") };
          return {
            ...file,
            status: result.error ? "error" : "done",
            originalSize: result.originalSize,
            outputSize: result.optimizedSize,
            outputPath: result.output ?? undefined,
            error: result.error ?? undefined,
          };
        })
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((file) => ({ ...file, status: "error" as const, error: String(error) }))
      );
    } finally {
      setIsOptimizing(false);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const landscapeCount = files.filter((file) => file.orientation === "landscape" && file.webWidth > 0).length;
  const portraitCount = files.filter((file) => file.orientation === "portrait").length;
  const squareCount = files.filter((file) => file.orientation === "square").length;
  const uniqueFolders = new Set(files.map((file) => parentFolder(file.path)));
  const canOptimize = files.length > 0 && !isOptimizing && !isDetecting;
  const selectedIsPng =
    outputFormat === "png" ||
    (outputFormat === "original" && selectedFile?.format.toLowerCase() === "png");
  const beforeSrc = selectedFile ? convertFileSrc(selectedFile.path) : null;
  const afterSrc =
    selectedFile?.status === "done" && selectedFile.outputPath
      ? convertFileSrc(selectedFile.outputPath)
      : null;
  const cutPercent = 100 - keepPercent;
  const hasDone = files.some((file) => file.status === "done");
  const hasError = files.some((file) => file.status === "error") && !isOptimizing;

  const ceilingLabel = (() => {
    const kinds = [
      landscapeCount > 0 ? "landscape" : null,
      portraitCount > 0 ? "portrait" : null,
      squareCount > 0 ? "square" : null,
    ].filter(Boolean) as Orientation[];
    if (kinds.length === 1) {
      return t("optimize.plan.ceiling", { kib: WEB_CEILING_KIB[kinds[0]] });
    }
    return t("optimize.plan.ceilingMixed");
  })();

  const sizeLabel = selectedFile
    ? selectedFile.outputSize != null
      ? `${formatBytes(selectedFile.originalSize ?? 0)} → ${formatBytes(selectedFile.outputSize)}`
      : selectedFile.originalSize
        ? `${formatBytes(selectedFile.originalSize)} → ${t("optimize.plan.cap", {
            kib: WEB_CEILING_KIB[selectedFile.orientation],
          })}`
        : null
    : null;

  const queueFiles = files.map((file) => {
    const ready = file.webWidth > 0;
    const sameSize =
      ready &&
      file.originalDimensions.width === file.webWidth &&
      file.originalDimensions.height === file.webHeight;
    const dims = !ready
      ? "…"
      : sameSize
        ? t("optimize.plan.alreadyWeb")
        : `${file.webWidth}×${file.webHeight}`;
    const ceiling = ready ? t("optimize.plan.cap", { kib: WEB_CEILING_KIB[file.orientation] }) : "";
    return {
      ...file,
      detail: ceiling ? `${dims} · ${ceiling}` : dims,
    };
  });

  const destination = outputDir
    ? outputDir.split(/[\\/]/).pop()
    : uniqueFolders.size > 1
      ? t("optimize.plan.besideMixed")
      : t("optimize.plan.besideFiles");

  const empty = files.length === 0;

  return (
    <ToolWorkbench
      icon={<Sparkles className="w-5 h-5" />}
      title={t("optimize.title")}
      subtitle={t("optimize.subtitle")}
      isDragging={isDragging}
      draggingLabel={t("optimize.dropzone.dragging")}
      busy={isDetecting}
      busyLabel={t("optimize.dropzone.reading", { count: detectCount })}
      dropRef={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      stage={
        empty ? (
          <FileDropzone
            isDragging={isDragging}
            idleLabel={t("optimize.dropzone.idle")}
            draggingLabel={t("optimize.dropzone.dragging")}
            hint={t("optimize.dropzone.hint")}
            onBrowse={handleBrowse}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ) : (
          <BeforeAfterCompare
            key={selectedFile?.id ?? "none"}
            beforeSrc={beforeSrc}
            afterSrc={afterSrc}
            beforeLabel={t("optimize.preview.before")}
            afterLabel={t("optimize.preview.after")}
            compareHint={t("optimize.preview.compare")}
            sizeLabel={sizeLabel}
          />
        )
      }
      dock={
        empty ? undefined : (
          <ToolDock
            summary={
              <div className="min-w-0">
                <p className="text-sm text-foreground leading-snug">
                  {t(files.length === 1 ? "optimize.plan.photo" : "optimize.plan.photos", {
                    count: files.length,
                  })}
                  {landscapeCount > 0
                    ? ` · ${t(
                        landscapeCount === 1 ? "optimize.plan.landscape" : "optimize.plan.landscapes",
                        { count: landscapeCount }
                      )}`
                    : ""}
                  {portraitCount > 0
                    ? ` · ${t(
                        portraitCount === 1 ? "optimize.plan.portrait" : "optimize.plan.portraits",
                        { count: portraitCount }
                      )}`
                    : ""}
                  {squareCount > 0
                    ? ` · ${t(squareCount === 1 ? "optimize.plan.square" : "optimize.plan.squares", {
                        count: squareCount,
                      })}`
                    : ""}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {formatName(outputFormat)} · {useWebProfile ? ceilingLabel : t("optimize.plan.custom")} ·{" "}
                  {t("optimize.plan.suffix")} · {destination}
                </p>
                <button
                  type="button"
                  onClick={outputDir ? () => setOutputDir("") : handleSelectOutputDir}
                  className="mt-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {outputDir ? t("optimize.plan.clearFolder") : t("optimize.plan.chooseFolder")}
                </button>
              </div>
            }
            secondary={
              <button
                type="button"
                onClick={() => setAdvancedOpen((isOpen) => !isOpen)}
                className="inline-flex items-center gap-1 whitespace-nowrap px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                aria-expanded={advancedOpen}
              >
                {t("optimize.plan.advanced")}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>
            }
            primary={
              <button
                type="button"
                onClick={handleOptimize}
                disabled={!canOptimize}
                data-state={isOptimizing ? "loading" : hasError ? "error" : hasDone ? "success" : "default"}
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:-translate-y-[1.5px] hover:bg-primary/90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 motion-reduce:transform-none transition-[color,opacity,transform] duration-150 cursor-pointer data-[state=error]:bg-destructive data-[state=success]:bg-primary"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("optimize.preparing")}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {t("optimize.ready")}
                  </>
                )}
              </button>
            }
            advancedOpen={advancedOpen}
            advanced={
              <div className="grid gap-3 md:grid-cols-3 min-w-0">
                <section className="rounded-md border border-border/60 bg-background p-3 flex flex-col gap-3 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("optimize.format.label")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(["webp", "jpeg", "png", "original"] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => setOutputFormat(format)}
                        className={`${CHIP} ${outputFormat === format ? CHIP_ON : CHIP_OFF}`}
                      >
                        {t(`optimize.format.${format}`)}
                      </button>
                    ))}
                  </div>
                  {useWebProfile && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("optimize.keep.webHint")}
                    </p>
                  )}
                </section>

                <section className="rounded-md border border-border/60 bg-background p-3 flex flex-col gap-3 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("optimize.output.naming")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOutputNaming("suffix")}
                      className={`${CHIP} ${outputNaming === "suffix" ? CHIP_ON : CHIP_OFF}`}
                    >
                      {t("optimize.output.suffix")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutputNaming("replace")}
                      className={`${CHIP} ${outputNaming === "replace" ? CHIP_ON : CHIP_OFF}`}
                    >
                      {t("optimize.output.replace")}
                    </button>
                  </div>
                  {outputNaming === "suffix" && (
                    <input
                      type="text"
                      value={customSuffix}
                      onChange={(event) => setCustomSuffix(event.target.value)}
                      placeholder="_web"
                      className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background focus-visible:outline-2 focus-visible:outline-ring"
                    />
                  )}
                </section>

                <section className="rounded-md border border-border/60 bg-background p-3 flex flex-col gap-3 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {t("optimize.resize.label")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setResizeEnabled((value) => !value)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring ${
                        resizeEnabled ? "bg-primary" : "bg-muted"
                      }`}
                      aria-pressed={resizeEnabled}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          resizeEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  {resizeEnabled ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          placeholder={t("optimize.resize.width")}
                          value={targetWidth ?? ""}
                          onChange={(event) => {
                            const value = event.target.value ? Number(event.target.value) : null;
                            setTargetWidth(value);
                            if (lockRatio && value && selectedFile) {
                              const ratio =
                                selectedFile.originalDimensions.width /
                                selectedFile.originalDimensions.height;
                              setTargetHeight(Math.round(value / ratio));
                            }
                          }}
                          className="min-w-0 flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => setLockRatio((value) => !value)}
                          className="p-1.5 hover:bg-muted rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                          title={t("optimize.resize.lockRatio")}
                        >
                          {lockRatio ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <input
                          type="number"
                          placeholder={t("optimize.resize.height")}
                          value={targetHeight ?? ""}
                          onChange={(event) => {
                            const value = event.target.value ? Number(event.target.value) : null;
                            setTargetHeight(value);
                            if (lockRatio && value && selectedFile) {
                              const ratio =
                                selectedFile.originalDimensions.width /
                                selectedFile.originalDimensions.height;
                              setTargetWidth(Math.round(value * ratio));
                            }
                          }}
                          className="min-w-0 flex-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">{t("optimize.keep.label")}</span>
                          <span className="text-[11px] font-mono text-foreground">{keepPercent}%</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={keepPercent}
                          onChange={(event) => setKeepPercent(Number(event.target.value))}
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-ring"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {keepPercent === 100
                            ? t("optimize.keep.hintKeep", { keep: keepPercent })
                            : t("optimize.keep.hint", { keep: keepPercent, cut: cutPercent })}
                        </p>
                        {selectedIsPng && (
                          <p className="text-[11px] text-muted-foreground">{t("optimize.keep.pngHint")}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t("optimize.resize.webDefault")}
                    </p>
                  )}
                </section>
              </div>
            }
          />
        )
      }
      strip={
        empty ? undefined : (
          <FileQueue
            files={queueFiles}
            selectedId={selectedFile?.id ?? null}
            onSelect={setSelectedId}
            onRemove={removeFile}
            disabled={isOptimizing || isDetecting}
            onAdd={handleBrowse}
            addLabel={t("optimize.dropzone.add")}
          />
        )
      }
    />
  );
}
