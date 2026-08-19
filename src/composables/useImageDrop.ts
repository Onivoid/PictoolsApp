import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type Orientation = "landscape" | "portrait" | "square";

export interface ImageMetadata {
  path: string;
  width: number;
  height: number;
  size: number;
  format: string;
  orientation: Orientation;
  webWidth: number;
  webHeight: number;
}

export interface ImageEntry {
  path: string;
  name: string;
  width: number;
  height: number;
  size: number;
  format: string;
  orientation: Orientation;
  webWidth: number;
  webHeight: number;
}

export async function loadImageEntries(paths: string[]): Promise<ImageEntry[]> {
  if (paths.length === 0) return [];

  const items = await invoke<ImageMetadata[]>("get_images_metadata", { filePaths: paths });
  const byPath = new Map(items.map((item) => [item.path, item]));

  return paths.flatMap((path) => {
    const metadata = byPath.get(path);
    if (!metadata) return [];
    return [
      {
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        width: metadata.width,
        height: metadata.height,
        size: metadata.size,
        format: metadata.format,
        orientation: metadata.orientation,
        webWidth: metadata.webWidth,
        webHeight: metadata.webHeight,
      },
    ];
  });
}

export function useImageDrop(extensions: string[], onAdd: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;

  const filterPaths = useCallback(
    (paths: string[]) =>
      paths.filter((path) => {
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        return extensions.includes(ext);
      }),
    [extensions]
  );

  const handleBrowse = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const valid = filterPaths(paths);
    if (valid.length) onAddRef.current(valid);
  }, [extensions, filterPaths]);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    win
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          setIsDragging(false);
          const paths: string[] = (event.payload as { paths?: string[] }).paths ?? [];
          const valid = filterPaths(paths);
          if (valid.length) onAddRef.current(valid);
        } else if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [filterPaths]);

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    if (!dropRef.current?.contains(event.relatedTarget as Node)) setIsDragging(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  return {
    isDragging,
    dropRef,
    handleBrowse,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
