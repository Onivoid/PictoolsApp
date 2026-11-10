import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  CopyPlus,
  Loader2,
  MapPinOff,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  Shield,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  FileDropzone,
  FormatChip,
  ToolDock,
  ToolWorkbench,
  type QueueFile,
} from "@/components/workbench";
import { loadImageEntries, useImageDrop, useLocalStorage } from "@/composables";
import { ACCEPTED_EXIF_EXTENSIONS, STORAGE_KEYS } from "@/constants";
import { formatBytes } from "@/utils/format";

type OutputNaming = "suffix" | "replace";
type PanelTab = "rights" | "photo" | "camera" | "location" | "tags";

interface ExifCommonFields {
  description: string;
  datetimeOriginal: string;
  make: string;
  model: string;
  artist: string;
  copyright: string;
  credit: string;
  rightsUsage: string;
  contact: string;
  software: string;
  orientation: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAltitude: number | null;
  clearGps: boolean;
}

interface RightsTemplate {
  artist: string;
  copyright: string;
  credit: string;
  rightsUsage: string;
  contact: string;
}

interface ExifTagEntry {
  name: string;
  hex: string;
  group: string;
  value: string;
  editable: boolean;
}

interface ExifReadResult {
  path: string;
  supported: boolean;
  common: ExifCommonFields;
  tags: ExifTagEntry[];
  error: string | null;
}

interface ExifWriteResult {
  input: string;
  output: string | null;
  error: string | null;
}

interface ExifFile extends QueueFile {
  dirty?: boolean;
  outputPath?: string;
  hasRights?: boolean;
}

const EMPTY_COMMON: ExifCommonFields = {
  description: "",
  datetimeOriginal: "",
  make: "",
  model: "",
  artist: "",
  copyright: "",
  credit: "",
  rightsUsage: "",
  contact: "",
  software: "",
  orientation: "",
  gpsLatitude: null,
  gpsLongitude: null,
  gpsAltitude: null,
  clearGps: false,
};

const EMPTY_RIGHTS: RightsTemplate = {
  artist: "",
  copyright: "",
  credit: "",
  rightsUsage: "",
  contact: "",
};

function parentFolder(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, "") || path;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function hasRightsSignal(common: Pick<ExifCommonFields, "artist" | "copyright">): boolean {
  return Boolean(common.artist.trim() || common.copyright.trim());
}

