import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Clapperboard, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  FileDropzone,
  FileQueue,
  FormatChip,
  ToolDock,
  ToolWorkbench,
  type QueueFile,
} from "@/components/workbench";
import { loadVideoEntries, useVideoDrop } from "@/composables";
import { ACCEPTED_VIDEO_EXTENSIONS } from "@/constants";
import { formatBytes } from "@/utils/format";

type OutputFormat = "mp4" | "webm" | "mov" | "mkv";
type Preset = "light" | "balanced" | "quality";
type OutputNaming = "suffix" | "replace";

interface VideoFile extends QueueFile {
  format: string;
  width: number | null;
  height: number | null;
  durationSecs: number | null;
  outputPath?: string;
}

interface VideoResult {
  input: string;
  output: string | null;
  originalSize: number;
  outputSize: number;
  error: string | null;
}

interface VideoProgress {
  index: number;
  total: number;
  file: string;
  percent: number | null;
}

function parentFolder(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, "") || path;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function formatDuration(secs: number | null): string {
  if (secs == null || !Number.isFinite(secs) || secs <= 0) return "—";
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function humanizeVideoError(raw: string, t: (key: string) => string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("sidecar unavailable") ||
    lower.includes("failed to spawn ffmpeg") ||
    lower.includes("no such file")
  ) {
    return t("video.errors.sidecar");
  }
  if (lower.includes("ffmpeg")) {
    return t("video.errors.failed");
  }
  return raw.trim() || t("video.errors.generic");
}

