import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { apiReadFileBytes } from "../../services/tauriApi";
import { fileExt, imageMime } from "../../utils/docKinds";
import { usePanScroll } from "./usePanScroll";

export const ImageView: React.FC<{ path: string; name: string }> = ({ path, name }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const stageRef = useRef<HTMLDivElement>(null);
  const pan = usePanScroll(stageRef);
  const { className: panClass, ...panRest } = pan.panProps;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    setZoom("fit");
    apiReadFileBytes(path)
      .then((bytes) => {
        if (cancelled) return;
        const mime = imageMime(fileExt(name)) ?? "application/octet-stream";
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        const text = String(err);
        setError(text.includes("SOURCE_TOO_LARGE") ? "이미지가 미리보기 크기 제한(150MB)을 초과했습니다." : text);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, name]);

  if (error) return <div className="preview-message preview-message--error">{error}</div>;
  if (!url) {
    return (
      <div className="preview-message">
        <RefreshCw size={16} className="spin-anim" />
        <span>이미지 불러오는 중…</span>
      </div>
    );
  }

  const step = (delta: number) =>
    setZoom((z) => Math.min(400, Math.max(10, (z === "fit" ? 100 : z) + delta)));

  return (
    <div className="preview-image-box">
      <div className="image-zoom-toolbar">
        <button type="button" className="mini-ghost-btn" onClick={() => step(-25)} title="축소">
          <ZoomOut size={12} />
        </button>
        <span>{zoom === "fit" ? "맞춤" : `${zoom}%`}</span>
        <button type="button" className="mini-ghost-btn" onClick={() => step(25)} title="확대">
          <ZoomIn size={12} />
        </button>
        <button type="button" className="mini-ghost-btn" onClick={() => setZoom("fit")}>
          맞춤
        </button>
        <button type="button" className="mini-ghost-btn" onClick={() => setZoom(100)}>
          100%
        </button>
      </div>
      <div ref={stageRef} {...panRest} className={`image-scroll-stage ${panClass}`}>
        <img
          src={url}
          alt={name}
          draggable={false}
          style={zoom === "fit" ? { maxWidth: "100%", maxHeight: "100%" } : { width: `${zoom}%`, maxWidth: "none" }}
        />
      </div>
    </div>
  );
};
