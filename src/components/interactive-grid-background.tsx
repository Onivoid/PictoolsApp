"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface InteractiveGridBackgroundProps
  extends React.HTMLProps<HTMLDivElement> {
  gridGap?: number;
  dotSize?: number;
  color?: string;
  highlightColor?: string;
  radius?: number;
}

export function InteractiveGridBackground({
  className,
  children,
  gridGap = 20,
  dotSize = 1.2,
  color = "hsl(var(--border))",
  highlightColor = "hsl(var(--primary))",
  radius = 250,
  ...props
}: InteractiveGridBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const requestRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Convert CSS color to RGB for canvas
    const getComputedColor = (cssColor: string) => {
      const temp = document.createElement("div");
      temp.style.color = cssColor;
      document.body.appendChild(temp);
      const computed = window.getComputedStyle(temp).color;
      document.body.removeChild(temp);

      // Parse rgb/rgba to get individual components
      const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
      if (match) {
        return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
      }
      return computed;
    };

    const baseColor = getComputedColor(color);
    const accentColor = getComputedColor(highlightColor);

    // Performance optimization: use will-change
    canvas.style.willChange = "transform";

    // Mouse move handler
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const onMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", onMouseLeave);

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      if (!ctx || !canvas) return;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Draw grid dots
      for (let x = 0; x < width; x += gridGap) {
        for (let y = 0; y < height; y += gridGap) {
          // Distance to mouse
          const dx = x - mouseRef.current.x;
          const dy = y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Base state
          let currentSize = dotSize;
          let currentAlpha = 0.2;
          let currentColor = baseColor;

          // Interaction
          if (dist < radius) {
            const ratio = 1 - dist / radius;
            currentSize = dotSize + ratio * 1.5;
            currentAlpha = 0.3 + ratio * 0.6;

            if (ratio > 0.5) {
              currentColor = accentColor;
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, currentSize, 0, Math.PI * 2);
          ctx.fillStyle = currentColor;
          ctx.globalAlpha = currentAlpha;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gridGap, dotSize, color, highlightColor, radius]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden",
        className
      )}
      {...props}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}
