import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, Search, X } from "lucide-react";
import { FileEntry } from "../types/jdir";
import {
  apiCancelJob,
  apiJobDone,
  apiSearchFiles,
  onJobProgress,
} from "../services/tauriApi";
import { formatBytes, formatDate, getParentPath } from "../utils/colorFilter";
import { EntryGraphic3DIcon } from "./GraphicIcons";

interface SearchModalProps {
  initialRoot: string;
  onOpenEntry: (entry: FileEntry) => void;
  onRevealEntry: (entry: FileEntry) => void;
  onClose: () => void;
}

const MAX_RENDERED = 1000;

function dayStart(v: string): number | undefined {
  return v ? new Date(`${v}T00:00:00`).getTime() : undefined;
}
function dayEnd(v: string): number | undefined {
  return v ? new Date(`${v}T23:59:59`).getTime() : undefined;
}
function mbToBytes(v: string): number | undefined {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1024 * 1024) : undefined;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  initialRoot,
  onOpenEntry,
  onRevealEntry,
  onClose,
}) => {
  const [root, setRoot] = useState(initialRoot);
  const [pattern, setPattern] = useState("");
  const [includeDirs, setIncludeDirs] = useState(true);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [minMb, setMinMb] = useState("");
  const [maxMb, setMaxMb] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");

  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [currentDir, setCurrentDir] = useState("");
  const [results, setResults] = useState<FileEntry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    onJobProgress((ev) => {
      if (ev.jobId === jobRef.current) {
        setScanned(ev.doneItems);
        setCurrentDir(ev.current);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
      if (jobRef.current) apiCancelJob(jobRef.current).catch(() => {});
    };
  }, []);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (running) return;
    const jobId = `search-${Date.now()}`;
    jobRef.current = jobId;
    setRunning(true);
    setError(null);
    setResults(null);
    setScanned(0);
    setCancelled(false);
    setSelected(null);
    try {
      const res = await apiSearchFiles(
        root.trim(),
        {
          pattern: pattern.trim(),
          includeDirs,
          includeHidden,
          minSize: mbToBytes(minMb),
          maxSize: mbToBytes(maxMb),
          modifiedAfterMs: dayStart(after),
          modifiedBeforeMs: dayEnd(before),
        },
        jobId
      );
      setResults(res.entries);
      setTruncated(res.truncated);
      setCancelled(res.cancelled);
      setScanned(res.scanned);
    } catch (err) {
      setError(String(err));
    } finally {
      apiJobDone(jobId).catch(() => {});
      jobRef.current = null;
      setRunning(false);
    }
  };

  const rendered = results ? results.slice(0, MAX_RENDERED) : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-lg search-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Search size={16} />
            <span>파일 검색 (하위 폴더 포함)</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body search-body">
          <form className="search-form" onSubmit={runSearch}>
            <div className="search-row">
              <label>검색어</label>
              <input
                type="text"
                value={pattern}
                autoFocus
                placeholder="예: report  /  *.jpg;*.png  /  보고서*"
                onChange={(e) => setPattern(e.target.value)}
              />
            </div>
            <div className="search-row">
              <label>시작 폴더</label>
              <input type="text" value={root} onChange={(e) => setRoot(e.target.value)} />
            </div>
            <div className="search-row search-row-wrap">
              <label>크기(MB)</label>
              <input type="number" min="0" placeholder="최소" value={minMb} onChange={(e) => setMinMb(e.target.value)} />
              <span>~</span>
              <input type="number" min="0" placeholder="최대" value={maxMb} onChange={(e) => setMaxMb(e.target.value)} />
              <label>수정일</label>
              <input type="date" value={after} onChange={(e) => setAfter(e.target.value)} />
              <span>~</span>
              <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} />
            </div>
            <div className="search-row">
              <label className="search-check">
                <input type="checkbox" checked={includeDirs} onChange={(e) => setIncludeDirs(e.target.checked)} />
                <span>폴더 포함</span>
              </label>
              <label className="search-check">
                <input type="checkbox" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} />
                <span>숨김 항목 포함</span>
              </label>
              <div className="search-actions">
                {running ? (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => jobRef.current && apiCancelJob(jobRef.current)}
                  >
                    검색 중지
                  </button>
                ) : (
                  <button type="submit" className="primary-btn">
                    <Search size={13} />
                    <span>검색</span>
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="search-status">
            {running && (
              <span>
                검색 중... {scanned.toLocaleString()}개 확인 · <em title={currentDir}>{currentDir}</em>
              </span>
            )}
            {!running && error && <span className="search-error">{error}</span>}
            {!running && results && !error && (
              <span>
                {results.length.toLocaleString()}개 찾음 ({scanned.toLocaleString()}개 확인)
                {cancelled && " · 중지됨"}
                {truncated && " · 결과가 너무 많아 일부만 표시합니다 (5000개)"}
                {results.length > MAX_RENDERED && ` · 화면에는 ${MAX_RENDERED}개만 표시`}
              </span>
            )}
          </div>

          <div className="search-results">
            <table className="file-details-table">
              <thead>
                <tr>
                  <th className="col-name">이름</th>
                  <th>위치</th>
                  <th className="col-size">크기</th>
                  <th className="col-date">수정한 날짜</th>
                </tr>
              </thead>
              <tbody>
                {rendered.map((entry) => (
                  <tr
                    key={entry.path}
                    className={`file-row ${selected === entry.path ? "selected" : ""}`}
                    onClick={() => setSelected(entry.path)}
                    onDoubleClick={() => onOpenEntry(entry)}
                  >
                    <td className="cell-name">
                      <EntryGraphic3DIcon entry={entry} size={16} />
                      <span className="entry-name-text">{entry.name}</span>
                    </td>
                    <td className="search-path-cell" title={entry.path}>
                      {getParentPath(entry.path) ?? ""}
                    </td>
                    <td className="cell-size">{entry.isDir ? "<DIR>" : formatBytes(entry.size)}</td>
                    <td className="cell-date">{formatDate(entry.modifiedMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="search-footer">
            <button
              type="button"
              className="secondary-btn"
              disabled={!selected}
              onClick={() => {
                const entry = results?.find((r) => r.path === selected);
                if (entry) onRevealEntry(entry);
              }}
            >
              <FolderOpen size={13} />
              <span>위치로 이동 (활성 패널)</span>
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={!selected}
              onClick={() => {
                const entry = results?.find((r) => r.path === selected);
                if (entry) onOpenEntry(entry);
              }}
            >
              열기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
