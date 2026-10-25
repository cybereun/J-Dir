import React, { useEffect, useMemo, useRef, useState } from "react";
import initRhwp, { HwpDocument } from "@rhwp/core";
import wasmUrl from "@rhwp/core/rhwp_bg.wasm?url";
import { apiReadFileBytes } from "../../services/tauriApi";
import { PageToolbar, pagingKeyHandler } from "./PageToolbar";
import { usePanScroll } from "./usePanScroll";

let rhwpReady: Promise<unknown> | null = null;

function ensureRhwp(): Promise<unknown> {
  if (!rhwpReady) {
    const scope = globalThis as typeof globalThis & {
      measureTextWidth?: (font: string, text: string) => number;
    };
    let ctx: CanvasRenderingContext2D | null = null;
    let lastFont = "";
    scope.measureTextWidth = (font, text) => {
      ctx ??= document.createElement("canvas").getContext("2d");
      if (!ctx) return text.length * 8;
      if (lastFont !== font) {
        ctx.font = font;
        lastFont = font;
      }
      return ctx.measureText(text).width;
    };
    // Feed the WASM bytes directly: the Tauri protocol may not send a wasm MIME type.
    rhwpReady = fetch(new URL(wasmUrl, import.meta.url))
      .then((r) => {
        if (!r.ok) throw new Error(`HWP 렌더러(WASM)를 불러오지 못했습니다 (${r.status})`);
        return r.arrayBuffer();
      })
      .then((bytes) => initRhwp({ module_or_path: bytes }))
      .catch((err) => {
        rhwpReady = null;
        throw err;
      });
  }
  return rhwpReady;
}

interface HwpDocumentLike {
  pageCount(): number;
  renderPageSvg(pageNumber: number): string;
  free(): void;
}

function sanitizeSvg(raw: string): string {
  const parsed = new DOMParser().parseFromString(raw, "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.tagName.toLowerCase() !== "svg" || parsed.querySelector("parsererror")) {
    throw new Error("HWP 페이지 렌더링 결과가 올바르지 않습니다.");
  }
  parsed.querySelectorAll("script,foreignObject,iframe,object,embed").forEach((n) => n.remove());
  parsed.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if ((name === "href" || name.endsWith(":href")) && !attr.value.startsWith("#") && !attr.value.startsWith("data:image/")) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(svg);
}

interface HwpLayoutViewProps {
  path: string;
  /** Called when the original layout cannot be rendered so the caller can show parsed text instead. */
  onUnsupported: (reason: string) => void;
}

export const HwpLayoutView: React.FC<HwpLayoutViewProps> = ({ path, onUnsupported }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pan = usePanScroll(scrollRef);
  const { className: panClass, ...panRest } = pan.panProps;
  const [hwp, setHwp] = useState<HwpDocumentLike | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onUnsupportedRef = useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;

  useEffect(() => {
    let active = true;
    let handle: HwpDocumentLike | null = null;
    setLoading(true);
    setError(null);
    setHwp(null);
    setPage(1);
    (async () => {
      const bytes = await apiReadFileBytes(path);
      await ensureRhwp();
      handle = new HwpDocument(bytes) as unknown as HwpDocumentLike;
      if (active) setHwp(handle);
    })()
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("SOURCE_TOO_LARGE")) setError("문서가 미리보기 크기 제한(150MB)을 초과했습니다.");
        else onUnsupportedRef.current(msg);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      try {
        handle?.free();
      } catch {
        /* already freed */
      }
    };
  }, [path]);

  const rendered = useMemo(() => {
    if (!hwp) return { svg: "", error: null as string | null };
    try {
      return { svg: sanitizeSvg(hwp.renderPageSvg(page - 1)), error: null };
    } catch (err) {
      return { svg: "", error: err instanceof Error ? err.message : "페이지 렌더링에 실패했습니다." };
    }
  }, [hwp, page]);

  if (loading) return <div className="preview-message">HWP 원본 불러오는 중…</div>;
  if (error) return <div className="preview-message preview-message--error">{error}</div>;
  if (!hwp) return null;

  const pageCount = Math.max(1, hwp.pageCount());
  const goto = (p: number) => {
    setPage(Math.min(pageCount, Math.max(1, p)));
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  };
  const zoomBy = (delta: number) => {
    setZoom((z) => Math.min(3, Math.max(0.4, (fitWidth ? 1 : z) + delta)));
    setFitWidth(false);
  };

  return (
    <div className="layout-view" tabIndex={0} onKeyDown={pagingKeyHandler(page, pageCount, goto)}>
      <PageToolbar
        page={page}
        pageCount={pageCount}
        onPage={goto}
        fitWidth={fitWidth}
        onFit={() => setFitWidth(true)}
        onZoomIn={() => zoomBy(0.15)}
        onZoomOut={() => zoomBy(-0.15)}
        zoomLabel={fitWidth ? "맞춤" : `${Math.round(zoom * 100)}%`}
        handMode={pan.handMode}
        onToggleHand={pan.toggleHand}
      />
      {rendered.error && <div className="preview-message preview-message--error">{rendered.error}</div>}
      <div ref={scrollRef} {...panRest} className={`layout-scroll hwp-scroll ${panClass}`}>
        <div
          className={`hwp-page${fitWidth ? " is-fit" : ""}`}
          style={fitWidth ? undefined : { width: `${zoom * 100}%` }}
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
      </div>
    </div>
  );
};
