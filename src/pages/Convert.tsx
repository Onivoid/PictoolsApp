import { useCallback, useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FolderOpen, ImageIcon, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BeforeAfterCompare,
  FileDropzone,
  FileQueue,
  ToolDock,
  ToolWorkbench,
  type QueueFile,
} from "@/components/workbench";
import { loadImageEntries, useImageDrop } from "@/composables";
import { formatBytes } from "@/utils/format";

type TargetFormat = "png" | "jpeg" | "webp" | "ico" | "appicons";

interface ConvertFile extends QueueFile {
  outputPath?: string;
}

interface ConvertResult {
  input: string;
  output: string | null;
  error: string | null;
  originalSize: number;
  outputSize: number;
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
  const [files, setFiles] = useState<ConvertFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>("png");
  const [icoSizes, setIcoSizes] = useState<number[]>([...ICO_SIZES]);
  const [outputDir, setOutputDir] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [fileProgress, setFileProgress] = useState<{ pct: number; label: string } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectCount, setDetectCount] = useState(0);

  const selectedFile = files.find((file) => file.id === selectedId) ?? files[0] ?? null;

  const addPaths = useCallback(async (paths: string[]) => {
    let toAdd: string[] = [];
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.path));
      toAdd = paths.filter((path) => !existing.has(path));
      if (toAdd.length === 0) return prev;
      const placeholders: ConvertFile[] = toAdd.map((path) => ({
        id: crypto.randomUUID(),
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        status: "pending",
        originalSize: 0,
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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<number | [number, string]>("convert:progress", (event) => {
      const payload = event.payload;
      if (Array.isArray(payload)) {
        setFileProgress({ pct: payload[0], label: payload[1] });
      } else {
        setFileProgress((prev) => ({ pct: payload, label: prev?.label ?? "" }));
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const handleSelectOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir && typeof dir === "string") setOutputDir(dir);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const toggleIcoSize = (size: number) => {
    setIcoSizes((prev) =>
      prev.includes(size) ? prev.filter((item) => item !== size) : [...prev, size].sort((a, b) => a - b)
    );
  };

  const handleConvert = async () => {
    if (!files.length || !outputDir) return;
    setIsConverting(true);
    setFileProgress({ pct: 0, label: "" });
    setFiles((prev) => prev.map((file) => ({ ...file, status: "processing" as const })));

    try {
      if (targetFormat === "appicons") {
        const next: ConvertFile[] = [];
        for (const file of files) {
          setFileProgress({ pct: 0, label: file.name });
          const iconResults = await invoke<AppIconsResult[]>("generate_app_icons", {
            input: file.path,
            outputDir,
          });
          for (const result of iconResults) {
            next.push({
              id: crypto.randomUUID(),
              path: file.path,
              name: result.file,
              status: result.ok ? "done" : "error",
              originalSize: file.originalSize,
              error: result.error ?? undefined,
            });
          }
        }
        setFiles(next);
        setSelectedId(next[0]?.id ?? null);
      } else {
        const results = await invoke<ConvertResult[]>("convert_images", {
          files: files.map((file) => file.path),
          targetFormat,
          icoSizes: targetFormat === "ico" ? icoSizes : null,
          outputDir,
        });

        if (targetFormat === "ico") {
          const next: ConvertFile[] = results.map((result) => ({
            id: crypto.randomUUID(),
            path: result.input,
            name: result.output?.split(/[\\/]/).pop() ?? result.input.split(/[\\/]/).pop() ?? result.input,
            status: result.error ? "error" : "done",
            originalSize: result.originalSize,
            outputSize: result.outputSize,
            outputPath: result.output ?? undefined,
            error: result.error ?? undefined,
          }));
          setFiles(next);
          setSelectedId(next[0]?.id ?? null);
        } else {
          setFiles((prev) =>
            prev.map((file) => {
              const result = results.find((item) => item.input === file.path);
              if (!result) {
                return { ...file, status: "error" as const, error: t("convert.status.noResult") };
              }
              return {
                ...file,
                status: result.error ? "error" : "done",
                originalSize: result.originalSize,
                outputSize: result.outputSize,
                outputPath: result.output ?? undefined,
                error: result.error ?? undefined,
              };
            })
          );
        }
      }
    } catch (error) {
      setFiles((prev) =>
        prev.map((file) => ({ ...file, status: "error" as const, error: String(error) }))
      );
    } finally {
      setIsConverting(false);
      setFileProgress(null);
    }
  };

  const canConvert = files.length > 0 && Boolean(outputDir) && !isConverting && !isDetecting;
  const beforeSrc = selectedFile ? convertFileSrc(selectedFile.path) : null;
  const afterSrc =
    selectedFile?.outputPath && selectedFile.status === "done"
      ? convertFileSrc(selectedFile.outputPath)
      : null;
  const empty = files.length === 0;
  const hasDone = files.some((file) => file.status === "done");
  const hasError = files.some((file) => file.status === "error") && !isConverting;
  const formatLabel = FORMATS.find((format) => format.value === targetFormat)?.label ?? targetFormat;
  const sizeLabel =
    selectedFile?.outputSize != null && selectedFile.originalSize != null
      ? `${formatBytes(selectedFile.originalSize)} → ${formatBytes(selectedFile.outputSize)}`
      : null;

  const formatButtons = (
    <div className="flex flex-wrap gap-1.5">
      {FORMATS.filter((format) => !format.special).map((format) => (
        <button
          key={format.value}
          type="button"
          onClick={() => setTargetFormat(format.value)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
            targetFormat === format.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          {format.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setTargetFormat("appicons")}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors border focus-visible:outline-2 focus-visible:outline-ring ${
          targetFormat === "appicons"
            ? "bg-primary/10 border-primary text-primary"
            : "bg-muted border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        {t("appIcons.format")}
      </button>
    </div>
  );

  return (
    <ToolWorkbench
      icon={<ImageIcon className="w-5 h-5" />}
      title={t("convert.title")}
      subtitle={t("convert.subtitle")}
      isDragging={isDragging}
      draggingLabel={t("convert.dropzone.dragging")}
      busy={isDetecting}
      busyLabel={t("convert.dropzone.reading", { count: detectCount })}
      dropRef={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      stage={
        empty ? (
          <FileDropzone
            isDragging={isDragging}
            idleLabel={t("convert.dropzone.idle")}
            draggingLabel={t("convert.dropzone.dragging")}
            hint={t("convert.dropzone.hint")}
            onBrowse={handleBrowse}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ) : (
          <>
            {isConverting && fileProgress && (
              <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    {fileProgress.label || t("convert.converting")}
                  </span>
                  <span className="tabular-nums">{fileProgress.pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${fileProgress.pct}%` }}
                  />
                </div>
              </div>
            )}
            <BeforeAfterCompare
              key={selectedFile?.id ?? "none"}
              beforeSrc={beforeSrc}
              afterSrc={afterSrc}
              beforeLabel={t("optimize.preview.before")}
              afterLabel={t("optimize.preview.after")}
              compareHint={t("optimize.preview.compare")}
              sizeLabel={sizeLabel}
            />
          </>
        )
      }
      dock={
        empty ? undefined : (
          <ToolDock
            summary={
              <div className="min-w-0 flex flex-col gap-2">
                {formatButtons}
                {targetFormat === "ico" && (
                  <div className="flex flex-wrap gap-2">
                    {ICO_SIZES.map((size) => (
                      <label
                        key={size}
                        className="flex items-center gap-1.5 text-[11px] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={icoSizes.includes(size)}
                          onChange={() => toggleIcoSize(size)}
                          className="accent-primary w-3.5 h-3.5"
                        />
                        <span>
                          {size}×{size}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground truncate">
                  {files.length}{" "}
                  {files.length !== 1 ? t("convert.status.files") : t("convert.status.file")}
                  {" · "}
                  {formatLabel}
                  {" · "}
                  {outputDir ? outputDir.split(/[\\/]/).pop() : t("convert.chooseFolder")}
                </p>
              </div>
            }
            secondary={
              <>
                <button
                  type="button"
                  onClick={handleSelectOutputDir}
                  className="inline-flex items-center gap-1 whitespace-nowrap px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {outputDir ? outputDir.split(/[\\/]/).pop() : t("convert.chooseFolder")}
                </button>
                {hasDone && outputDir && (
                  <button
                    type="button"
                    onClick={() => openPath(outputDir)}
                    className="inline-flex items-center gap-1 whitespace-nowrap px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t("convert.openFolder")}
                  </button>
                )}
              </>
            }
            primary={
              <button
                type="button"
                onClick={handleConvert}
                disabled={!canConvert}
                data-state={isConverting ? "loading" : hasError ? "error" : hasDone ? "success" : "default"}
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:-translate-y-[1.5px] hover:bg-primary/90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 motion-reduce:transform-none transition-[color,opacity,transform] duration-150 cursor-pointer data-[state=error]:bg-destructive"
              >
                {isConverting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {targetFormat === "appicons" ? t("appIcons.invoking") : t("convert.converting")}
                  </>
                ) : targetFormat === "appicons" ? (
                  t("appIcons.invoke")
                ) : (
                  t("convert.convert")
                )}
              </button>
            }
          />
        )
      }
      strip={
        empty ? undefined : (
          <FileQueue
            files={files}
            selectedId={selectedFile?.id ?? null}
            onSelect={setSelectedId}
            onRemove={removeFile}
            disabled={isConverting || isDetecting}
            onAdd={handleBrowse}
            addLabel={t("optimize.dropzone.add")}
          />
        )
      }
    />
  );
}
