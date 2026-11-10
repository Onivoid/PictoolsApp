import type { ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Film, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import type { QueueFile } from "./FileQueue";

interface MediaSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: QueueFile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  previewSrc: string | null;
  previewMeta?: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  disabled?: boolean;
  media?: "image" | "video";
  filesLabel: string;
  collapseLabel: string;
  expandLabel: string;
}

export function MediaSidePanel({
  open,
  onOpenChange,
  files,
  selectedId,
  onSelect,
  onRemove,
  previewSrc,
  previewMeta,
  onAdd,
  addLabel,
  disabled = false,
  media = "image",
  filesLabel,
  collapseLabel,
  expandLabel,
}: MediaSidePanelProps) {
  const selected = files.find((file) => file.id === selectedId) ?? files[0] ?? null;

  return (
    <aside
      className={`shrink-0 border-r border-border/50 bg-muted/20 flex flex-col min-h-0 transition-[width] duration-200 ease-out overflow-hidden ${
        open ? "w-[15.5rem]" : "w-12"
      }`}
    >
      {open ? (
        <>
          <div className="shrink-0 flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border/50">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 px-0.5">
              {filesLabel}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={collapseLabel}
              title={collapseLabel}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div className="shrink-0 p-2.5 border-b border-border/50">
            <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-muted border border-border">
              {previewSrc ? (
                media === "video" ? (
                  <video
                    src={previewSrc}
                    className="w-full h-full object-contain bg-muted/40"
                    muted
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <img
                    src={previewSrc}
                    alt={selected?.name}
                    className="w-full h-full object-contain bg-muted/40"
                    draggable={false}
                  />
                )
              ) : null}
              {selected?.status === "error" && selected.error ? (
                <p className="absolute inset-x-2 bottom-2 rounded bg-background/90 px-2 py-1 text-[10px] text-destructive">
                  {selected.error}
                </p>
              ) : null}
            </div>
            <p className="mt-2 text-xs font-medium text-foreground truncate">{selected?.name}</p>
            {previewMeta}
          </div>

          <ul className="flex-1 min-h-0 overflow-y-auto overflow-x-clip p-2 flex flex-col gap-1">
            {files.map((file) => {
              const isSelected = file.id === selected?.id;
              return (
                <li key={file.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(file.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(file.id);
                      }
                    }}
                    className={`group relative flex items-center gap-2 rounded-md p-1.5 cursor-pointer border transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 ${
                      isSelected
                        ? "border-primary bg-primary/8"
                        : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <div className="relative w-10 h-10 rounded overflow-hidden bg-muted border border-border shrink-0">
                      {media === "video" ? (
                        <>
                          <video
                            src={convertFileSrc(file.path)}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                            playsInline
                          />
                          <span className="absolute bottom-0.5 left-0.5 inline-flex rounded bg-background/85 p-0.5 border border-border/60">
                            <Film className="w-2.5 h-2.5" />
                          </span>
                        </>
                      ) : (
                        <img
                          src={convertFileSrc(file.path)}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {file.detail ?? ""}
                      </p>
                    </div>
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemove(file.id);
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
            {onAdd ? (
              <li>
                <button
                  type="button"
                  onClick={onAdd}
                  disabled={disabled}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/40 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {addLabel}
                </button>
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-2 h-full">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={expandLabel}
            title={expandLabel}
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
          {previewSrc ? (
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              className="w-8 h-8 rounded overflow-hidden border border-border focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={selected?.name}
            >
              {media === "video" ? (
                <video
                  src={previewSrc}
                  className="w-full h-full object-cover"
                  muted
                  preload="metadata"
                  playsInline
                />
              ) : (
                <img src={previewSrc} alt="" className="w-full h-full object-cover" draggable={false} />
              )}
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}
