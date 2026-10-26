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

/** Hands the drag to Windows so other programs receive the actual files (and J-Dir's own panes too). */
export function beginNativeDrag(sourcePaneIndex: number, paths: string[], allowMove: boolean): void {
  currentDragPaths = paths;
  currentDragSourcePane = sourcePaneIndex;
  void apiStartNativeDrag(paths, allowMove)
    .catch(() => undefined)
    .finally(() => endDrag());
}

export function beginDrag(e: React.DragEvent, sourcePaneIndex: number, paths: string[]): void {
  if (isTauriRuntimeAvailable()) {
    e.preventDefault();
    beginNativeDrag(sourcePaneIndex, paths, e.shiftKey);
    return;
  }
  currentDragPaths = paths;
  currentDragSourcePane = sourcePaneIndex;
  e.dataTransfer.setData(DND_MIME, JSON.stringify({ sourcePaneIndex, paths }));
  e.dataTransfer.setData("text/plain", paths.join("\n"));
  e.dataTransfer.effectAllowed = "copyMove";
}

/**
 * Holding Shift while pressing the mouse button stops the webview from ever firing `dragstart`
 * (it treats it as "extend selection"), so Shift+drag (move) would never begin. Watch the mouse
 * ourselves and start the OS drag once the pointer has moved a few pixels.
 */
export function watchShiftDrag(e: React.MouseEvent, sourcePaneIndex: number, paths: string[]): void {
  if (e.button !== 0 || !e.shiftKey || !isTauriRuntimeAvailable()) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const cleanup = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", cleanup);
  };
  const onMove = (ev: MouseEvent) => {
    if ((ev.buttons & 1) === 0) return cleanup();
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
    cleanup();
    beginNativeDrag(sourcePaneIndex, paths, true);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", cleanup);
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
 * Plain drag = copy, Shift = move (Ctrl also copies). The same rule applies wherever the drop lands
 * inside J-Dir, regardless of which drive the files are on.
 */
export function dropModeFor(
  e: Pick<React.DragEvent, "ctrlKey" | "shiftKey">,
  _destPath: string
): DropMode {
  if (e.ctrlKey) return "copy";
  return e.shiftKey ? "move" : "copy";
}

export function dragIncludesDestination(paths: string[], destPath: string): boolean {
  return paths.some((p) => isSameOrInside(destPath, p));
}

/** Same rule as [`dropModeFor`] for drops reported by the OS (modifier keys read at drop time). */
export function dropModeForPaths(
  keys: { ctrl: boolean; shift: boolean },
  _paths: string[],
  _destPath: string
): DropMode {
  if (keys.ctrl) return "copy";
  return keys.shift ? "move" : "copy";
}
