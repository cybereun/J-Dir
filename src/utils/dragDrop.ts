import type React from "react";
import { getDriveRoot } from "./colorFilter";
import { apiStartNativeDrag, isTauriRuntimeAvailable } from "../services/tauriApi";

export const DND_MIME = "application/x-jdir-items";

export type DropMode = "copy" | "move";

// dataTransfer contents are unreadable during dragover, so remember what is being dragged.
// Native (OS) drags carry real files instead of our custom payload, so drops back onto J-Dir's own
// panes are recognised through this remembered state as well.
let currentDragPaths: string[] = [];
let currentDragSourcePane = 0;

type DragLike = Pick<React.DragEvent, "dataTransfer">;

export function beginDrag(e: React.DragEvent, sourcePaneIndex: number, paths: string[]): void {
  currentDragPaths = paths;
  currentDragSourcePane = sourcePaneIndex;
  if (isTauriRuntimeAvailable()) {
    // Hand the drag to Windows so other programs receive the actual files (browser upload areas,
    // messengers, desktop, Explorer folders). It also works for drops onto J-Dir's own panes.
    e.preventDefault();
    void apiStartNativeDrag(paths)
      .catch(() => undefined)
      .finally(() => endDrag());
    return;
  }
  e.dataTransfer.setData(DND_MIME, JSON.stringify({ sourcePaneIndex, paths }));
  e.dataTransfer.setData("text/plain", paths.join("\n"));
  e.dataTransfer.effectAllowed = "copyMove";
}

export function endDrag(): void {
  currentDragPaths = [];
}

export function isJdirDrag(e: DragLike): boolean {
  return currentDragPaths.length > 0 || Array.from(e.dataTransfer.types).includes(DND_MIME);
}

export function readDrag(e: DragLike): { sourcePaneIndex: number; paths: string[] } | null {
  if (currentDragPaths.length > 0) {
    return { sourcePaneIndex: currentDragSourcePane, paths: [...currentDragPaths] };
  }
  try {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sourcePaneIndex: number; paths: string[] };
    return parsed.paths?.length ? parsed : null;
  } catch {
    return null;
  }
}

function normalize(p: string): string {
  return p.replace(/[\\/]+$/, "").toLowerCase();
}

export function isSameOrInside(candidate: string, ancestor: string): boolean {
  const c = normalize(candidate);
  const a = normalize(ancestor);
  return c === a || c.startsWith(a + "\\");
}

/**
 * Explorer-style default: Ctrl = copy, Shift = move,
 * otherwise move within the same drive and copy across drives.
 */
export function dropModeFor(
  e: Pick<React.DragEvent, "ctrlKey" | "shiftKey">,
  destPath: string
): DropMode {
  if (e.ctrlKey) return "copy";
  if (e.shiftKey) return "move";
  const first = currentDragPaths[0];
  if (first && getDriveRoot(first).toLowerCase() === getDriveRoot(destPath).toLowerCase()) {
    return "move";
  }
  return "copy";
}

export function dragIncludesDestination(paths: string[], destPath: string): boolean {
  return paths.some((p) => isSameOrInside(destPath, p));
}

/** Same rule as [`dropModeFor`] for drops reported by the OS (no DOM event, paths known up front). */
export function dropModeForPaths(
  keys: { ctrl: boolean; shift: boolean },
  paths: string[],
  destPath: string
): DropMode {
  if (keys.ctrl) return "copy";
  if (keys.shift) return "move";
  const first = paths[0];
  if (first && getDriveRoot(first).toLowerCase() === getDriveRoot(destPath).toLowerCase()) return "move";
  return "copy";
}
