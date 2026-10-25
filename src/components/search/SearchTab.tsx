import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronRight,
  Database,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { FileEntry, IndexFolder, IndexProgress, SearchHit, SearchResponse } from "../../types/jdir";
import {
  apiIndexAddFolder,
  apiIndexCancel,
  apiIndexFolders,
  apiIndexProgress,
  apiIndexRemoveFolder,
  apiIndexSearch,
  apiIndexStart,
  apiOpenInExplorer,
  apiOpenItem,
  onIndexProgress,
} from "../../services/tauriApi";
import { formatBytes, formatDate } from "../../utils/colorFilter";
import { fileExt, previewKindOf } from "../../utils/docKinds";
import { DocumentPreview } from "../preview/DocumentPreview";
import { TextEntryView } from "../preview/TextEntryView";

const MARK_OPEN = "";
const MARK_CLOSE = "";
const PAGE = 50;
const SPLIT_KEY = "jdir.searchSplitH";
const RESULTS_MIN = 80;
const PREVIEW_MIN = 160;

const EXT_GROUPS: { label: string; exts: string[] }[] = [
  { label: "모든 형식", exts: [] },
  { label: "한글 (hwp, hwpx…)", exts: ["hwp", "hwpx", "hml", "hwpml"] },
  { label: "PDF", exts: ["pdf"] },
  { label: "Word (doc, docx)", exts: ["doc", "docx"] },
  { label: "Excel (xls, xlsx)", exts: ["xls", "xlsx"] },
  { label: "PowerPoint (ppt, pptx)", exts: ["ppt", "pptx"] },
  { label: "텍스트 (txt, md)", exts: ["txt", "md", "markdown"] },
];

function Snippet({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const open = rest.indexOf(MARK_OPEN);
    if (open < 0) {
      parts.push(rest);
      break;
    }
    if (open > 0) parts.push(rest.slice(0, open));
    const close = rest.indexOf(MARK_CLOSE, open);
    const end = close < 0 ? rest.length : close;
    parts.push(<mark key={key++}>{rest.slice(open + 1, end)}</mark>);
    rest = close < 0 ? "" : rest.slice(close + 1);
  }
  return <>{parts}</>;
}

function parentOf(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}

function hitToEntry(hit: SearchHit): FileEntry {
  return {
    name: hit.name,
    path: hit.path,
    isDir: false,
    isHidden: false,
    isSystem: false,
    isReadonly: false,
    size: hit.size,
    modifiedMs: hit.mtimeMs,
    createdMs: hit.mtimeMs,
    extension: hit.ext,
    fileType: hit.ext.toUpperCase(),
  };
}