export default function Video() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [preset, setPreset] = useState<Preset>("balanced");
  const [outputNaming, setOutputNaming] = useState<OutputNaming>("suffix");
  const [customSuffix, setCustomSuffix] = useState("_compressed");
  const [outputDir, setOutputDir] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectCount, setDetectCount] = useState(0);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [progressFile, setProgressFile] = useState<string | null>(null);

  const selectedFile = files.find((file) => file.id === selectedId) ?? null;

  const addPaths = useCallback(async (paths: string[]) => {
    let toAdd: string[] = [];
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.path));
      toAdd = paths.filter((path) => !existing.has(path));
      if (toAdd.length === 0) return prev;
      const placeholders: VideoFile[] = toAdd.map((path) => ({
        id: crypto.randomUUID(),
        path,
        name: fileNameFromPath(path),
        status: "pending",
        originalSize: 0,
        format: "",
        width: null,
        height: null,
        durationSecs: null,
      }));
      return [...prev, ...placeholders];
    });
    if (toAdd.length === 0) return;

    setIsDetecting(true);
    setDetectCount(toAdd.length);
    try {
      const entries = await loadVideoEntries(toAdd);
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
              format: entry.format,
              width: entry.width,
              height: entry.height,
              durationSecs: entry.durationSecs,
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
    useVideoDrop([...ACCEPTED_VIDEO_EXTENSIONS], addPaths);

  const handleSelectOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir && typeof dir === "string") setOutputDir(dir);
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<VideoProgress>("video:progress", (event) => {
      const { file, percent } = event.payload;
      setProgressFile(file);
      setProgressPercent(percent);
      setFiles((prev) =>
        prev.map((item) =>
          item.name === file || item.path.endsWith(file)
            ? { ...item, status: "processing" }
            : item
        )
      );
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const options = useMemo(
    () => ({
      preset,
      outputFormat,
      outputNaming,
      customSuffix,
    }),
    [preset, outputFormat, outputNaming, customSuffix]
  );

  const handleProcess = async () => {
    if (!files.length || isDetecting) return;
    setIsProcessing(true);
    setProgressPercent(0);
    setFiles((prev) => prev.map((file) => ({ ...file, status: "processing" as const })));

    try {
      const results = await invoke<VideoResult[]>("process_videos", {
        files: files.map((file) => file.path),
        options,
        outputDir,
      });

      setFiles((prev) =>
        prev.map((file) => {
          const result = results.find((item) => item.input === file.path);
          if (!result) {
            return { ...file, status: "error" as const, error: t("video.errors.generic") };
          }
          return {
            ...file,
            status: result.error ? "error" : "done",
            originalSize: result.originalSize,
            outputSize: result.outputSize,
            outputPath: result.output ?? undefined,
            error: result.error ? humanizeVideoError(result.error, t) : undefined,
          };
        })
      );
    } catch (error) {
      const message = humanizeVideoError(String(error), t);
      setFiles((prev) =>
        prev.map((file) => ({ ...file, status: "error" as const, error: message }))
      );
    } finally {
      setIsProcessing(false);
      setProgressPercent(null);
      setProgressFile(null);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const uniqueFolders = new Set(files.map((file) => parentFolder(file.path)));
  const canProcess = files.length > 0 && !isProcessing && !isDetecting;
  const empty = files.length === 0;
  const hasDone = files.some((file) => file.status === "done");
  const hasError = files.some((file) => file.status === "error") && !isProcessing;

  const previewSrc = selectedFile
    ? selectedFile.status === "done" && selectedFile.outputPath
      ? convertFileSrc(selectedFile.outputPath)
      : convertFileSrc(selectedFile.path)
    : null;

  const sizeLabel = selectedFile
    ? selectedFile.outputSize != null
      ? `${formatBytes(selectedFile.originalSize ?? 0)} → ${formatBytes(selectedFile.outputSize)}`
      : selectedFile.originalSize
        ? formatBytes(selectedFile.originalSize)
        : null
    : null;

  const queueFiles = files.map((file) => {
    const dims =
      file.width && file.height ? `${file.width}×${file.height}` : t("video.meta.unknownDims");
    const duration = formatDuration(file.durationSecs);
    return {
      ...file,
      detail: `${dims} · ${duration}`,
    };
  });

  const destination = outputDir
    ? outputDir.split(/[\\/]/).pop()
    : uniqueFolders.size > 1
      ? t("video.plan.besideMixed")
      : t("video.plan.besideFiles");

  return (
    <ToolWorkbench
      icon={<Clapperboard className="w-5 h-5" />}
      title={t("video.title")}
      subtitle={t("video.subtitle")}
      isDragging={isDragging}
      draggingLabel={t("video.dropzone.dragging")}
      busy={isDetecting || isProcessing}
      busyLabel={
        isProcessing
          ? progressPercent != null
            ? t("video.processingLabel", {
                file: progressFile ?? "",
                percent: progressPercent,
              })
            : t("video.processingLabelIndeterminate", {
                file: progressFile ?? "",
              })
          : t("video.readingLabel", { count: detectCount })
      }
      busyProgress={isProcessing ? progressPercent : null}
      dropRef={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      stage={
        empty ? (
          <FileDropzone
            isDragging={isDragging}
            idleLabel={t("video.dropzone.idle")}
            draggingLabel={t("video.dropzone.dragging")}
            hint={t("video.dropzone.hint")}
            onBrowse={handleBrowse}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ) : (
          <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center bg-muted/30">
            {selectedFile?.status === "error" && selectedFile.error ? (
              <p
                role="alert"
                className="absolute top-3 left-1/2 z-[1] max-w-[min(36rem,90%)] -translate-x-1/2 rounded-md border border-destructive/40 bg-background/95 px-3 py-2 text-xs text-destructive text-center"
              >
                {selectedFile.error}
              </p>
            ) : null}
            {previewSrc ? (
              <video
                key={previewSrc}
                src={previewSrc}
                controls
                className="max-h-full max-w-full object-contain"
                aria-label={selectedFile?.name}
              />
            ) : null}
            {sizeLabel && selectedFile?.status !== "error" && (
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-background/85 px-2.5 py-1 text-xs font-mono text-muted-foreground border border-border/60">
                {sizeLabel}
              </p>
            )}
          </div>
        )
      }
      dock={
        empty ? undefined : (
          <ToolDock
            summary={
              <div className="min-w-0">
                <p className="text-sm text-foreground leading-snug">
                  {t(files.length === 1 ? "video.plan.file" : "video.plan.files", {
                    count: files.length,
                  })}
                  {` · ${t(`video.preset.${preset}`)} · ${outputFormat.toUpperCase()}`}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {t("video.plan.suffix")} · {destination}
                </p>
                <button
                  type="button"
                  onClick={outputDir ? () => setOutputDir("") : handleSelectOutputDir}
                  className="mt-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {outputDir ? t("video.plan.clearFolder") : t("video.plan.chooseFolder")}
                </button>
              </div>
            }
            primary={
              <button
                type="button"
                onClick={handleProcess}
                disabled={!canProcess}
                data-state={isProcessing ? "loading" : hasError ? "error" : hasDone ? "success" : "default"}
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:-translate-y-[1.5px] hover:bg-primary/90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 motion-reduce:transform-none transition-[color,opacity,transform] duration-150 cursor-pointer data-[state=error]:bg-destructive data-[state=success]:bg-primary"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("video.processing")}
                  </>
                ) : (
                  <>
                    <Clapperboard className="w-4 h-4" />
                    {t("video.run")}
                  </>
                )}
              </button>
            }
            advancedOpen
            advanced={
              <div className="grid gap-3 md:grid-cols-3 min-w-0">
                <section className="rounded-md border border-border/60 bg-background p-3 flex flex-col gap-3 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("video.format.label")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(["mp4", "webm", "mov", "mkv"] as const).map((format) => (
                      <FormatChip
                        key={format}
                        selected={outputFormat === format}
                        disabled={isProcessing}
                        onClick={() => setOutputFormat(format)}
                      >
                        {format.toUpperCase()}
                      </FormatChip>
                    ))}
                  </div>
                </section>

                <section className="rounded-md border border-border/60 bg-background p-3 flex flex-col gap-3 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("video.preset.label")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(["light", "balanced", "quality"] as const).map((value) => (
                      <FormatChip
                        key={value}
                        selected={preset === value}
                        disabled={isProcessing}
                        onClick={() => setPreset(value)}
                      >
                        {t(`video.preset.${value}`)}
                      </FormatChip>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t(`video.preset.hint.${preset}`)}
                  </p>
                </section>

                <section className="rounded-md border border-border/60 bg-background p-3 flex flex-col gap-3 min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("video.output.naming")}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <FormatChip
                      selected={outputNaming === "suffix"}
                      disabled={isProcessing}
                      onClick={() => setOutputNaming("suffix")}
                    >
                      {t("video.output.suffix")}
                    </FormatChip>
                    <FormatChip
                      selected={outputNaming === "replace"}
                      disabled={isProcessing}
                      onClick={() => setOutputNaming("replace")}
                    >
                      {t("video.output.replace")}
                    </FormatChip>
                  </div>
                  {outputNaming === "suffix" && (
                    <input
                      type="text"
                      value={customSuffix}
                      onChange={(event) => setCustomSuffix(event.target.value)}
                      placeholder="_compressed"
                      disabled={isProcessing}
                      aria-label={t("video.output.suffix")}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                    />
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
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={removeFile}
            disabled={isProcessing || isDetecting}
            onAdd={handleBrowse}
            addLabel={t("video.dropzone.add")}
            media="video"
          />
        )
      }
    />
  );
}
