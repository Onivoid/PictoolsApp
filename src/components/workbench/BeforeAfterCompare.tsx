import { useState } from "react";

interface BeforeAfterCompareProps {
  beforeSrc: string | null;
  afterSrc: string | null;
  beforeLabel: string;
  afterLabel: string;
  compareHint: string;
  sizeLabel?: string | null;
}

export function BeforeAfterCompare({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
  compareHint,
  sizeLabel,
}: BeforeAfterCompareProps) {
  const [position, setPosition] = useState(50);

  if (!beforeSrc) {
    return null;
  }

  if (!afterSrc) {
    return (
      <div className="flex-1 relative min-h-0 min-w-0">
        <img src={beforeSrc} alt="" className="w-full h-full object-contain" />
        {sizeLabel && (
          <span className="absolute bottom-3 left-3 font-mono text-[11px] px-1.5 py-0.5 rounded bg-background/80 text-foreground">
            {sizeLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0 min-w-0 select-none">
      <img
        src={beforeSrc}
        alt={beforeLabel}
        className="absolute inset-0 w-full h-full object-contain"
      />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img
          src={afterSrc}
          alt={afterLabel}
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
      <div
        className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background" />
      </div>
      <span className="absolute top-3 left-3 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-background/80 text-muted-foreground">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-background/80 text-muted-foreground">
        {afterLabel}
      </span>
      {sizeLabel && (
        <span className="absolute bottom-3 left-3 font-mono text-[11px] px-1.5 py-0.5 rounded bg-background/80 text-foreground">
          {sizeLabel}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={compareHint}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
      />
    </div>
  );
}
