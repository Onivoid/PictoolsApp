import { Upload } from "lucide-react";
import type { DragEvent, Ref } from "react";

interface FileDropzoneProps {
  isDragging: boolean;
  idleLabel: string;
  draggingLabel: string;
  hint: string;
  onBrowse: () => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  dropRef?: Ref<HTMLDivElement>;
}

export function FileDropzone({
  isDragging,
  idleLabel,
  draggingLabel,
  hint,
  onBrowse,
  onDragOver,
  onDragLeave,
  onDrop,
  dropRef,
}: FileDropzoneProps) {
  return (
    <div
      ref={dropRef}
      role="button"
      tabIndex={0}
      onClick={onBrowse}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onBrowse();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center gap-4 flex-1 m-5 min-h-0 min-w-0 cursor-pointer border-2 border-dashed rounded-lg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 active:translate-y-px ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/40"
      }`}
    >
      <Upload className="w-8 h-8 text-muted-foreground" />
      <div className="text-center px-4 min-w-0">
        <p className="text-base font-medium text-foreground min-w-0 [overflow-wrap:anywhere]">
          {isDragging ? draggingLabel : idleLabel}
        </p>
        <p className="text-xs text-muted-foreground mt-2">{hint}</p>
      </div>
    </div>
  );
}
