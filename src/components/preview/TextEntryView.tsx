import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiReadFileBytes } from "../../services/tauriApi";

const MAX_SHOWN = 512 * 1024;

function decode(bytes: Uint8Array): { text: string; encoding: string } | null {
  const probe = bytes.subarray(0, 4096);
  const isUtf16 = (probe[0] === 0xff && probe[1] === 0xfe) || (probe[0] === 0xfe && probe[1] === 0xff);
  if (!isUtf16 && probe.includes(0)) return null; // binary
  const body = bytes.subarray(0, MAX_SHOWN);
  if (isUtf16) {
    return { text: new TextDecoder(probe[0] === 0xff ? "utf-16le" : "utf-16be").decode(body), encoding: "UTF-16" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "UTF-8" };
  } catch {
    // A multibyte char cut at the limit also lands here; legacy Korean text is CP949 anyway.
    return { text: new TextDecoder("euc-kr").decode(body), encoding: "CP949" };
  }
}

/** Plain text/code preview for a zip entry (bytes come through the zip:// path routing). */
export const TextEntryView: React.FC<{ path: string }> = ({ path }) => {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "binary" }
    | { kind: "text"; text: string; encoding: string; truncated: boolean }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    apiReadFileBytes(path)
      .then((bytes) => {
        if (cancelled) return;
        const decoded = decode(bytes);
        if (!decoded) setState({ kind: "binary" });
        else setState({ kind: "text", ...decoded, truncated: bytes.length > MAX_SHOWN });
      })
      .catch((err) => {
        if (cancelled) return;
        const text = String(err);
        setState({
          kind: "error",
          message: text.includes("SOURCE_TOO_LARGE")
            ? "항목이 미리보기 크기 제한(150MB)을 초과했습니다."
            : text.replace(/^[A-Z_]+:\s*/, ""),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (state.kind === "loading") {
    return (
      <div className="preview-message">
        <RefreshCw size={16} className="spin-anim" />
        <span>불러오는 중…</span>
      </div>
    );
  }
  if (state.kind === "error") return <div className="preview-message preview-message--error">{state.message}</div>;
  if (state.kind === "binary") {
    return <div className="preview-message">텍스트가 아닌 파일이라 미리볼 수 없습니다. 압축을 풀어서 확인해 주세요.</div>;
  }
  return (
    <div className="text-entry">
      {state.truncated && <div className="preview-message preview-message--warning">앞부분만 표시합니다.</div>}
      <pre className="preview-code-block">{state.text}</pre>
      <span className="encoding-badge text-entry-badge">{state.encoding}</span>
    </div>
  );
};
