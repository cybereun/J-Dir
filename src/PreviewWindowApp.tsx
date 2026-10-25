import React, { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { FileEntry } from "./types/jdir";
import { PreviewPanel } from "./components/PreviewPanel";
import { PREVIEW_EVENTS, PreviewEntryPayload, WIN_RECT_KEY } from "./utils/previewWindow";

/** Root of the detached preview OS window (loaded via index.html?preview=1). */
export const PreviewWindowApp: React.FC = () => {
  const [entry, setEntry] = useState<FileEntry | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    document.title = entry ? `미리보기 — ${entry.name}` : "J-Dir 미리보기";
  }, [entry]);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    listen<PreviewEntryPayload>(PREVIEW_EVENTS.entry, (ev) => {
      setEntry(ev.payload.entry);
      setTheme(ev.payload.theme);
    }).then((fn) => {
      if (cancelled) fn();
      else {
        off = fn;
        void emit(PREVIEW_EVENTS.ready);
      }
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  // Remember where the user put the window; the OS window offers no DOM move event, so poll cheaply.
  useEffect(() => {
    let last = "";
    const save = () => {
      const rect = { x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight };
      const text = JSON.stringify(rect);
      if (text === last || rect.w < 100) return;
      last = text;
      try {
        localStorage.setItem(WIN_RECT_KEY, text);
      } catch {
        /* storage unavailable */
      }
    };
    const timer = window.setInterval(save, 800);
    window.addEventListener("beforeunload", save);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", save);
    };
  }, []);

  return (
    <div className={`jdir-app-root theme-${theme} preview-window-root`}>
      <PreviewPanel selectedEntry={entry} mode="window" onToggleMode={() => void emit(PREVIEW_EVENTS.dock)} />
    </div>
  );
};
