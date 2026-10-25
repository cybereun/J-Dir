import React, { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Check, FileText, Folder, FolderOpen, PackageOpen, RefreshCw, Search } from "lucide-react";
import { FileEntry, ZipEntryInfo, ZipListing } from "../../types/jdir";
import { apiOpenInExplorer, apiZipExtract, apiZipList, zipEntryUri } from "../../services/tauriApi";
import { formatBytes } from "../../utils/colorFilter";
import { fileExt, previewKindOf } from "../../utils/docKinds";
import { DocumentPreview } from "./DocumentPreview";
import { ImageView } from "./ImageView";
import { TextEntryView } from "./TextEntryView";

function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}

function baseName(name: string): string {
  const trimmed = name.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function depthOf(name: string): number {
  return name.replace(/\/+$/, "").split("/").length - 1;
}

interface ExtractState {
  /** null = all entries */
  indices: number[] | null;
  destDir: string;
}

export const ZipView: React.FC<{ entry: FileEntry }> = ({ entry }) => {
  const [listing, setListing] = useState<ZipListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ZipEntryInfo | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<ExtractState | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; folder?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setListing(null);
    setActive(null);
    setChecked(new Set());
    setPending(null);
    setResult(null);
    setQuery("");
    apiZipList(entry.path)
      .then((l) => !cancelled && setListing(l))
      .catch((err) => !cancelled && setError(String(err).replace(/^[A-Z_]+:\s*/, "")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [entry.path, entry.modifiedMs]);

  const visible = useMemo(() => {
    if (!listing) return [];
    const q = query.trim().toLowerCase();
    return q ? listing.entries.filter((e) => e.name.toLowerCase().includes(q)) : listing.entries;
  }, [listing, query]);

  const toggle = (index: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const askExtract = (indices: number[] | null) => {
    setResult(null);
    setPending({ indices, destDir: parentDir(entry.path) });
  };

  const pickFolder = async () => {
    try {
      const picked = await openDialog({ directory: true, multiple: false, defaultPath: pending?.destDir });
      if (typeof picked === "string" && pending) setPending({ ...pending, destDir: picked });
    } catch {
      /* dialog dismissed or unavailable */
    }
  };

  const runExtract = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const folder = await apiZipExtract(entry.path, pending.destDir, pending.indices);
      setResult({ ok: true, text: "압축을 풀었습니다.", folder });
      setPending(null);
    } catch (err) {
      setResult({ ok: false, text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const previewFor = (e: ZipEntryInfo) => {
    const name = baseName(e.name);
    const virtual: FileEntry = {
      name,
      path: zipEntryUri(entry.path, e.index),
      isDir: false,
      isHidden: false,
      isSystem: false,
      isReadonly: true,
      size: e.size,
      modifiedMs: entry.modifiedMs,
      createdMs: entry.modifiedMs,
      extension: fileExt(name),
      fileType: fileExt(name).toUpperCase(),
    };
    if (e.encrypted) {
      return <div className="preview-message preview-message--warning">암호로 보호된 항목은 미리볼 수 없습니다.</div>;
    }
    switch (previewKindOf(name)) {
      case "image":
        return <ImageView path={virtual.path} name={name} key={virtual.path} />;
      case "layout-doc":
        return <DocumentPreview entry={virtual} hasLayout key={virtual.path} />;
      case "text-doc":
        return <DocumentPreview entry={virtual} hasLayout={false} key={virtual.path} />;
      case "audio":
      case "video":
        return (
          <div className="preview-message">압축 안의 음악·동영상은 미리보지 않습니다. 압축을 풀어서 확인해 주세요.</div>
        );
      case "archive":
        return <div className="preview-message">압축 안의 압축 파일은 미리보지 않습니다.</div>;
      default:
        return <TextEntryView path={virtual.path} key={virtual.path} />;
    }
  };

  if (loading) {
    return (
      <div className="preview-message">
        <RefreshCw size={16} className="spin-anim" />
        <span>압축 파일 목록을 읽는 중…</span>
      </div>
    );
  }
  if (error) return <div className="preview-message preview-message--error">{error}</div>;
  if (!listing) return null;

  const ratio =
    listing.totalSize > 0 ? Math.max(0, Math.round((1 - listing.totalCompressed / listing.totalSize) * 100)) : 0;
  const files = listing.entries.filter((e) => !e.isDir);
  const checkedCount = checked.size;

  return (
    <div className="zip-view">
      <div className="zip-summary">
        <PackageOpen size={14} />
        <span>
          파일 {listing.totalFiles.toLocaleString()}개 · {formatBytes(listing.totalSize)} → {formatBytes(listing.totalCompressed)}
          {listing.totalSize > 0 && ` (${ratio}% 압축)`}
        </span>
      </div>

      <div className="zip-toolbar">
        <div className="zip-search">
          <Search size={12} />
          <input value={query} placeholder="목록에서 찾기" onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="mini-ghost-btn" onClick={() => askExtract(null)} title="압축 파일 전체를 풉니다">
          전체 풀기
        </button>
        <button
          type="button"
          className="mini-ghost-btn"
          disabled={checkedCount === 0}
          onClick={() => askExtract([...checked])}
          title="체크한 항목만 풉니다"
        >
          선택 풀기{checkedCount > 0 ? ` (${checkedCount})` : ""}
        </button>
      </div>

      {pending && (
        <div className="zip-confirm">
          <div>
            풀 대상: <b>{pending.indices ? `선택한 ${pending.indices.length}개 항목` : "압축 파일 전체"}</b>
            <br />
            풀 위치 (이 안에 <b>새 폴더</b>가 만들어집니다):
          </div>
          <div className="zip-confirm-path">{pending.destDir}</div>
          <div className="zip-confirm-actions">
            <button type="button" className="mini-primary-btn" disabled={busy} onClick={() => void runExtract()}>
              {busy ? "푸는 중…" : "풀기"}
            </button>
            <button type="button" className="mini-ghost-btn" disabled={busy} onClick={() => void pickFolder()}>
              다른 위치…
            </button>
            <button type="button" className="mini-ghost-btn" disabled={busy} onClick={() => setPending(null)}>
              취소
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`zip-result ${result.ok ? "ok" : "err"}`}>
          {result.ok ? <Check size={13} /> : null}
          <span>{result.text}</span>
          {result.folder && (
            <button type="button" className="mini-ghost-btn" onClick={() => void apiOpenInExplorer(result.folder!)}>
              <FolderOpen size={12} /> 폴더 열기
            </button>
          )}
        </div>
      )}

      <div className="zip-list" role="list">
        {visible.map((e) => (
          <div
            key={e.index}
            role="listitem"
            className={`zip-row ${active?.index === e.index ? "active" : ""}`}
            onClick={() => !e.isDir && setActive(e)}
            style={{ paddingLeft: 8 + depthOf(e.name) * 14 }}
          >
            {!e.isDir ? (
              <input
                type="checkbox"
                checked={checked.has(e.index)}
                onClick={(ev) => ev.stopPropagation()}
                onChange={() => toggle(e.index)}
              />
            ) : (
              <span className="zip-check-gap" />
            )}
            {e.isDir ? <Folder size={13} className="zip-ico dir" /> : <FileText size={13} className="zip-ico" />}
            <span className="zip-name" title={e.name}>
              {baseName(e.name) || e.name}
              {e.encrypted && " 🔒"}
            </span>
            <span className="zip-size">{e.isDir ? "" : formatBytes(e.size)}</span>
            <span className="zip-date">{e.modified ?? ""}</span>
          </div>
        ))}
        {visible.length === 0 && <div className="doc-empty" style={{ padding: 12 }}>일치하는 항목이 없습니다.</div>}
        {listing.truncated && (
          <div className="preview-message preview-message--warning">
            항목이 많아 앞의 {listing.entries.length.toLocaleString()}개만 표시합니다 (전체 {listing.totalEntries.toLocaleString()}개).
          </div>
        )}
      </div>

      <div className="zip-preview">
        {active ? (
          <>
            <div className="zip-preview-title" title={active.name}>
              {active.name}
            </div>
            <div className="zip-preview-body">{previewFor(active)}</div>
          </>
        ) : (
          <div className="preview-message">
            {files.length > 0 ? "목록에서 파일을 클릭하면 압축을 풀지 않고 내용을 볼 수 있습니다." : "파일이 없는 압축 파일입니다."}
          </div>
        )}
      </div>
    </div>
  );
};