export const SearchTab: React.FC = () => {
  const [folders, setFolders] = useState<IndexFolder[]>([]);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [indexOpen, setIndexOpen] = useState(true);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "filename">("keyword");
  const [extGroup, setExtGroup] = useState(0);
  const [folderFilter, setFolderFilter] = useState<number | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const searchSeq = useRef(0);

  // Draggable divider between the result list and the document preview (height persisted).
  const [resultsH, setResultsH] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_KEY));
      return Number.isFinite(v) && v >= RESULTS_MIN ? v : null;
    } catch {
      return null;
    }
  });
  const resultsRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);

  const saveSplit = (h: number | null) => {
    try {
      if (h === null) localStorage.removeItem(SPLIT_KEY);
      else localStorage.setItem(SPLIT_KEY, String(Math.round(h)));
    } catch {
      /* storage unavailable */
    }
  };

  const beginSplit = (e: React.PointerEvent) => {
    const results = resultsRef.current;
    const preview = previewRef.current;
    if (e.button !== 0 || !results || !preview) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = results.getBoundingClientRect().height;
    // Growing the list may only take the space the preview can give up.
    const maxH = startH + Math.max(0, preview.getBoundingClientRect().height - PREVIEW_MIN);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let latest = startH;
    const onMove = (ev: PointerEvent) => {
      latest = Math.min(maxH, Math.max(RESULTS_MIN, startH + (ev.clientY - startY)));
      setResultsH(latest);
    };
    let finished = false;
    const onUp = () => {
      if (finished) return;
      finished = true;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      target.removeEventListener("lostpointercapture", onUp);
      saveSplit(latest);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
    // Releasing the button outside the window can end the capture without a pointerup.
    target.addEventListener("lostpointercapture", onUp);
  };

  const refreshFolders = useCallback(async () => {
    try {
      setFolders(await apiIndexFolders());
    } catch (err) {
      setNotice({ text: String(err), error: true });
    }
  }, []);

  const runSearch = useCallback(
    async (append = false) => {
      const text = query.trim();
      const seq = ++searchSeq.current;
      if (!text) {
        setResponse(null);
        setHits([]);
        setSelected(null);
        return;
      }
      setSearching(true);
      try {
        const res = await apiIndexSearch({
          text,
          mode,
          exts: EXT_GROUPS[extGroup].exts,
          folderId: folderFilter,
          limit: PAGE,
          offset: append ? hits.length : 0,
        });
        if (seq !== searchSeq.current) return;
        setResponse(res);
        setHits((prev) => (append ? [...prev, ...res.hits] : res.hits));
        if (!append) setSelected(null);
        setNotice(null);
      } catch (err) {
        if (seq === searchSeq.current) setNotice({ text: String(err), error: true });
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [query, mode, extGroup, folderFilter, hits.length],
  );

  // Initial load + live progress from the background indexer.
  useEffect(() => {
    void refreshFolders();
    void apiIndexProgress().then(setProgress).catch(() => undefined);
    let off: (() => void) | undefined;
    let disposed = false;
    onIndexProgress((p) => {
      setProgress(p);
      if (p.finished) void refreshFolders();
    }).then((fn) => (disposed ? fn() : (off = fn)));
    return () => {
      disposed = true;
      off?.();
    };
  }, [refreshFolders]);

  // Search as you type (debounced) and whenever a filter changes.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = window.setTimeout(() => void runSearch(false), 280);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, extGroup, folderFilter]);

  // Results change once an indexing run completes.
  useEffect(() => {
    if (progress?.finished && query.trim()) void runSearch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.finished]);

  const addFolder = async () => {
    try {
      const picked = await openDialog({ directory: true, multiple: false });
      if (typeof picked !== "string") return;
      await apiIndexAddFolder(picked);
      await refreshFolders();
      setIndexOpen(true);
      await apiIndexStart(null);
      setNotice({ text: "폴더를 추가하고 색인을 시작했습니다.", error: false });
    } catch (err) {
      setNotice({ text: String(err).replace(/^Error:\s*/, ""), error: true });
    }
  };

  const reindex = async (id: number | null) => {
    try {
      await apiIndexStart(id);
      setNotice(null);
    } catch (err) {
      setNotice({ text: String(err), error: true });
    }
  };

  const removeFolder = async (f: IndexFolder) => {
    if (!window.confirm(`색인에서 제거할까요?\n\n${f.path}\n\n(파일은 삭제되지 않고 검색 색인만 지워집니다)`)) return;
    try {
      await apiIndexRemoveFolder(f.id);
      if (folderFilter === f.id) setFolderFilter(null);
      await refreshFolders();
      if (query.trim()) void runSearch(false);
    } catch (err) {
      setNotice({ text: String(err), error: true });
    }
  };

  const running = !!progress?.running;
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  const totalDocs = useMemo(() => folders.reduce((n, f) => n + f.docCount, 0), [folders]);
  const selectedEntry = useMemo(() => (selected ? hitToEntry(selected) : null), [selected]);
  const selectedKind = selected ? previewKindOf(selected.name) : "other";

  return (
    <div className="search-tab">
      {/* 1. Index folders */}
      <section className="st-index">
        <div className="st-index-head">
          <button type="button" className="st-toggle" onClick={() => setIndexOpen((v) => !v)}>
            {indexOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Database size={13} />
            <b>색인 폴더</b>
            <span className="st-dim">
              {folders.length}개 · 문서 {totalDocs.toLocaleString()}개
            </span>
          </button>
          <div className="st-index-actions">
            <button type="button" className="mini-ghost-btn" onClick={() => void addFolder()} title="검색할 폴더를 추가합니다">
              <FolderPlus size={12} /> 폴더 추가
            </button>
            <button
              type="button"
              className="mini-ghost-btn"
              disabled={running || folders.length === 0}
              onClick={() => void reindex(null)}
              title="변경된 파일만 다시 색인합니다"
            >
              <RefreshCw size={12} /> 갱신
            </button>
          </div>
        </div>

        {running && progress && (
          <div className="st-progress">
            <div className="st-bar">
              <div style={{ width: `${progress.phase === "scan" ? 5 : pct}%` }} />
            </div>
            <div className="st-progress-line">
              <span>
                {progress.phase === "scan"
                  ? `파일 확인 중… ${progress.current}`
                  : `색인 중 ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()} · ${progress.current}`}
              </span>
              <button type="button" className="mini-ghost-btn" onClick={() => void apiIndexCancel()}>
                <Square size={11} /> 취소
              </button>
            </div>
          </div>
        )}
        {!running && progress?.finished && progress.message && (
          <div className="st-note error">{progress.message}</div>
        )}

        {indexOpen && (
          <div className="st-folder-list">
            {folders.length === 0 && (
              <div className="st-empty">
                검색하려면 먼저 <b>폴더 추가</b>로 색인할 폴더를 고르세요. 선택한 폴더의 문서 본문만 PC 안에 암호화되어 저장됩니다.
              </div>
            )}
            {folders.map((f) => (
              <div className="st-folder" key={f.id}>
                <span className="st-folder-path" title={f.path}>
                  {f.path}
                </span>
                <span className="st-dim">
                  {f.docCount.toLocaleString()}개{f.errorCount > 0 ? ` · 오류 ${f.errorCount}` : ""}
                </span>
                <button type="button" className="icon-btn" disabled={running} onClick={() => void reindex(f.id)} title="이 폴더 다시 색인">
                  <RefreshCw size={12} />
                </button>
                <button type="button" className="icon-btn" disabled={running} onClick={() => void removeFolder(f)} title="색인에서 제거">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {notice && <div className={`st-note ${notice.error ? "error" : ""}`}>{notice.text}</div>}

      {/* 2. Search box + filters */}
      <section className="st-search">
        <div className="st-input">
          <Search size={14} />
          <input
            value={query}
            placeholder="파일 안의 내용으로 검색 (예: 연수 계획서)"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(false);
            }}
          />
        </div>
        <div className="st-filters">
          <select value={mode} onChange={(e) => setMode(e.target.value as "keyword" | "filename")}>
            <option value="keyword">내용 + 파일명</option>
            <option value="filename">파일명만</option>
          </select>
          <select value={extGroup} onChange={(e) => setExtGroup(Number(e.target.value))}>
            {EXT_GROUPS.map((g, i) => (
              <option key={g.label} value={i}>
                {g.label}
              </option>
            ))}
          </select>
          <select value={folderFilter ?? ""} onChange={(e) => setFolderFilter(e.target.value ? Number(e.target.value) : null)}>
            <option value="">전체 폴더</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.path.slice(f.path.lastIndexOf("\\") + 1) || f.path}
              </option>
            ))}
          </select>
        </div>
        <div className="st-count">
          {searching ? (
            <span>검색 중…</span>
          ) : response ? (
            <span>
              <b>{response.total.toLocaleString()}</b>개 · {response.elapsedMs}ms
            </span>
          ) : (
            <span className="st-dim">검색어를 입력하세요</span>
          )}
        </div>
      </section>

      {/* 3. Results */}
      <section className="st-results" ref={resultsRef} style={resultsH !== null ? { flex: "0 0 auto", height: resultsH, minHeight: 0 } : undefined}>
        {response && hits.length === 0 && !searching && (
          <div className="st-empty">
            {totalDocs === 0 ? "색인된 문서가 없습니다. 폴더를 추가해 주세요." : "검색 결과가 없습니다."}
          </div>
        )}
        {hits.map((h) => (
          <div
            key={h.id}
            className={`st-hit ${selected?.id === h.id ? "active" : ""}`}
            onClick={() => setSelected(h)}
            onDoubleClick={() => void apiOpenItem(h.path)}
          >
            <div className="st-hit-title">
              <span className="st-hit-name" title={h.name}>
                {h.name}
              </span>
              <span className="st-ext">{h.ext.toUpperCase()}</span>
              <button
                type="button"
                className="icon-btn"
                title="폴더에서 보기"
                onClick={(e) => {
                  e.stopPropagation();
                  void apiOpenInExplorer(h.path);
                }}
              >
                <FolderOpen size={12} />
              </button>
            </div>
            <div className="st-hit-path" title={h.path}>
              {parentOf(h.path)} <span className="st-dim">· {formatBytes(h.size)} · {formatDate(h.mtimeMs)}</span>
            </div>
            {h.snippet && (
              <div className="st-snippet">
                <Snippet text={h.snippet} />
              </div>
            )}
            {h.status === "empty" && <div className="st-snippet st-dim">본문이 없는 문서입니다 (이미지 PDF 등)</div>}
            {h.status === "error" && <div className="st-snippet st-dim">본문을 읽지 못해 파일명으로만 검색됩니다</div>}
          </div>
        ))}
        {response && hits.length < response.total && (
          <button type="button" className="mini-ghost-btn st-more" onClick={() => void runSearch(true)}>
            더 보기 ({hits.length.toLocaleString()} / {response.total.toLocaleString()})
          </button>
        )}
      </section>

      <div
        className="st-splitter"
        onPointerDown={beginSplit}
        onDoubleClick={() => {
          setResultsH(null);
          saveSplit(null);
        }}
        title="드래그하여 결과 목록과 미리보기의 높이 조절 · 더블클릭으로 초기화"
      />

      {/* 4. Preview of the selected result */}
      <section className="st-preview" ref={previewRef}>
        {selectedEntry ? (
          <>
            <div className="st-preview-title" title={selectedEntry.path}>
              {selectedEntry.name}
            </div>
            <div className="st-preview-body">
              {selectedKind === "layout-doc" || selectedKind === "text-doc" ? (
                <DocumentPreview
                  key={selectedEntry.path}
                  entry={selectedEntry}
                  hasLayout={selectedKind === "layout-doc"}
                  startMode="text"
                  highlight={response?.tokens.join(" ")}
                />
              ) : fileExt(selectedEntry.name) ? (
                <TextEntryView key={selectedEntry.path} path={selectedEntry.path} />
              ) : null}
            </div>
          </>
        ) : (
          <div className="st-empty">결과를 클릭하면 문서 내용이 여기에 표시됩니다. 더블클릭하면 기본 프로그램으로 엽니다.</div>
        )}
      </section>
    </div>
  );
};
