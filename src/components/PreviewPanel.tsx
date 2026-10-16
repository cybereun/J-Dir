import React, { useEffect, useState } from "react";
import { Binary, Eye, FileText, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { FileEntry, FilePreviewData } from "../types/jdir";
import { apiReadFilePreview } from "../services/tauriApi";
import { formatBytes, formatDate } from "../utils/colorFilter";
import { EntryGraphic3DIcon, Folder3DIcon } from "./GraphicIcons";

interface PreviewPanelProps {
  selectedEntry: FileEntry | null;
  onClose: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({ selectedEntry, onClose }) => {
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showHexTab, setShowHexTab] = useState<boolean>(false);
  const [imgZoom, setImgZoom] = useState<number>(100);

  useEffect(() => {
    if (!selectedEntry) {
      setPreviewData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setImgZoom(100);

    apiReadFilePreview(selectedEntry.path, 65536)
      .then((data) => {
        if (!cancelled) {
          setPreviewData(data);
          setShowHexTab(data.previewKind === "hex");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setPreviewData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEntry]);

  return (
    <aside className="preview-panel">
      <div className="preview-header">
        <div className="preview-title">
          <Eye size={14} />
          <span>미리보기 (Vorschau)</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} title="미리보기 닫기">
          <X size={14} />
        </button>
      </div>

      {!selectedEntry ? (
        <div className="preview-empty">
          <Folder3DIcon size={38} open />
          <p>파일이나 폴더를 클릭하면 즉시 내용을 미리 봅니다.</p>
          <span className="preview-hint">
            이미지, 텍스트/코드, Q-Dir.ini / .qdr 설정, 바이너리 Hex 덤프 지원
          </span>
        </div>
      ) : (
        <div className="preview-content-wrap">
          <div className="preview-meta-card">
            <div className="preview-filename" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <EntryGraphic3DIcon entry={selectedEntry} size={18} />
              <span>{selectedEntry.name}</span>
            </div>
            <div className="preview-meta-row">
              <span>유형: {selectedEntry.fileType}</span>
              {!selectedEntry.isDir && <span>크기: {formatBytes(selectedEntry.size)}</span>}
            </div>
            <div className="preview-meta-row">
              <span>수정일: {formatDate(selectedEntry.modifiedMs)}</span>
              {previewData?.encoding && (
                <span className="encoding-badge">{previewData.encoding}</span>
              )}
            </div>
            <div className="preview-path-text">{selectedEntry.path}</div>
          </div>

          {previewData && (previewData.textContent || previewData.hexDump) && (
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
              <div className="preview-loading">
                <RefreshCw size={18} className="spin-anim" />
                <span>미리보기 데이터 읽는 중...</span>
              </div>
            )}

            {error && <div className="preview-error">{error}</div>}

            {!loading && previewData && (
              <>
                {previewData.previewKind === "directory" && (
                  <div className="preview-dir-box">
                    <Folder3DIcon size={44} open />
                    <p>{previewData.textContent}</p>
                  </div>
                )}

                {previewData.previewKind === "image" && previewData.dataUrl && (
                  <div className="preview-image-box">
                    <div className="image-zoom-toolbar">
                      <button
                        type="button"
                        className="mini-ghost-btn"
                        onClick={() => setImgZoom((z) => Math.max(25, z - 25))}
                      >
                        <ZoomOut size={12} />
                      </button>
                      <span>{imgZoom}%</span>
                      <button
                        type="button"
                        className="mini-ghost-btn"
                        onClick={() => setImgZoom((z) => Math.min(300, z + 25))}
                      >
                        <ZoomIn size={12} />
                      </button>
                      <button
                        type="button"
                        className="mini-ghost-btn"
                        onClick={() => setImgZoom(100)}
                      >
                        100%
                      </button>
                    </div>
                    <div className="image-scroll-stage">
                      <img
                        src={previewData.dataUrl}
                        alt={previewData.name}
                        style={{ width: `${imgZoom}%` }}
                      />
                    </div>
                  </div>
                )}

                {previewData.previewKind === "text" && !showHexTab && (
                  <pre className="preview-code-block">{previewData.textContent}</pre>
                )}

                {(showHexTab || previewData.previewKind === "hex") && previewData.hexDump && (
                  <pre className="preview-hex-block">{previewData.hexDump}</pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
