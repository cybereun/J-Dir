import React, { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiReadFileBytes } from "../../services/tauriApi";
import { PageToolbar, pagingKeyHandler } from "./PageToolbar";
import { usePanScroll } from "./usePanScroll";

const MAX_CANVAS_DIMENSION = 8192;
const MAX_CANVAS_PIXELS = 16_000_000;

interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number }> }>;
  render(o: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<unknown>; cancel?: () => void };
  cleanup?: () => void;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
}

interface TextItem {
  text: string;
  left: number;
  top: number;
  width: number;
  fontSize: number;
}

function pdfErrorMessage(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes("SOURCE_TOO_LARGE")) return "PDF가 미리보기 크기 제한(150MB)을 초과했습니다.";
  if (name === "PasswordException") return "암호화된 PDF는 원본 레이아웃으로 미리볼 수 없습니다.";
  if (name === "InvalidPDFException" || name === "FormatError") return "손상되었거나 올바르지 않은 PDF입니다.";
  return text || "PDF를 불러오지 못했습니다.";
}

export const PdfLayoutView: React.FC<{ path: string }> = ({ path }) => {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pan = usePanScroll(scrollRef, { textSelector: ".pdf-text-layer > span" });
  const { className: panClass, ...panRest } = pan.panProps;
  const [doc, setDoc] = useState<PdfDocumentLike | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [effectiveScale, setEffectiveScale] = useState(1);

  useEffect(() => {
    let active = true;
    let task: { destroy?: () => Promise<void> | void } | null = null;
    setLoading(true);
    setError(null);
    setDoc(null);
    setPage(1);
    setTextItems([]);
    (async () => {
      const bytes = await apiReadFileBytes(path);
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const loadingTask = pdfjs.getDocument({ data: bytes, disableAutoFetch: true, disableStream: true });
      task = loadingTask as unknown as typeof task;
      const loaded = (await loadingTask.promise) as unknown as PdfDocumentLike;
      if (active) setDoc(loaded);
    })()
      .catch((err) => active && setError(pdfErrorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      void task?.destroy?.();
    };
  }, [path]);

  useEffect(() => {
    const el = container.current;
    if (!doc || !el || typeof ResizeObserver !== "function") return;
    let timer: number | undefined;
    const update = (w: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setWidth(Math.max(160, Math.floor(w))), 60);
    };
    update(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (Number.isFinite(w)) update(w);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    let active = true;
    let renderTask: { promise: Promise<unknown>; cancel?: () => void } | null = null;
    let pdfPage: PdfPageLike | null = null;
    (async () => {
      pdfPage = await doc.getPage(page);
      const target = canvas.current;
      const ctx = target?.getContext("2d");
      if (!active || !target || !ctx) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const available = Math.max(160, (width || container.current?.clientWidth || base.width) - 44);
      const scale = fitWidth ? Math.min(4, Math.max(0.2, available / base.width)) : zoom;
      const viewport = pdfPage.getViewport({ scale });
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.floor(viewport.width * ratio);
      const ph = Math.floor(viewport.height * ratio);
      if (pw > MAX_CANVAS_DIMENSION || ph > MAX_CANVAS_DIMENSION || pw * ph > MAX_CANVAS_PIXELS) {
        throw new Error("페이지가 안전한 표시 한도를 초과했습니다. 축소해 주세요.");
      }
      setError(null);
      target.width = pw;
      target.height = ph;
      target.style.width = `${Math.floor(viewport.width)}px`;
      target.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = pdfPage.render({ canvas: target, canvasContext: ctx, viewport });
      await renderTask.promise;
      const content = await pdfPage.getTextContent();
      if (!active) return;
      setEffectiveScale(scale);
      setTextItems(
        content.items.flatMap((item) => {
          const t = item.transform;
          const text = item.str ?? "";
          if (!t || t.length < 6 || !text) return [];
          const fontSize = Math.max(6, Math.hypot(t[2] ?? 0, t[3] ?? 0) * scale);
          return [{
            text,
            left: (t[4] ?? 0) * scale,
            top: viewport.height - (t[5] ?? 0) * scale - fontSize,
            width: Math.max(1, (item.width ?? 0) * scale),
            fontSize,
          }];
        }),
      );
    })().catch((err) => {
      if (!active || (err as { name?: string })?.name === "RenderingCancelledException") return;
      setError(pdfErrorMessage(err));
    });
    return () => {
      active = false;
      renderTask?.cancel?.();
      pdfPage?.cleanup?.();
    };
  }, [doc, page, width, fitWidth, zoom]);

  if (loading) return <div className="preview-message">PDF 불러오는 중…</div>;
  if (error && !doc) return <div className="preview-message preview-message--error">{error}</div>;
  if (!doc) return null;

  const goto = (p: number) => {
    setTextItems([]);
    setPage(Math.min(doc.numPages, Math.max(1, p)));
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  };
  const zoomBy = (delta: number) => {
    const current = fitWidth ? effectiveScale : zoom;
    setZoom(Math.min(4, Math.max(0.25, current + delta)));
    setFitWidth(false);
  };

  return (
    <div className="layout-view" ref={container} tabIndex={0} onKeyDown={pagingKeyHandler(page, doc.numPages, goto)}>
      <PageToolbar
        page={page}
        pageCount={doc.numPages}
        onPage={goto}
        fitWidth={fitWidth}
        onFit={() => setFitWidth(true)}
        onZoomIn={() => zoomBy(0.25)}
        onZoomOut={() => zoomBy(-0.25)}
        zoomLabel={`${Math.round((fitWidth ? effectiveScale : zoom) * 100)}%`}
        handMode={pan.handMode}
        onToggleHand={pan.toggleHand}
      />
      {error && <div className="preview-message preview-message--error">{error}</div>}
      <div ref={scrollRef} {...panRest} className={`layout-scroll pdf-scroll ${panClass}`}>
        <div className="pdf-page-surface">
          <canvas ref={canvas} />
          <div className="pdf-text-layer">
            {textItems.map((item, i) => (
              <span key={i} style={{ left: item.left, top: item.top, width: item.width, fontSize: item.fontSize }}>
                {item.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
