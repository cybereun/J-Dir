import React, { useCallback, useEffect, useRef, useState } from "react";
import { Binary, Eye, ExternalLink, FileText, PanelRight, RefreshCw, X } from "lucide-react";
import { FileEntry, FilePreviewData } from "../types/jdir";
import { apiReadFilePreview } from "../services/tauriApi";
import { formatBytes, formatDate } from "../utils/colorFilter";
import { previewKindOf } from "../utils/docKinds";
import { EntryGraphic3DIcon, Folder3DIcon } from "./GraphicIcons";
import { DocumentPreview } from "./preview/DocumentPreview";
import { ImageView } from "./preview/ImageView";
import { AudioView } from "./preview/AudioView";
import { VideoView } from "./preview/VideoView";
import { ZipView } from "./preview/ZipView";
import { SearchTab } from "./search/SearchTab";

interface PreviewPanelProps {
  selectedEntry: FileEntry | null;
  /** "dock": sidebar inside the main window. "window": fills a detached OS window. */
  mode: "dock" | "window";
  onToggleMode: () => void;
  onClose?: () => void;
}

const DOCK_W_KEY = "jdir.previewDockW";
const DOCK_MIN = 260;

function loadDockWidth(): number {
  try {
    const v = Number(localStorage.getItem(DOCK_W_KEY));
    if (Number.isFinite(v) && v >= DOCK_MIN) return v;
  } catch {
    /* storage unavailable */
  }
  return 380;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({ selectedEntry, mode, onToggleMode, onClose }) => {
  const [dockWidth, setDockWidth] = useState<number>(loadDockWidth);
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showHexTab, setShowHexTab] = useState<boolean>(false);
  const [topTab, setTopTab] = useState<"preview" | "search">(() => {
    try {
      return localStorage.getItem("jdir.previewTopTab") === "search" ? "search" : "preview";
    } catch {
      return "preview";
    }
  });
  const switchTab = (tab: "preview" | "search") => {
    setTopTab(tab);
    try {
      localStorage.setItem("jdir.previewTopTab", tab);
    } catch {
      /* storage unavailable */
    }
  };

  const kind = selectedEntry && !selectedEntry.isDir ? previewKindOf(selectedEntry.name) : "other";

  const beginResize = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = dockWidth;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      let latest = startW;
      const onMove = (ev: PointerEvent) => {
        // The dock sits on the right edge, so dragging left widens it.
        latest = Math.min(Math.max(DOCK_MIN, startW + (startX - ev.clientX)), window.innerWidth * 0.8);
        setDockWidth(latest);
      };
      const onUp = (ev: PointerEvent) => {
        target.releasePointerCapture?.(ev.pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        try {
          localStorage.setItem(DOCK_W_KEY, String(Math.round(latest)));
        } catch {
          /* storage unavailable */
        }
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [dockWidth],
  );

  // Text/hex/directory previews go through the Rust reader; images and documents have their own viewers.
  useEffect(() => {
    setPreviewData(null);
    setError(null);
    if (!selectedEntry || kind === "image" || kind === "audio" || kind === "video" || kind === "archive" || kind === "layout-doc" || kind === "text-doc") {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    apiReadFilePreview(selectedEntry.path, 65536)
      .then((data) => {
        if (!cancelled) {
          setPreviewData(data);
          setShowHexTab(data.previewKind === "hex");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEntry, kind]);

  const isDock = mode === "dock";

  return (
    <aside
      className={`preview-panel ${isDock ? "docked" : "windowed"}${kind === "archive" ? " is-archive" : ""}`}
      style={isDock ? { width: dockWidth } : undefined}
    >
      {isDock && <div className="preview-dock-handle" onPointerDown={beginResize} title="드래그하여 폭 조절" />}
      <div className="preview-header">
        <div className="preview-title">
          <Eye size={14} />
          <span>미리보기</span>
        </div>
        <div className="preview-header-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleMode}
            title={isDock ? "별도 창으로 분리 (바탕화면 어디든 이동 가능)" : "사이드바로 되돌리기"}
          >
            {isDock ? <ExternalLink size={13} /> : <PanelRight size={13} />}
          </button>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} title="미리보기 닫기">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="preview-top-tabs">
        <button type="button" className={topTab === "preview" ? "active" : ""} onClick={() => switchTab("preview")}>
          미리보기
        </button>
        <button type="button" className={topTab === "search" ? "active" : ""} onClick={() => switchTab("search")}>
          검색
        </button>
      </div>

      {topTab === "search" ? (
        <SearchTab />
      ) : !selectedEntry ? (
        <div className="preview-empty">
          <Folder3DIcon size={38} open />
          <p>파일이나 폴더를 클릭하면 즉시 내용을 미리 봅니다.</p>
          <span className="preview-hint">
            이미지 · PDF · HWP/HWPX 원본 레이아웃 · DOC/XLS/PPT 문서 텍스트 · 텍스트/코드 · Hex
          </span>
        </div>
      ) : (
        <div className="preview-content-wrap">
          <div className="preview-meta-card">
            <div className="preview-filename">
              <EntryGraphic3DIcon entry={selectedEntry} size={18} />
              <span>{selectedEntry.name}</span>
            </div>
            <div className="preview-meta-row">
              <span>{selectedEntry.fileType}</span>
              {!selectedEntry.isDir && <span>{formatBytes(selectedEntry.size)}</span>}
              <span>{formatDate(selectedEntry.modifiedMs)}</span>
              {previewData?.encoding && <span className="encoding-badge">{previewData.encoding}</span>}
            </div>
          </div>

          {kind === "image" && (
            <div className="preview-viewer-body no-pad">
              <ImageView path={selectedEntry.path} name={selectedEntry.name} />
            </div>
          )}

          {kind === "archive" && (
            <div className="preview-viewer-body no-pad">
              <ZipView entry={selectedEntry} />
            </div>
          )}

          {kind === "video" && (
            <div className="preview-viewer-body no-pad">
              <VideoView path={selectedEntry.path} name={selectedEntry.name} />
            </div>
          )}

          {kind === "audio" && (
            <div className="preview-viewer-body no-pad">
              <AudioView path={selectedEntry.path} name={selectedEntry.name} />
            </div>
          )}

          {(kind === "layout-doc" || kind === "text-doc") && (
            <div className="preview-viewer-body no-pad">
              <DocumentPreview entry={selectedEntry} hasLayout={kind === "layout-doc"} />
            </div>
          )}

          {kind === "other" && (
            <>
              {previewData && (previewData.textContent || previewData.hexDump) && previewData.previewKind !== "directory" && (
                <div className="preview-mode-tabs">
                  {previewData.textContent && (
                    <button
                      type="button"
                      className={`preview-tab-btn ${!showHexTab ? "active" : ""}`}
                      onClick={() => setShowHexTab(false)}
                    >
                      <FileText size={12} />
                      <span>텍스트 / 코드</span>
                    </button>
                  )}
                  {previewData.hexDump && (
                    <button
                      type="button"
                      className={`preview-tab-btn ${showHexTab ? "active" : ""}`}
                      onClick={() => setShowHexTab(true)}
                    >
                      <Binary size={12} />
                      <span>Hex 헤더 덤프</span>
                    </button>
                  )}
                </div>
              )}

              <div className="preview-viewer-body">
                {loading && (
                  <div className="preview-message">
                    <RefreshCw size={16} className="spin-anim" />
                    <span>미리보기 데이터 읽는 중…</span>
                  </div>
                )}
                {error && <div className="preview-message preview-message--error">{error}</div>}
                {!loading && previewData && (
                  <>
                    {previewData.previewKind === "directory" && (
                      <div className="preview-dir-box">
                        <Folder3DIcon size={44} open />
                        <p>{previewData.textContent}</p>
                      </div>
                    )}
                    {previewData.previewKind === "text" && !showHexTab && (
                      <>
                        {previewData.truncated && (
                          <div className="preview-message preview-message--warning">
                            파일이 커서 앞부분만 표시합니다.
                          </div>
                        )}
                        <pre className="preview-code-block">{previewData.textContent}</pre>
                      </>
                    )}
                    {(showHexTab || previewData.previewKind === "hex") && previewData.hexDump && (
                      <pre className="preview-hex-block">{previewData.hexDump}</pre>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

    </aside>
  );
};
