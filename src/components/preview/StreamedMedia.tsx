import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiStreamUrl } from "../../services/tauriApi";

interface StreamedMediaProps {
  path: string;
  unsupportedMessage: string;
  children: (url: string, onError: () => void) => React.ReactNode;
}

/** Resolves a streamable URL for a local media file and renders it via the render prop. */
export const StreamedMedia: React.FC<StreamedMediaProps> = ({ path, unsupportedMessage, children }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    apiStreamUrl(path)
      .then((u) => !cancelled && setUrl(u))
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (error) return <div className="preview-message preview-message--error">{error}</div>;
  if (!url) {
    return (
      <div className="preview-message">
        <RefreshCw size={16} className="spin-anim" />
        <span>불러오는 중…</span>
      </div>
    );
  }
  return <>{children(url, () => setError(unsupportedMessage))}</>;
};
