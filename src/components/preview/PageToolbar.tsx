import React, { useEffect, useState } from "react";
import { Hand, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Maximize, ZoomIn, ZoomOut } from "lucide-react";

interface PageToolbarProps {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  fitWidth: boolean;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomLabel: string;
  handMode?: boolean;
  onToggleHand?: () => void;
}

export const PageToolbar: React.FC<PageToolbarProps> = ({
  page, pageCount, onPage, fitWidth, onFit, onZoomIn, onZoomOut, zoomLabel, handMode, onToggleHand,
}) => {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onPage(Math.min(pageCount, Math.max(1, n)));
    else setDraft(String(page));
  };

  return (
    <div className="page-toolbar">
      <button type="button" className="mini-ghost-btn" title="첫 페이지" disabled={page <= 1} onClick={() => onPage(1)}>
        <ChevronsLeft size={13} />
      </button>
      <button type="button" className="mini-ghost-btn" title="이전 페이지 (←, PageUp)" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={13} />
      </button>
      <span className="page-indicator">
        <input
          className="page-input"
          value={draft}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
          }}
        />
        <span>/ {pageCount}</span>
      </span>
      <button type="button" className="mini-ghost-btn" title="다음 페이지 (→, PageDown)" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        <ChevronRight size={13} />
      </button>
      <button type="button" className="mini-ghost-btn" title="마지막 페이지" disabled={page >= pageCount} onClick={() => onPage(pageCount)}>
        <ChevronsRight size={13} />
      </button>
      <span className="page-toolbar-sep" />
      <button type="button" className="mini-ghost-btn" title="축소" onClick={onZoomOut}>
        <ZoomOut size={13} />
      </button>
      <span className="page-zoom-label">{zoomLabel}</span>
      <button type="button" className="mini-ghost-btn" title="확대" onClick={onZoomIn}>
        <ZoomIn size={13} />
      </button>
      <button type="button" className={`mini-ghost-btn ${fitWidth ? "is-on" : ""}`} title="너비 맞춤" onClick={onFit}>
        <Maximize size={13} />
      </button>
      {onToggleHand && (
        <button
          type="button"
          className={`mini-ghost-btn ${handMode ? "is-on" : ""}`}
          title="손바닥 이동 모드 — 글자 위에서도 드래그로 이동 (Space 키를 누른 채 드래그해도 됩니다)"
          onClick={onToggleHand}
        >
          <Hand size={13} />
        </button>
      )}
    </div>
  );
};

/** Arrow / PageUp / PageDown paging shared by the page-based viewers. */
export function pagingKeyHandler(page: number, pageCount: number, onPage: (p: number) => void) {
  return (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      onPage(Math.min(pageCount, page + 1));
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      onPage(Math.max(1, page - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      onPage(1);
    } else if (e.key === "End") {
      e.preventDefault();
      onPage(pageCount);
    }
  };
}
