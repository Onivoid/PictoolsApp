import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormatChipVariant = "default" | "accent";

interface FormatChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  variant?: FormatChipVariant;
  children: ReactNode;
}

const base =
  "px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 disabled:cursor-not-allowed";

export function FormatChip({
  selected = false,
  variant = "default",
  className,
  children,
  type = "button",
  ...props
}: FormatChipProps) {
  const selectedClass =
    variant === "accent"
      ? "bg-primary/10 border border-primary text-primary"
      : "bg-primary text-primary-foreground border border-transparent";

  const idleClass =
    variant === "accent"
      ? "bg-background text-muted-foreground border border-border/60 hover:bg-accent hover:text-accent-foreground"
      : "bg-background text-muted-foreground border border-border/60 hover:bg-accent hover:text-accent-foreground";

  return (
    <button
      type={type}
      className={cn(base, selected ? selectedClass : idleClass, className)}
      aria-pressed={selected}
      {...props}
    >
      {children}
    </button>
  );
}