function rightsFromCommon(common: ExifCommonFields): RightsTemplate {
  return {
    artist: common.artist,
    copyright: common.copyright,
    credit: common.credit,
    rightsUsage: common.rightsUsage,
    contact: common.contact,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function isBenignReadMessage(message: string | null): boolean {
  if (!message) return true;
  const lower = message.toLowerCase();
  return lower.includes("no exif") || lower.includes("exif data found");
}

const inputClass =
  "w-full px-2.5 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

const TABS: PanelTab[] = ["rights", "photo", "camera", "location", "tags"];

export default function Exif() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<ExifFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [common, setCommon] = useState<ExifCommonFields>(EMPTY_COMMON);
  const [baseline, setBaseline] = useState<ExifCommonFields>(EMPTY_COMMON);
  const [tags, setTags] = useState<ExifTagEntry[]>([]);
  const [tagEdits, setTagEdits] = useState<Record<string, string>>({});
  const [readError, setReadError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [isReadingExif, setIsReadingExif] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("rights");
  const [showAllTags, setShowAllTags] = useState(false);
  const [outputNaming, setOutputNaming] = useState<OutputNaming>("suffix");
  const [customSuffix, setCustomSuffix] = useState("_exif");
  const [outputDir, setOutputDir] = useState("");
  const [outputOpen, setOutputOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useLocalStorage("exif-media-panel-open", true);
  const [isWorking, setIsWorking] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectCount, setDetectCount] = useState(0);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [rightsTemplate, setRightsTemplate] = useLocalStorage<RightsTemplate>(
    STORAGE_KEYS.EXIF_RIGHTS_TEMPLATE,
    EMPTY_RIGHTS
  );

  const selectedFile = files.find((file) => file.id === selectedId) ?? files[0] ?? null;
  const empty = files.length === 0;

  const dirty = useMemo(() => {
    if (JSON.stringify(common) !== JSON.stringify(baseline)) return true;
    return Object.keys(tagEdits).some((name) => {
      const original = tags.find((tag) => tag.name === name)?.value ?? "";
      return tagEdits[name] !== original;
    });
  }, [common, baseline, tagEdits, tags]);

  const rightsDirty = useMemo(() => {
    const current = rightsFromCommon(common);
    const base = rightsFromCommon(baseline);
    return JSON.stringify(current) !== JSON.stringify(base);
  }, [common, baseline]);

  const rightsReady = useMemo(() => {
    return Boolean(
      common.artist.trim() ||
        common.copyright.trim() ||
        common.credit.trim() ||
        common.rightsUsage.trim() ||
        common.contact.trim()
    );
  }, [common]);

  const missingRightsCount = files.filter((file) => file.hasRights === false).length;

  const addPaths = useCallback(async (paths: string[]) => {
    let toAdd: string[] = [];
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.path));
      toAdd = paths.filter((path) => !existing.has(path));
      if (toAdd.length === 0) return prev;
      const placeholders: ExifFile[] = toAdd.map((path) => ({
        id: crypto.randomUUID(),
        path,
        name: fileNameFromPath(path),
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

      const rightsChecks = await Promise.all(
        toAdd.map(async (path) => {
          try {
            const result = await invoke<ExifReadResult>("read_exif", { path });
            return [path, hasRightsSignal(result.common)] as const;
          } catch {
            return [path, false] as const;
          }
        })
      );
      const rightsMap = new Map(rightsChecks);
      setFiles((prev) =>
        prev.map((file) =>
          rightsMap.has(file.path)
            ? { ...file, hasRights: rightsMap.get(file.path) }
            : file
        )
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
    useImageDrop([...ACCEPTED_EXIF_EXTENSIONS], addPaths);

  const loadExifForPath = useCallback(async (path: string) => {
    setIsReadingExif(true);
    setReadError(null);
    try {
      const result = await invoke<ExifReadResult>("read_exif", { path });
      setSupported(result.supported);
      setReadError(isBenignReadMessage(result.error) ? null : result.error);
      setCommon(result.common);
      setBaseline(result.common);
      setTags(result.tags);
      setTagEdits({});
      setFiles((prev) =>
        prev.map((file) =>
          file.path === path ? { ...file, hasRights: hasRightsSignal(result.common) } : file
        )
      );
    } catch (error) {
      const message = String(error);
      if (isBenignReadMessage(message)) {
        setSupported(true);
        setReadError(null);
        setCommon(EMPTY_COMMON);
        setBaseline(EMPTY_COMMON);
        setTags([]);
        setTagEdits({});
      } else {
        setSupported(false);
        setReadError(message);
        setCommon(EMPTY_COMMON);
        setBaseline(EMPTY_COMMON);
        setTags([]);
        setTagEdits({});
      }
    } finally {
      setIsReadingExif(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setCommon(EMPTY_COMMON);
      setBaseline(EMPTY_COMMON);
      setTags([]);
      setTagEdits({});
      setReadError(null);
      return;
    }
    void loadExifForPath(selectedFile.path);
  }, [selectedFile?.path, loadExifForPath]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<[number, string]>("exif:progress", (event) => {
      const [, filePath] = event.payload;
      setBusyFile(fileNameFromPath(filePath));
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

  const handleSelectOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir && typeof dir === "string") setOutputDir(dir);
  };

  const options = useMemo(
    () => ({
      outputNaming,
      customSuffix,
      outputDir,
    }),
    [outputNaming, customSuffix, outputDir]
  );

  const patchPayload = useCallback(
    (mode: "full" | "rights") => {
      const tagUpdates =
        mode === "full"
          ? Object.entries(tagEdits)
              .filter(([name, value]) => {
                const original = tags.find((tag) => tag.name === name)?.value ?? "";
                return value !== original;
              })
              .map(([name, value]) => ({ name, value }))
          : [];

      return {
        common,
        tagUpdates,
        mode,
      };
    },
    [common, tagEdits, tags]
  );

  const applyResults = (results: ExifWriteResult[], mode: "full" | "rights") => {
    setFiles((prev) =>
      prev.map((file) => {
        const result = results.find((item) => item.input === file.path);
        if (!result) return file;
        return {
          ...file,
          status: result.error ? "error" : "done",
          outputPath: result.output ?? undefined,
          error: result.error ?? undefined,
          dirty: false,
          hasRights:
            mode === "rights" && !result.error
              ? true
              : file.hasRights,
        };
      })
    );
  };

  const runWrite = async (paths: string[], mode: "full" | "rights") => {
    if (!paths.length || isWorking || isDetecting) return;
    setIsWorking(true);
    setBusyFile(null);
    try {
      const results = await invoke<ExifWriteResult[]>("write_exif", {
        files: paths,
        patch: patchPayload(mode),
        options,
      });
      applyResults(results, mode);
      if (mode === "rights") {
        setRightsTemplate(rightsFromCommon(common));
      }
      if (selectedFile && paths.includes(selectedFile.path)) {
        await loadExifForPath(selectedFile.path);
      }
    } catch (error) {
      setFiles((prev) =>
        prev.map((file) =>
          paths.includes(file.path)
            ? { ...file, status: "error" as const, error: String(error) }
            : file
        )
      );
    } finally {
      setIsWorking(false);
      setBusyFile(null);
    }
  };

  const handleSaveSelected = () => {
    if (!selectedFile) return;
    void runWrite([selectedFile.path], "full");
  };

  const handleApplyRightsToAll = () => {
    void runWrite(
      files.map((file) => file.path),
      "rights"
    );
  };

  const handleStrip = async (mode: "gps" | "all") => {
    const paths = files.map((file) => file.path);
    if (!paths.length || isWorking || isDetecting) return;
    setIsWorking(true);
    setBusyFile(null);
    try {
      const results = await invoke<ExifWriteResult[]>("strip_exif", {
        files: selectedFile && mode === "gps" ? [selectedFile.path] : paths,
        mode,
        options,
      });
      applyResults(results, "full");
      if (selectedFile) {
        await loadExifForPath(selectedFile.path);
      }
    } catch (error) {
      setFiles((prev) =>
        prev.map((file) => ({ ...file, status: "error" as const, error: String(error) }))
      );
    } finally {
      setIsWorking(false);
      setBusyFile(null);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const updateCommon = <K extends keyof ExifCommonFields>(key: K, value: ExifCommonFields[K]) => {
    setCommon((prev) => ({ ...prev, [key]: value }));
  };

  const fillFromTemplate = () => {
    setCommon((prev) => ({
      ...prev,
      ...rightsTemplate,
    }));
    setActiveTab("rights");
  };

  const rememberRights = () => {
    setRightsTemplate(rightsFromCommon(common));
  };

  const uniqueFolders = new Set(files.map((file) => parentFolder(file.path)));
  const destination = outputDir
    ? outputDir
    : uniqueFolders.size <= 1
      ? t("exif.plan.besideFiles")
      : t("exif.plan.besideMixed");
  const canAct = files.length > 0 && !isWorking && !isDetecting && !!selectedFile;
  const hasDone = files.some((file) => file.status === "done");
  const hasError = files.some((file) => file.status === "error") && !isWorking;
  const previewSrc = selectedFile ? convertFileSrc(selectedFile.path) : null;
  const formDisabled = isWorking || isReadingExif || !supported;
  const emptyExif = supported && !readError && !hasRightsSignal(common) && !common.description;
  const templateAvailable = Boolean(
    rightsTemplate.artist ||
      rightsTemplate.copyright ||
      rightsTemplate.credit ||
      rightsTemplate.rightsUsage ||
      rightsTemplate.contact
  );

  const queueFiles = files.map((file) => ({
    ...file,
    detail:
      file.hasRights === false
        ? t("exif.queue.missingRights")
        : file.status === "done" && file.outputPath
          ? fileNameFromPath(file.outputPath)
          : file.originalSize
            ? formatBytes(file.originalSize)
            : undefined,
  }));

  return (
    <ToolWorkbench
      icon={<Tags className="w-5 h-5" />}
      title={t("exif.title")}
      subtitle={t("exif.subtitle")}
      isDragging={isDragging}
      draggingLabel={t("exif.dropzone.dragging")}
      busy={isWorking || isDetecting}
      busyLabel={
        isWorking
          ? t("exif.processingLabel", { file: busyFile ?? "" })
          : t("exif.dropzone.reading", { count: detectCount })
      }
      dropRef={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      stage={
        empty ? (
          <FileDropzone
            isDragging={isDragging}
            idleLabel={t("exif.dropzone.idle")}
            draggingLabel={t("exif.dropzone.dragging")}
            hint={t("exif.dropzone.hint")}
            onBrowse={handleBrowse}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ) : (
          <div className="flex h-full min-h-0 w-full flex-row bg-background">
            {/* Retractable media panel */}
            <aside
              className={`shrink-0 border-r border-border/50 bg-muted/20 flex flex-col min-h-0 transition-[width] duration-200 ease-out overflow-hidden ${
                panelOpen ? "w-[15.5rem]" : "w-12"
              }`}
            >
              {panelOpen ? (
                <>
                  <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border/50">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-0.5">
                      {t("exif.panel.files")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label={t("exif.panel.collapse")}
                      title={t("exif.panel.collapse")}
                    >
                      <PanelLeftClose className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="shrink-0 p-2.5 border-b border-border/50">
                    <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-muted border border-border">
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={selectedFile?.name}
                          className="w-full h-full object-contain bg-muted/40"
                          draggable={false}
                        />
                      ) : null}
                      {selectedFile?.status === "error" && selectedFile.error ? (
                        <p className="absolute inset-x-2 bottom-2 rounded bg-background/90 px-2 py-1 text-[10px] text-destructive">
                          {selectedFile.error}
                        </p>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs font-medium text-foreground truncate">
                      {selectedFile?.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {selectedFile?.originalSize != null
                        ? formatBytes(selectedFile.originalSize)
                        : ""}
                      {selectedFile?.originalSize != null ? " · " : ""}
                      {dirty ? t("exif.dirty") : t("exif.clean")}
                    </p>
                    {emptyExif ? (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t("exif.emptyExif")}
                      </p>
                    ) : null}
                  </div>

                  <ul className="flex-1 min-h-0 overflow-y-auto overflow-x-clip p-2 flex flex-col gap-1">
                    {files.map((file) => {
                      const selected = file.id === selectedFile?.id;
                      const q = queueFiles.find((item) => item.id === file.id);
                      return (
                        <li key={file.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedId(file.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedId(file.id);
                              }
                            }}
                            className={`group relative flex items-center gap-2 rounded-md p-1.5 cursor-pointer border transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 ${
                              selected
                                ? "border-primary bg-primary/8"
                                : "border-transparent hover:bg-muted/60"
                            }`}
                          >
                            <div className="relative w-10 h-10 rounded overflow-hidden bg-muted border border-border shrink-0">
                              <img
                                src={convertFileSrc(file.path)}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-foreground truncate">
                                {file.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {q?.detail ??
                                  (file.originalSize != null
                                    ? formatBytes(file.originalSize)
                                    : "")}
                              </p>
                            </div>
                            {!isWorking && !isDetecting ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeFile(file.id);
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
                                aria-label={file.name}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                    <li>
                      <button
                        type="button"
                        onClick={handleBrowse}
                        disabled={isWorking || isDetecting}
                        className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/40 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t("exif.dropzone.add")}
                      </button>
                    </li>
                  </ul>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-2 h-full">
                  <button
                    type="button"
                    onClick={() => setPanelOpen(true)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={t("exif.panel.expand")}
                    title={t("exif.panel.expand")}
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                  {previewSrc ? (
                    <button
                      type="button"
                      onClick={() => setPanelOpen(true)}
                      className="w-8 h-8 rounded overflow-hidden border border-border focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label={selectedFile?.name}
                    >
                      <img
                        src={previewSrc}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </button>
                  ) : null}
                </div>
              )}
            </aside>

            {/* Main editor */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="shrink-0 px-4 py-2.5 border-b border-border/50 flex flex-wrap items-center gap-2">
                {!panelOpen ? (
                  <button
                    type="button"
                    onClick={() => setPanelOpen(true)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring sm:hidden"
                    aria-label={t("exif.panel.expand")}
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                ) : null}
                <div
                  className="flex flex-wrap gap-1 flex-1 min-w-0"
                  role="tablist"
                  aria-label={t("exif.tabs.label")}
                >
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab}
                      onClick={() => {
                        setActiveTab(tab);
                        if (tab === "tags") setShowAllTags(true);
                      }}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                        activeTab === tab
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground border border-border hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      {t(`exif.tabs.${tab}`)}
                    </button>
                  ))}
                </div>
                {missingRightsCount > 0 ? (
                  <p className="text-xs text-muted-foreground shrink-0">
                    {t("exif.rights.missingCount", { count: missingRightsCount })}
                  </p>
                ) : null}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-clip">
                {isReadingExif ? (
                  <div className="flex items-center justify-center gap-2 h-full min-h-[12rem] text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("exif.reading")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-5 px-5 py-5 pb-8 max-w-3xl w-full">
                  {selectedFile?.status === "error" && selectedFile.error ? (
                    <p
                      role="alert"
                      className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                    >
                      {selectedFile.error}
                    </p>
                  ) : null}
                  {readError || !supported ? (
                    <p role="alert" className="text-xs text-destructive">
                      {readError || t("exif.unsupported")}
                    </p>
                  ) : null}

                  {activeTab === "rights" && (
                    <section className="flex flex-col gap-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                            <Shield className="w-4 h-4 text-primary" />
                            {t("exif.groups.rights")}
                          </h2>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-1 max-w-xl">
                            {t("exif.rights.lead")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={fillFromTemplate}
                            disabled={formDisabled || !templateAvailable}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {t("exif.rights.useTemplate")}
                          </button>
                          <button
                            type="button"
                            onClick={rememberRights}
                            disabled={formDisabled || !rightsReady}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {t("exif.rights.saveTemplate")}
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("exif.fields.artist")}>
                          <input
                            type="text"
                            value={common.artist}
                            disabled={formDisabled}
                            placeholder={t("exif.fields.artistPlaceholder")}
                            onChange={(event) => updateCommon("artist", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.copyright")}>
                          <input
                            type="text"
                            value={common.copyright}
                            disabled={formDisabled}
                            placeholder={t("exif.fields.copyrightPlaceholder")}
                            onChange={(event) => updateCommon("copyright", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.credit")}>
                          <input
                            type="text"
                            value={common.credit}
                            disabled={formDisabled}
                            placeholder={t("exif.fields.creditPlaceholder")}
                            onChange={(event) => updateCommon("credit", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.contact")}>
                          <input
                            type="text"
                            value={common.contact}
                            disabled={formDisabled}
                            placeholder={t("exif.fields.contactPlaceholder")}
                            onChange={(event) => updateCommon("contact", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                      </div>

                      <Field label={t("exif.fields.rightsUsage")}>
                        <textarea
                          value={common.rightsUsage}
                          disabled={formDisabled}
                          rows={5}
                          placeholder={t("exif.fields.rightsUsagePlaceholder")}
                          onChange={(event) => updateCommon("rightsUsage", event.target.value)}
                          className={inputClass}
                        />
                      </Field>

                      <div className="sticky bottom-0 -mx-4 px-4 py-3 border-t border-border/50 bg-background/95 backdrop-blur-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">
                            {t("exif.rights.bulkTitle", { count: files.length })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t("exif.rights.bulkHint")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleApplyRightsToAll}
                          disabled={!canAct || !rightsReady}
                          className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:-translate-y-[1.5px] hover:bg-primary/90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 motion-reduce:transform-none transition-[color,opacity,transform] duration-150 cursor-pointer shrink-0"
                        >
                          {isWorking ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CopyPlus className="w-4 h-4" />
                          )}
                          {t("exif.rights.applyAll", { count: files.length })}
                        </button>
                      </div>
                    </section>
                  )}

                  {activeTab === "photo" && (
                    <section className="flex flex-col gap-4">
                      <h2 className="text-sm font-semibold tracking-tight text-foreground">
                        {t("exif.groups.photo")}
                      </h2>
                      <Field label={t("exif.fields.description")}>
                        <textarea
                          value={common.description}
                          disabled={formDisabled}
                          rows={4}
                          placeholder={t("exif.fields.descriptionPlaceholder")}
                          onChange={(event) => updateCommon("description", event.target.value)}
                          className={inputClass}
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("exif.fields.datetime")}>
                          <input
                            type="text"
                            value={common.datetimeOriginal}
                            disabled={formDisabled}
                            placeholder="2024:01:15 14:30:00"
                            onChange={(event) =>
                              updateCommon("datetimeOriginal", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.orientation")}>
                          <select
                            value={common.orientation}
                            disabled={formDisabled}
                            onChange={(event) => updateCommon("orientation", event.target.value)}
                            className={inputClass}
                          >
                            <option value="" />
                            {(["1", "3", "6", "8"] as const).map((value) => (
                              <option key={value} value={value}>
                                {t(`exif.orientation.${value}`)}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </section>
                  )}

                  {activeTab === "camera" && (
                    <section className="flex flex-col gap-4">
                      <h2 className="text-sm font-semibold tracking-tight text-foreground">
                        {t("exif.groups.camera")}
                      </h2>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("exif.fields.make")}>
                          <input
                            type="text"
                            value={common.make}
                            disabled={formDisabled}
                            onChange={(event) => updateCommon("make", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.model")}>
                          <input
                            type="text"
                            value={common.model}
                            disabled={formDisabled}
                            onChange={(event) => updateCommon("model", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.software")}>
                          <input
                            type="text"
                            value={common.software}
                            disabled={formDisabled}
                            onChange={(event) => updateCommon("software", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    </section>
                  )}

                  {activeTab === "location" && (
                    <section className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <h2 className="text-sm font-semibold tracking-tight text-foreground">
                          {t("exif.groups.location")}
                        </h2>
                        <p className="text-xs text-muted-foreground">{t("exif.location.lead")}</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label={t("exif.fields.latitude")}>
                          <input
                            type="number"
                            step="any"
                            value={common.gpsLatitude ?? ""}
                            disabled={formDisabled || common.clearGps}
                            onChange={(event) =>
                              updateCommon(
                                "gpsLatitude",
                                event.target.value === "" ? null : Number(event.target.value)
                              )
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.longitude")}>
                          <input
                            type="number"
                            step="any"
                            value={common.gpsLongitude ?? ""}
                            disabled={formDisabled || common.clearGps}
                            onChange={(event) =>
                              updateCommon(
                                "gpsLongitude",
                                event.target.value === "" ? null : Number(event.target.value)
                              )
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("exif.fields.altitude")}>
                          <input
                            type="number"
                            step="any"
                            value={common.gpsAltitude ?? ""}
                            disabled={formDisabled || common.clearGps}
                            onChange={(event) =>
                              updateCommon(
                                "gpsAltitude",
                                event.target.value === "" ? null : Number(event.target.value)
                              )
                            }
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={common.clearGps}
                          disabled={formDisabled}
                          onChange={(event) => updateCommon("clearGps", event.target.checked)}
                          className="rounded border-border accent-primary"
                        />
                        {t("exif.fields.clearGps")}
                      </label>
                      <button
                        type="button"
                        onClick={() => handleStrip("gps")}
                        disabled={!canAct}
                        className="inline-flex w-fit items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <MapPinOff className="w-3.5 h-3.5" />
                        {t("exif.stripGps")}
                      </button>
                    </section>
                  )}

                  {activeTab === "tags" && (
                    <section className="flex flex-col gap-3 pb-2">
                      <button
                        type="button"
                        onClick={() => setShowAllTags((value) => !value)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${showAllTags ? "rotate-180" : ""}`}
                        />
                        {showAllTags ? t("exif.advanced.hide") : t("exif.advanced.toggle")}
                      </button>
                      {showAllTags && (
                        <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
                          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            {t("exif.groups.advanced")}
                          </h2>
                          {tags.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {t("exif.advanced.empty")}
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-2">
                              {tags.map((tag) => {
                                const value = tagEdits[tag.name] ?? tag.value;
                                return (
                                  <li
                                    key={`${tag.group}-${tag.hex}-${tag.name}`}
                                    className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 items-start"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-foreground truncate">
                                        {tag.name}
                                      </p>
                                      <p className="text-xs font-mono text-muted-foreground">
                                        {tag.group} · {tag.hex}
                                        {!tag.editable
                                          ? ` · ${t("exif.advanced.readonly")}`
                                          : ""}
                                      </p>
                                    </div>
                                    {tag.editable ? (
                                      <input
                                        type="text"
                                        value={value}
                                        disabled={formDisabled}
                                        onChange={(event) =>
                                          setTagEdits((prev) => ({
                                            ...prev,
                                            [tag.name]: event.target.value,
                                          }))
                                        }
                                        className={inputClass}
                                      />
                                    ) : (
                                      <p className="text-xs font-mono text-muted-foreground break-all pt-1.5">
                                        {tag.value || ""}
                                      </p>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}
            </div>
            </div>
          </div>
        )
      }

      dock={
        empty ? undefined : (
          <ToolDock
            summary={
              <div className="min-w-0">
                <p className="text-sm text-foreground leading-snug">
                  {t(files.length === 1 ? "exif.plan.file" : "exif.plan.files", {
                    count: files.length,
                  })}
                  {rightsDirty ? ` · ${t("exif.rights.unsaved")}` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {t("exif.plan.suffix")} · {destination}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={outputDir ? () => setOutputDir("") : handleSelectOutputDir}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {outputDir ? t("exif.plan.clearFolder") : t("exif.plan.chooseFolder")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputOpen((value) => !value)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${outputOpen ? "rotate-180" : ""}`}
                    />
                    {t("exif.output.toggle")}
                  </button>
                </div>
              </div>
            }
            secondary={
              <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
                <button
                  type="button"
                  onClick={() => handleStrip("all")}
                  disabled={!canAct}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("exif.stripAll")}
                </button>
              </div>
            }
            primary={
              <button
                type="button"
                onClick={handleSaveSelected}
                disabled={!canAct || !dirty}
                data-state={
                  isWorking ? "loading" : hasError ? "error" : hasDone ? "success" : "default"
                }
                className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:-translate-y-[1.5px] hover:bg-primary/90 active:translate-y-px focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 motion-reduce:transform-none transition-[color,opacity,transform] duration-150 cursor-pointer"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("exif.saving")}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {t("exif.saveSelected")}
                  </>
                )}
              </button>
            }
            advancedOpen={outputOpen}
            advanced={
              <div className="flex flex-col gap-3 min-w-0 max-w-xl">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("exif.output.naming")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <FormatChip
                    selected={outputNaming === "suffix"}
                    disabled={isWorking}
                    onClick={() => setOutputNaming("suffix")}
                  >
                    {t("exif.output.suffix")}
                  </FormatChip>
                  <FormatChip
                    selected={outputNaming === "replace"}
                    disabled={isWorking}
                    onClick={() => setOutputNaming("replace")}
                  >
                    {t("exif.output.replace")}
                  </FormatChip>
                </div>
                {outputNaming === "suffix" && (
                  <input
                    type="text"
                    value={customSuffix}
                    onChange={(event) => setCustomSuffix(event.target.value)}
                    placeholder="_exif"
                    className="w-full max-w-xs px-2 py-1.5 text-xs rounded-md border border-border bg-background focus-visible:outline-2 focus-visible:outline-ring"
                  />
                )}
              </div>
            }
          />
        )
      }
    />
  );
}
