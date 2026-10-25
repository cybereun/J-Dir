import { FileEntry } from "../types/jdir";

export const PREVIEW_EVENTS = {
  /** main -> preview window: the entry to show */
  entry: "jdir://preview-entry",
  /** preview window -> main: window is listening, send the current entry */
  ready: "jdir://preview-ready",
  /** preview window -> main: user asked to return to the sidebar */
  dock: "jdir://preview-dock",
  /** backend -> all: the preview window was destroyed */
  closed: "jdir://preview-closed",
} as const;

export interface PreviewEntryPayload {
  entry: FileEntry | null;
  theme: "dark" | "light";
}

export const WIN_RECT_KEY = "jdir.previewWinRect.v1";
export const PREVIEW_MODE_KEY = "jdir.previewMode";

export interface SavedWinRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function loadWinRect(): SavedWinRect | null {
  try {
    const raw = localStorage.getItem(WIN_RECT_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as SavedWinRect;
    return [r.x, r.y, r.w, r.h].every(Number.isFinite) ? r : null;
  } catch {
    return null;
  }
}
