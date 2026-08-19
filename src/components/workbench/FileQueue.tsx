import { convertFileSrc } from "@tauri-apps/api/core";
import { AlertCircle, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { formatBytes } from "@/utils/format";

export type QueueStatus = "pending" | "processing" | "done" | "error";

export interface QueueFile {
  id: string;
  path: string;
  name: string;
  status: QueueStatus;
  originalSize?: number;
  outputSize?: number;
  detail?: string;
  error?: string;
}

interface FileQueueProps {
  files: QueueFile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  onAdd?: () => void;
  addLabel?: string;
}

export function FileQueue({
  files,
  selectedId,
  onSelect,
  onRemove,
  disabled = false,
  onAdd,
  addLabel,
}: FileQueueProps) {
  if (files.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <ul className="flex gap-2 p-2 overflow-x-auto overflow-y-hidden min-w-0">
        {files.map((file) => {
          const selected = file.id === selectedId;
          return (
            <li key={file.id} className="shrink-0 w-24 min-w-0">
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
                className={`group relative flex flex-col gap-1 rounded-md p-1 text-left cursor-pointer border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1 ${
                  selected
                    ? "border-primary bg-primary/8"
                    : "border-transparent hover:bg-muted/60"
                }`}
              >
                <div className="relative w-full aspect-[4/3] rounded overflow-hidden bg-muted border border-border min-w-0">
                  <img
                    src={convertFileSrc(file.path)}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
                    {file.status === "processing" && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary drop-shadow" />
                    )}
                    {file.status === "done" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-secondary drop-shadow" />
                    )}
                    {file.status === "error" && (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive drop-shadow" />
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemove(file.id);
                        }}
                        className="p-0.5 rounded bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
                        aria-label={file.name}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] font-medium text-foreground truncate">{file.name}</p>
                {file.detail && (
                  <p className="text-[10px] text-muted-foreground truncate">{file.detail}</p>
                )}
                <p className="text-[10px] text-muted-foreground truncate font-mono">
                  {file.originalSize != null ? formatBytes(file.originalSize) : "—"}
                  {file.outputSize != null ? ` → ${formatBytes(file.outputSize)}` : ""}
                </p>
                {file.error && (
                  <p className="text-[10px] text-destructive truncate">{file.error}</p>
                )}
              </div>
            </li>
          );
        })}
        {onAdd && (
          <li className="shrink-0 w-24">
            <button
              type="button"
              onClick={onAdd}
              disabled={disabled}
              className="w-full h-full min-h-[5.5rem] flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/40 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Plus className="w-4 h-4" />
              {addLabel && <span className="text-[10px] px-1 text-center">{addLabel}</span>}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
