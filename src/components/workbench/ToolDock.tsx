import type { ReactNode } from "react";

interface ToolDockProps {
  summary: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  advanced?: ReactNode;
  advancedOpen?: boolean;
}

export function ToolDock({
  summary,
  primary,
  secondary,
  advanced,
  advancedOpen = false,
}: ToolDockProps) {
  return (
    <div className="shrink-0 border-t border-border bg-background">
      {advancedOpen && advanced && (
        <div className="px-5 py-4 border-b border-border/50 bg-muted/20 overflow-y-auto overflow-x-clip max-h-[min(40vh,22rem)]">
          {advanced}
        </div>
      )}
      <div className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:gap-4 min-w-0">
        <div className="flex-1 min-w-0">{summary}</div>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto min-w-0">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  );
}
