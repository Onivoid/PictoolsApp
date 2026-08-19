import type { DragEvent, ReactNode, Ref } from "react";

/* Hallmark · pre-emit critique: P4 H5 E4 S5 R5 V4
 * macrostructure: Stage+filmstrip · tone: utilitarian · theme: existing tokens
 * genre: modern-minimal · enrichment: none
 */

interface ToolWorkbenchProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  stage: ReactNode;
  dock?: ReactNode;
  strip?: ReactNode;
  isDragging?: boolean;
  draggingLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  dropRef?: Ref<HTMLDivElement>;
  onDragOver?: (event: DragEvent) => void;
  onDragLeave?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
}

export function ToolWorkbench({
  icon,
  title,
  subtitle,
  stage,
  dock,
  strip,
  isDragging = false,
  draggingLabel,
  busy = false,
  busyLabel,
  dropRef,
  onDragOver,
  onDragLeave,
  onDrop,
}: ToolWorkbenchProps) {
  return (
    <div
      ref={dropRef}
      className="flex flex-col h-full overflow-x-clip overflow-y-hidden page-enter"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-center gap-3 px-5 py-3 border-b border-border/50 shrink-0">
        <span className="text-primary">{icon}</span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
      </header>

      <section className="relative flex-1 min-h-0 min-w-0 flex flex-col bg-muted/20">
        {stage}
        {busy && !isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              {busyLabel}
            </p>
          </div>
        )}
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/8 border-2 border-dashed border-primary pointer-events-none">
            <p className="text-sm font-medium text-foreground">{draggingLabel}</p>
          </div>
        )}
      </section>

      {dock}
      {strip}
    </div>
  );
}
