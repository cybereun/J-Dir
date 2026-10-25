import React, { useCallback, useEffect, useState } from "react";
import { FileText, LayoutTemplate, RefreshCw } from "lucide-react";
import { FileEntry, ParsedDocument } from "../../types/jdir";
import { fileExt } from "../../utils/docKinds";
import { describeParseError, parseDocumentCached } from "./ParseCache";
import { DocumentTextView } from "./DocumentTextView";
import { HwpLayoutView } from "./HwpLayoutView";
import { PdfLayoutView } from "./PdfLayoutView";

type Mode = "layout" | "text";

interface DocumentPreviewProps {
  entry: FileEntry;
  /** pdf/hwp/hwpx can show the original layout; other office formats show parsed text only. */
  hasLayout: boolean;
  /** Open on the parsed-text tab (used by search results so matches are visible). */
  startMode?: Mode;
  highlight?: string;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ entry, hasLayout, startMode, highlight }) => {
  const ext = fileExt(entry.name);
  const [mode, setMode] = useState<Mode>(startMode ?? (hasLayout ? "layout" : "text"));
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [layoutNote, setLayoutNote] = useState<string | null>(null);

  useEffect(() => {
    setMode(startMode ?? (hasLayout ? "layout" : "text"));
    setDoc(null);
    setParseError(null);
    setLayoutNote(null);
  }, [entry.path, entry.modifiedMs, hasLayout, startMode]);

  const needText = mode === "text";
  useEffect(() => {
    if (!needText) return;
    let cancelled = false;
    setParsing(true);
    setParseError(null);
    parseDocumentCached(entry.path, entry.modifiedMs)
      .then((d) => !cancelled && setDoc(d))
      .catch((err) => !cancelled && setParseError(describeParseError(err)))
      .finally(() => !cancelled && setParsing(false));
    return () => {
      cancelled = true;
    };
  }, [needText, entry.path, entry.modifiedMs]);

  const onLayoutUnsupported = useCallback((reason: string) => {
    setLayoutNote(`원본 레이아웃을 표시할 수 없어 문서 텍스트로 보여줍니다. (${reason})`);
    setMode("text");
  }, []);

  return (
    <div className="doc-preview">
      {hasLayout && (
        <div className="preview-mode-tabs">
          <button
            type="button"
            className={`preview-tab-btn ${mode === "layout" ? "active" : ""}`}
            onClick={() => setMode("layout")}
          >
            <LayoutTemplate size={12} />
            <span>원본 레이아웃</span>
          </button>
          <button
            type="button"
            className={`preview-tab-btn ${mode === "text" ? "active" : ""}`}
            onClick={() => setMode("text")}
          >
            <FileText size={12} />
            <span>문서 텍스트</span>
          </button>
        </div>
      )}

      <div className="doc-preview-body">
        {mode === "layout" && ext === "pdf" && <PdfLayoutView path={entry.path} key={entry.path + entry.modifiedMs} />}
        {mode === "layout" && (ext === "hwp" || ext === "hwpx") && (
          <HwpLayoutView
            path={entry.path}
            key={entry.path + entry.modifiedMs}
            onUnsupported={onLayoutUnsupported}
          />
        )}

        {mode === "text" && (
          <>
            {layoutNote && <div className="preview-message preview-message--warning">{layoutNote}</div>}
            {parsing && (
              <div className="preview-message">
                <RefreshCw size={16} className="spin-anim" />
                <span>문서 텍스트를 분석하는 중…</span>
              </div>
            )}
            {parseError && <div className="preview-message preview-message--error">{parseError}</div>}
            {!parsing && doc && <DocumentTextView doc={doc} highlight={highlight} />}
          </>
        )}
      </div>
    </div>
  );
};
