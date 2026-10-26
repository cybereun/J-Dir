import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Info,
  PackageOpen,
  Search,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calculator,
  Clipboard,
  Copy,
  CornerLeftUp,
  Edit3,
  ExternalLink,
  FilePlus,
  Filter,
  FolderPlus,
  FolderTree,
  Grid,
  LayoutGrid,
  LayoutList,
  List,
  Plus,
  RefreshCw,
  Scissors,
  Send,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  ClipboardState,
  ColorFilterRule,
  DriveInfo,
  FileEntry,
  PaneState,
  QuickLinkItem,
  UndoOp,
  SortField,
  ViewMode,
} from "../types/jdir";
import {
  apiCalculateFolderSize,
  apiCreateDirectory,
  apiCreateTextFile,
  apiListDirectory,
  apiOpenInExplorer,
  apiOpenInTerminal,
  apiOpenItem,
  apiRenameItem,
} from "../services/tauriApi";
import {
  filterEntries,
  formatBytes,
  formatDate,
  getDriveRoot,
  getParentPath,
  resolveEntryColor,
  sortEntries,
} from "../utils/colorFilter";
import {
  beginDrag,
  watchShiftDrag,
  dragIncludesDestination,
  dropModeFor,
  endDrag,
  isJdirDrag,
  readDrag,
} from "../utils/dragDrop";
import { DirectoryTree } from "./DirectoryTree";
import {
  Drive3DIcon,
  EntryGraphic3DIcon,
  Folder3DIcon,
  ParentFolder3DIcon,
  QuickLink3DIcon,
  Star3DIcon,
} from "./GraphicIcons";

interface ExplorerPaneProps {
  pane: PaneState;
  isFocused: boolean;
  drives: DriveInfo[];
  quickLinks: QuickLinkItem[];
  colorRules: ColorFilterRule[];
  useColorStart: boolean;
  showHidden: boolean;
  theme: "dark" | "light";
  globalTreeMode: number;
  clipboard: ClipboardState | null;
  refreshTrigger: number;
  transferTargets: number[];
  shortcutsEnabled: boolean;
  onFocusPane: (paneIndex: number) => void;
  onNavigate: (paneIndex: number, newPath: string, addToHistory?: boolean) => void;
  onHistoryBack: (paneIndex: number) => void;
  onHistoryForward: (paneIndex: number) => void;
  onAddTab: (paneIndex: number, initialPath?: string) => void;
  onCloseTab: (paneIndex: number, tabId: string) => void;
  onSelectTab: (paneIndex: number, tabId: string) => void;
  onUpdatePane: (paneIndex: number, patch: Partial<PaneState>) => void;
  onSelectForPreview: (entry: FileEntry | null) => void;
  onCopySelectionToClipboard: (paneIndex: number, mode: "copy" | "cut", paths: string[]) => void;
  onPasteFromClipboard: (targetPaneIndex: number) => void;
  onTransferBetweenPanes: (
    sourcePaneIndex: number,
    targetPaneIndex: number,
    paths: string[],
    mode: "copy" | "move"
  ) => void;
  onDropToPath: (destDir: string, paths: string[], mode: "copy" | "move") => void;
  runJob: <T>(label: string, fn: (jobId: string) => Promise<T>) => Promise<T>;
  onZip: (paths: string[], baseDir: string, suggestedName: string) => void;
  onUnzip: (zipPath: string, destDir: string) => void;
  onOpenProperties: (entries: FileEntry[]) => void;
  onOpenSearch: () => void;
  onRecordUndo: (op: UndoOp) => void;
  onDeletePaths: (paneIndex: number, paths: string[], permanent: boolean) => void;
  onAddQuickLink: (name: string, targetPath: string) => void;
  onEntriesLoaded?: (paneIndex: number, entries: FileEntry[]) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

function renderEntryIcon(entry: FileEntry, _color?: string, size = 16) {
  return <EntryGraphic3DIcon entry={entry} size={size} />;
}

type ColKey = "name" | "size" | "type" | "date";
const DEFAULT_COL_WIDTHS: Record<ColKey, number> = { name: 260, size: 90, type: 110, date: 140 };
const MIN_COL_WIDTH = 40;

export const ExplorerPane: React.FC<ExplorerPaneProps> = ({
  pane,
  isFocused,
  drives,
  quickLinks,
  colorRules,
  useColorStart,
  showHidden,
  theme,
  globalTreeMode,
  clipboard,
  refreshTrigger,
  transferTargets,
  shortcutsEnabled,
  onFocusPane,
  onNavigate,
  onHistoryBack,
  onHistoryForward,
  onAddTab,
  onCloseTab,
  onSelectTab,
  onUpdatePane,
  onSelectForPreview,
  onCopySelectionToClipboard,
  onPasteFromClipboard,
  onTransferBetweenPanes,
  onDropToPath,
  runJob,
  onZip,
  onUnzip,
  onOpenProperties,
  onOpenSearch,
  onRecordUndo,
  onDeletePaths,
  onAddQuickLink,
  onEntriesLoaded,
  onNotify,
}) => {
  const activeTab = useMemo(
    () => pane.tabs.find((t) => t.id === pane.activeTabId) || pane.tabs[0],
    [pane.tabs, pane.activeTabId]
  );
  const currentPath = activeTab?.path || "C:\\";

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addressEditing, setAddressEditing] = useState<boolean>(false);
  const [addressInput, setAddressInput] = useState<string>(currentPath);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const loadSeqRef = useRef(0);
  const renamingRef = useRef<string | null>(null);
  const typeAheadRef = useRef<{ buffer: string; timer: number | null }>({ buffer: "", timer: null });

  // Inline rename state
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(() => {
    try {
      const raw = localStorage.getItem(`jdir-col-widths-${pane.index}`);
      if (raw) {
        const p = JSON.parse(raw);
        const out = { ...DEFAULT_COL_WIDTHS };
        for (const k of Object.keys(out) as ColKey[]) {
          if (typeof p[k] === "number" && p[k] >= MIN_COL_WIDTH) out[k] = p[k];
        }
        return out;
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_COL_WIDTHS };
  });
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;

  const startColResize = (e: React.MouseEvent, key: ColKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidthsRef.current[key];
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX);
      setColWidths((prev) => ({ ...prev, [key]: w }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("col-resizing");
      try {
        localStorage.setItem(
          `jdir-col-widths-${pane.index}`,
          JSON.stringify(colWidthsRef.current)
        );
      } catch {
        // ignore
      }
    };
    document.body.classList.add("col-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const resetColWidth = (e: React.MouseEvent, key: ColKey) => {
    e.stopPropagation();
    setColWidths((prev) => {
      const next = { ...prev, [key]: DEFAULT_COL_WIDTHS[key] };
      try {
        localStorage.setItem(`jdir-col-widths-${pane.index}`, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");

  // Inline create modal/bar state
  const [creatingMode, setCreatingMode] = useState<"folder" | "file" | null>(null);
  const [createNameInput, setCreateNameInput] = useState<string>("");

  // Quick-Link dropdown
  const [showQuickLinksMenu, setShowQuickLinksMenu] = useState<boolean>(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry | null;
  } | null>(null);

  // Drag & Drop state
  const [dropHover, setDropHover] = useState<string | null>(null);

  const loadDir = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await apiListDirectory(currentPath, showHidden);
      if (seq !== loadSeqRef.current) return; // a newer navigation superseded this request
      setEntries(list);
      onEntriesLoaded?.(pane.index, list);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setErrorMsg(String(err));
      setEntries([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [currentPath, showHidden, pane.index, onEntriesLoaded]);

  useEffect(() => {
    setAddressInput(currentPath);
    loadDir();
  }, [currentPath, showHidden, refreshTrigger, loadDir]);

  useEffect(() => {
    setLastClickedIndex(null);
    setCursorIndex(null);
  }, [currentPath]);

  useEffect(() => {
    const closeMenus = () => {
      setContextMenu(null);
      setShowQuickLinksMenu(false);
    };
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenus();
      }
    };
    // Capture-phase listeners ensure any new right-click or left-click anywhere
    // immediately closes existing menus across all 4 panes before opening a new one.
    window.addEventListener("click", closeMenus);
    window.addEventListener("contextmenu", closeMenus, true);
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => {
      window.removeEventListener("click", closeMenus);
      window.removeEventListener("contextmenu", closeMenus, true);
      window.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, []);

  const visibleEntries = useMemo(() => {
    const filtered = filterEntries(entries, pane.includeFilter, pane.negativeFilter);
    return sortEntries(filtered, pane.sortField, pane.sortAsc, pane.folderSizes);
  }, [entries, pane.includeFilter, pane.negativeFilter, pane.sortField, pane.sortAsc, pane.folderSizes]);

  // Drop selections that are no longer visible (filter changed / items removed) so that
  // Delete/Copy never act on items the user cannot see.
  useEffect(() => {
    if (pane.selectedPaths.length === 0) return;
    const visible = new Set(visibleEntries.map((e) => e.path));
    const kept = pane.selectedPaths.filter((p) => visible.has(p));
    if (kept.length !== pane.selectedPaths.length) {
      onUpdatePane(pane.index, { selectedPaths: kept });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntries]);

  useEffect(() => {
    if (cursorIndex === null || !isFocused) return;
    sectionRef.current
      ?.querySelector(`[data-idx="${cursorIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursorIndex, isFocused]);

  const currentDriveRoot = useMemo(() => getDriveRoot(currentPath), [currentPath]);

  const pathSegments = useMemo(() => {
    const cleaned = currentPath.replace(/[\\/]+$/, "");
    const parts = cleaned.split(/[\\/]/).filter(Boolean);
    const result: { label: string; fullPath: string }[] = [];
    let acc = "";
    parts.forEach((part, idx) => {
      if (idx === 0 && part.endsWith(":")) {
        acc = `${part}\\`;
      } else {
        acc = acc.endsWith("\\") ? `${acc}${part}` : `${acc}\\${part}`;
      }
      result.push({ label: part, fullPath: acc });
    });
    return result;
  }, [currentPath]);

  const selectedEntries = useMemo(
    () => visibleEntries.filter((e) => pane.selectedPaths.includes(e.path)),
    [visibleEntries, pane.selectedPaths]
  );

  const selectedBytes = useMemo(
    () =>
      selectedEntries.reduce(
        (sum, e) => sum + (e.isDir ? (pane.folderSizes[e.path] ?? 0) : e.size),
        0
      ),
    [selectedEntries, pane.folderSizes]
  );

  const handleSortClick = (field: SortField) => {
    if (pane.sortField === field) {
      onUpdatePane(pane.index, { sortAsc: !pane.sortAsc });
    } else {
      onUpdatePane(pane.index, { sortField: field, sortAsc: field === "name" });
    }
  };

  const handleItemClick = (e: React.MouseEvent, entry: FileEntry, idx: number) => {
    e.stopPropagation();
    onFocusPane(pane.index);
    onSelectForPreview(entry);
    setCursorIndex(idx);

    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, idx);
      const end = Math.max(lastClickedIndex, idx);
      const rangePaths = visibleEntries.slice(start, end + 1).map((item) => item.path);
      onUpdatePane(pane.index, { selectedPaths: rangePaths });
    } else if (e.ctrlKey || e.metaKey) {
      const exists = pane.selectedPaths.includes(entry.path);
      const next = exists
        ? pane.selectedPaths.filter((p) => p !== entry.path)
        : [...pane.selectedPaths, entry.path];
      onUpdatePane(pane.index, { selectedPaths: next });
      setLastClickedIndex(idx);
    } else {
      onUpdatePane(pane.index, { selectedPaths: [entry.path] });
      setLastClickedIndex(idx);
    }
  };

  const handleItemDoubleClick = (entry: FileEntry) => {
    onFocusPane(pane.index);
    if (entry.isDir) {
      onNavigate(pane.index, entry.path, true);
    } else {
      apiOpenItem(entry.path).catch((err) => onNotify(String(err), true));
    }
  };

  const handleGoUp = () => {
    const parent = getParentPath(currentPath);
    if (parent) {
      onNavigate(pane.index, parent, true);
    }
  };

  const handleGoRoot = () => {
    onNavigate(pane.index, getDriveRoot(currentPath), true);
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddressEditing(false);
    const trimmed = addressInput.trim();
    if (trimmed) {
      onNavigate(pane.index, trimmed, true);
    }
  };

  const startRename = (entry: FileEntry) => {
    renamingRef.current = entry.path;
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
  };

  const cancelRename = () => {
    renamingRef.current = null;
    setRenamingPath(null);
  };

  const commitRename = async () => {
    // The ref guards against the Enter/Escape + blur double invocation.
    const targetPath = renamingRef.current;
    if (!targetPath) return;
    renamingRef.current = null;
    const originalName = entries.find((e) => e.path === targetPath)?.name;
    const newName = renameValue.trim();
    setRenamingPath(null);
    if (!newName || newName === originalName) return;

    try {
      const newPath = await apiRenameItem(targetPath, newName);
      onRecordUndo({
        label: `이름 변경 (${originalName ?? newName} → ${newName})`,
        kind: "move-back",
        pairs: [{ from: targetPath, to: newPath }],
      });
      onNotify(`이름 변경 완료: ${newName}`);
      loadDir();
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingMode) return;
    const name = createNameInput.trim();
    if (!name) {
      setCreatingMode(null);
      return;
    }
    try {
      if (creatingMode === "folder") {
        const created = await apiCreateDirectory(currentPath, name);
        onRecordUndo({ label: `새 폴더 (${name})`, kind: "trash", paths: [created] });
        onNotify(`새 폴더 생성 완료: ${name}`);
      } else {
        const created = await apiCreateTextFile(currentPath, name, "");
        onRecordUndo({ label: `새 파일 (${name})`, kind: "trash", paths: [created] });
        onNotify(`새 파일 생성 완료: ${name}`);
      }
      setCreatingMode(null);
      setCreateNameInput("");
      loadDir();
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  const handleCalculateFolderSizes = async () => {
    const targetDirs =
      selectedEntries.filter((e) => e.isDir).length > 0
        ? selectedEntries.filter((e) => e.isDir)
        : visibleEntries.filter((e) => e.isDir).slice(0, 25);

    if (targetDirs.length === 0) {
      onNotify("계산할 폴더가 없습니다.");
      return;
    }

    const nextSizes = { ...pane.folderSizes };
    await runJob(`폴더 용량 계산 (${targetDirs.length}개)`, async (jobId) => {
      for (const dir of targetDirs) {
        try {
          const stats = await apiCalculateFolderSize(dir.path, jobId);
          if (stats.cancelled) break;
          nextSizes[dir.path] = stats.totalBytes;
        } catch {
          // Ignore inaccessible system folder
        }
      }
    });
    onUpdatePane(pane.index, { folderSizes: nextSizes });
  };

  // Drag & Drop handlers between panes
  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const dragPaths = pane.selectedPaths.includes(entry.path)
      ? pane.selectedPaths
      : [entry.path];
    beginDrag(e, pane.index, dragPaths);
  };

  const handleRowMouseDown = (e: React.MouseEvent, entry: FileEntry) => {
    const dragPaths = pane.selectedPaths.includes(entry.path) ? pane.selectedPaths : [entry.path];
    watchShiftDrag(e, pane.index, dragPaths);
  };

  /** Drop-target handlers for a folder path (pane body, folder rows, breadcrumbs, drives, "..") */
  const dropHandlers = (destPath: string, key: string) => ({
    "data-drop-path": destPath,
    "data-drop-key": key,
    onDragOver: (e: React.DragEvent) => {
      if (!isJdirDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = dropModeFor(e, destPath);
      if (dropHover !== key) setDropHover(key);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.stopPropagation();
      setDropHover((h) => (h === key ? null : h));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropHover(null);
      const data = readDrag(e);
      endDrag();
      if (!data) return;
      if (dragIncludesDestination(data.paths, destPath)) {
        onNotify("폴더를 자기 자신 또는 하위 폴더로 옮길 수 없습니다.", true);
        return;
      }
      onFocusPane(pane.index);
      onDropToPath(destPath, data.paths, dropModeFor(e, destPath));
    },
  });

  const hoverClass = (key: string) => (dropHover === key ? "drop-hover" : "");

  // Pane-level keyboard navigation (active only for the focused pane while no dialog is open)
  useEffect(() => {
    if (!isFocused || !shortcutsEnabled) return;

    const selectRange = (anchor: number, cursor: number) => {
      const start = Math.min(anchor, cursor);
      const end = Math.max(anchor, cursor);
      onUpdatePane(pane.index, {
        selectedPaths: visibleEntries.slice(start, end + 1).map((it) => it.path),
      });
    };

    const moveTo = (rawNext: number, extend: boolean) => {
      const n = visibleEntries.length;
      if (n === 0) return;
      const next = Math.max(0, Math.min(n - 1, rawNext));
      if (extend) {
        selectRange(lastClickedIndex ?? next, next);
      } else {
        onUpdatePane(pane.index, { selectedPaths: [visibleEntries[next].path] });
        setLastClickedIndex(next);
      }
      setCursorIndex(next);
      onSelectForPreview(visibleEntries[next]);
    };

    const currentCursor = (): number => {
      if (cursorIndex !== null && cursorIndex < visibleEntries.length) return cursorIndex;
      const firstSel = visibleEntries.findIndex((it) => pane.selectedPaths.includes(it.path));
      return firstSel;
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (renamingRef.current) return;

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (selectedEntries.length > 0) onOpenProperties(selectedEntries);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (activeTab && activeTab.historyIndex > 0) onHistoryBack(pane.index);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          if (activeTab && activeTab.historyIndex < activeTab.history.length - 1) {
            onHistoryForward(pane.index);
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onUpdatePane(pane.index, { selectedPaths: visibleEntries.map((it) => it.path) });
        return;
      }
      if (e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveTo(currentCursor() + 1, e.shiftKey);
          return;
        case "ArrowUp":
          e.preventDefault();
          moveTo(currentCursor() < 0 ? 0 : currentCursor() - 1, e.shiftKey);
          return;
        case "ArrowRight":
          if (pane.viewMode !== "details") {
            e.preventDefault();
            moveTo(currentCursor() + 1, e.shiftKey);
          }
          return;
        case "ArrowLeft":
          if (pane.viewMode !== "details") {
            e.preventDefault();
            moveTo(currentCursor() < 0 ? 0 : currentCursor() - 1, e.shiftKey);
          }
          return;
        case "PageDown":
          e.preventDefault();
          moveTo(currentCursor() + 10, e.shiftKey);
          return;
        case "PageUp":
          e.preventDefault();
          moveTo(currentCursor() - 10, e.shiftKey);
          return;
        case "Home":
          e.preventDefault();
          moveTo(0, e.shiftKey);
          return;
        case "End":
          e.preventDefault();
          moveTo(visibleEntries.length - 1, e.shiftKey);
          return;
        case "Enter": {
          const idx = currentCursor();
          const target =
            idx >= 0 && pane.selectedPaths.includes(visibleEntries[idx]?.path)
              ? visibleEntries[idx]
              : selectedEntries[0];
          if (target) {
            e.preventDefault();
            handleItemDoubleClick(target);
          }
          return;
        }
        case "F2":
          if (selectedEntries.length === 1) {
            e.preventDefault();
            startRename(selectedEntries[0]);
          }
          return;
        case "F5":
          e.preventDefault();
          loadDir();
          return;
        case "F7":
          e.preventDefault();
          setCreatingMode("folder");
          setCreateNameInput("새 폴더");
          return;
        default:
          break;
      }

      // Type-ahead: jump to the first entry whose name starts with the typed letters
      if (e.key.length === 1 && !e.altKey && visibleEntries.length > 0) {
        const ta = typeAheadRef.current;
        if (e.key === " " && ta.buffer === "") return;
        if (ta.timer !== null) window.clearTimeout(ta.timer);
        ta.buffer += e.key.toLowerCase();
        ta.timer = window.setTimeout(() => {
          ta.buffer = "";
          ta.timer = null;
        }, 800);
        const hit = visibleEntries.findIndex((it) => it.name.toLowerCase().startsWith(ta.buffer));
        if (hit >= 0) {
          e.preventDefault();
          moveTo(hit, false);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isFocused,
    shortcutsEnabled,
    visibleEntries,
    selectedEntries,
    cursorIndex,
    lastClickedIndex,
    pane.selectedPaths,
    pane.viewMode,
    pane.index,
    activeTab,
    loadDir,
  ]);

  const showLocalTree = globalTreeMode === 0 || pane.showLocalTree;
  const parentPath = getParentPath(currentPath);

  return (
    <section
      ref={sectionRef}
      data-pane-index={pane.index}
      className={`explorer-pane ${isFocused ? "focused-pane" : ""} ${
        dropHover === "__pane__" ? "drag-over-pane" : ""
      }`}
      onMouseDown={(e) => {
        onFocusPane(pane.index);
        if (e.button === 3 || e.button === 4) e.preventDefault();
      }}
      onMouseUp={(e) => {
        if (e.button === 3) {
          e.preventDefault();
          if (activeTab && activeTab.historyIndex > 0) onHistoryBack(pane.index);
        } else if (e.button === 4) {
          e.preventDefault();
          if (activeTab && activeTab.historyIndex < activeTab.history.length - 1) onHistoryForward(pane.index);
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 3 || e.button === 4) e.preventDefault();
      }}
      {...dropHandlers(currentPath, "__pane__")}
    >
      {/* 1. Multi-Tab & Pane Actions Bar */}
      <div className="pane-tabbar">
        <span className={`pane-index-badge pane-color-${pane.index + 1}`}>
          #{pane.index + 1}
        </span>

        <div className="pane-tabs-scroll">
          {pane.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`pane-tab ${tab.id === activeTab?.id ? "active" : ""}`}
              onClick={() => onSelectTab(pane.index, tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1 && pane.tabs.length > 1) {
                  onCloseTab(pane.index, tab.id);
                }
              }}
              title={tab.path}
            >
              <Folder3DIcon size={14} open={tab.id === activeTab?.id} />
              <span className="tab-title">{tab.title}</span>
              {pane.tabs.length > 1 && (
                <button
                  type="button"
                  className="tab-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(pane.index, tab.id);
                  }}
                  title="탭 닫기"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="tab-add-btn"
            onClick={() => onAddTab(pane.index, currentPath)}
            title="현재 경로로 새 탭 열기 (Ctrl+T)"
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="pane-quick-tools">
          <button
            type="button"
            className="pane-tool-btn"
            onClick={() => {
              setCreatingMode("folder");
              setCreateNameInput("새 폴더");
            }}
            title="새 폴더 만들기 (F7)"
          >
            <FolderPlus size={13} />
          </button>
          <button
            type="button"
            className="pane-tool-btn"
            onClick={() => {
              setCreatingMode("file");
              setCreateNameInput("새 문서.txt");
            }}
            title="새 텍스트 파일 만들기"
          >
            <FilePlus size={13} />
          </button>
          <button
            type="button"
            className="pane-tool-btn"
            onClick={onOpenSearch}
            title="파일 검색 (Ctrl+F)"
          >
            <Search size={13} />
          </button>
          <button
            type="button"
            className="pane-tool-btn"
            onClick={handleCalculateFolderSizes}
            title="폴더 용량 계산 (Q-Dir fld_size)"
          >
            <Calculator size={13} />
          </button>
          <button
            type="button"
            className="pane-tool-btn"
            onClick={() => apiOpenInExplorer(currentPath)}
            title="Windows 탐색기에서 현재 폴더 열기"
          >
            <ExternalLink size={13} />
          </button>
          <button
            type="button"
            className="pane-tool-btn"
            onClick={() => apiOpenInTerminal(currentPath)}
            title="여기서 PowerShell 터미널 열기"
          >
            <Terminal size={13} />
          </button>
          <button
            type="button"
            className={`pane-tool-btn ${pane.showLocalTree ? "active" : ""}`}
            onClick={() => onUpdatePane(pane.index, { showLocalTree: !pane.showLocalTree })}
            title="패널 내부 개별 폴더 트리 켜기/끄기"
          >
            <FolderTree size={13} />
          </button>
          <button
            type="button"
            className={`pane-tool-btn ${pane.showFilterBar ? "active" : ""}`}
            onClick={() => onUpdatePane(pane.index, { showFilterBar: !pane.showFilterBar })}
            title="하단 필터 및 패널 간 전송 바 표시/숨김"
          >
            <Filter size={13} />
          </button>
        </div>
      </div>

      {/* 2. Drive Bar + Navigation + Breadcrumb/Address Bar */}
      <div className="pane-navbar">
        <div className="nav-buttons">
          <button
            type="button"
            className="nav-icon-btn"
            disabled={!activeTab || activeTab.historyIndex <= 0}
            onClick={() => onHistoryBack(pane.index)}
            title="뒤로 (Alt+Left)"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            type="button"
            className="nav-icon-btn"
            disabled={!activeTab || activeTab.historyIndex >= activeTab.history.length - 1}
            onClick={() => onHistoryForward(pane.index)}
            title="앞으로 (Alt+Right)"
          >
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            className="nav-icon-btn"
            disabled={!parentPath}
            onClick={handleGoUp}
            title="상위 폴더로 이동 (Backspace)"
          >
            <CornerLeftUp size={13} />
          </button>
          <button
            type="button"
            className="nav-icon-btn"
            onClick={handleGoRoot}
            title="드라이브 루트(\)로 이동"
          >
            <span className="root-slash">\</span>
          </button>
          <button
            type="button"
            className="nav-icon-btn"
            onClick={loadDir}
            title="새로고침 (F5)"
          >
            <RefreshCw size={13} className={loading ? "spin-anim" : ""} />
          </button>
        </div>

        {/* Address / Breadcrumb Bar */}
        <div className="address-bar-container">
          {addressEditing ? (
            <form onSubmit={handleAddressSubmit} className="address-edit-form">
              <input
                type="text"
                className="address-input"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onBlur={() => setAddressEditing(false)}
                autoFocus
              />
            </form>
          ) : (
            <div
              className="breadcrumb-bar"
              onClick={() => {
                setAddressInput(currentPath);
                setAddressEditing(true);
              }}
              title="클릭하여 경로 직접 입력 (또는 세그먼트 클릭)"
            >
              {pathSegments.map((seg, i) => (
                <React.Fragment key={seg.fullPath}>
                  {i > 0 && <span className="crumb-sep">›</span>}
                  <button
                    type="button"
                    className={`crumb-btn ${hoverClass("crumb:" + seg.fullPath)}`}
                    {...dropHandlers(seg.fullPath, "crumb:" + seg.fullPath)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(pane.index, seg.fullPath, true);
                    }}
                  >
                    {seg.label}
                  </button>
                </React.Fragment>
              ))}
              <Edit3 size={11} className="address-edit-hint" />
            </div>
          )}

          {/* Quick-Links Dropdown Trigger */}
          <div className="quicklink-dropdown-wrap">
            <button
              type="button"
              className="nav-icon-btn star-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowQuickLinksMenu((prev) => !prev);
              }}
              title="Quick-Links (즐겨찾기 이동 및 현재 경로 추가)"
            >
              <Star3DIcon size={15} />
            </button>
            {showQuickLinksMenu && (
              <div
                className="quicklinks-popover"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="popover-header">
                  <span>Quick-Links 즐겨찾기</span>
                  <button
                    type="button"
                    className="mini-action-btn"
                    onClick={() => {
                      const folderName =
                        currentPath.split(/[\\/]/).filter(Boolean).pop() || currentPath;
                      onAddQuickLink(folderName, currentPath);
                      setShowQuickLinksMenu(false);
                    }}
                  >
                    + 현재 폴더 등록
                  </button>
                </div>
                <div className="popover-list">
                  {quickLinks.map((ql) => (
                    <button
                      key={ql.name + ql.targetPath}
                      type="button"
                      className="popover-item"
                      onClick={() => {
                        onNavigate(pane.index, ql.targetPath, true);
                        setShowQuickLinksMenu(false);
                      }}
                    >
                      <QuickLink3DIcon label={ql.name} size={15} />
                      <span className="popover-item-name">{ql.name}</span>
                      <span className="popover-item-path">{ql.targetPath}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* View Mode Selector */}
        <div className="viewmode-buttons">
          {(
            [
              { mode: "details", title: "자세히 보기 (Details)", icon: <List size={13} /> },
              {
                mode: "large-icons",
                title: "큰 아이콘 / 썸네일",
                icon: <LayoutGrid size={13} />,
              },
              { mode: "small-icons", title: "작은 아이콘", icon: <Grid size={13} /> },
              { mode: "tiles", title: "타일 보기", icon: <LayoutList size={13} /> },
            ] as { mode: ViewMode; title: string; icon: React.ReactNode }[]
          ).map((vm) => (
            <button
              key={vm.mode}
              type="button"
              className={`nav-icon-btn ${pane.viewMode === vm.mode ? "active" : ""}`}
              onClick={() => onUpdatePane(pane.index, { viewMode: vm.mode })}
              title={vm.title}
            >
              {vm.icon}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Drive Quick-Bar */}
      <div className="pane-drivebar">
        {drives.map((drv) => {
          const isCurrentDrive =
            drv.rootPath.toLowerCase() === currentDriveRoot.toLowerCase();
          const usedPct =
            drv.totalBytes > 0
              ? Math.round(((drv.totalBytes - drv.freeBytes) / drv.totalBytes) * 100)
              : 0;
          return (
            <button
              key={drv.rootPath}
              type="button"
              className={`drive-chip ${isCurrentDrive ? "active" : ""} ${hoverClass(
                "drive:" + drv.rootPath
              )}`}
              {...dropHandlers(drv.rootPath, "drive:" + drv.rootPath)}
              onClick={() => onNavigate(pane.index, drv.rootPath, true)}
              title={`${drv.letter} ${drv.label} (${drv.driveType})\n여유: ${formatBytes(
                drv.freeBytes
              )} / 전체: ${formatBytes(drv.totalBytes)} (${usedPct}% 사용)`}
            >
              <Drive3DIcon size={15} isSystemDrive={drv.letter.toUpperCase() === "C:"} />
              <span className="drive-letter">{drv.letter}</span>
              <span className="drive-mini-bar">
                <span className="drive-mini-fill" style={{ width: `${usedPct}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Optional Inline Create Folder/File Bar */}
      {creatingMode && (
        <form className="inline-create-bar" onSubmit={handleCreateSubmit}>
          <span className="create-label">
            {creatingMode === "folder" ? "새 폴더 이름:" : "새 파일 이름:"}
          </span>
          <input
            type="text"
            className="inline-create-input"
            value={createNameInput}
            onChange={(e) => setCreateNameInput(e.target.value)}
            autoFocus
          />
          <button type="submit" className="mini-primary-btn">
            생성
          </button>
          <button
            type="button"
            className="mini-ghost-btn"
            onClick={() => setCreatingMode(null)}
          >
            취소
          </button>
        </form>
      )}

      {/* 4. Main Content Area (Optional Local Tree + File View) */}
      <div className="pane-body-split">
        {showLocalTree && (
          <div className="pane-local-tree-wrap">
            <DirectoryTree
              drives={drives}
              quickLinks={quickLinks}
              activePath={currentPath}
              activePaneIndex={pane.index}
              showHidden={showHidden}
              onSelectPath={(p) => onNavigate(pane.index, p, true)}
              onDropItems={onDropToPath}
              compact
            />
          </div>
        )}

        <div
          className="pane-filelist-container"
          onClick={() => onUpdatePane(pane.index, { selectedPaths: [] })}
          onContextMenu={(e) => {
            e.preventDefault();
            onFocusPane(pane.index);
            setContextMenu({ x: e.clientX, y: e.clientY, entry: null });
          }}
        >
          {errorMsg ? (
            <div className="pane-error-box">
              <p>{errorMsg}</p>
              <button
                type="button"
                className="mini-primary-btn"
                onClick={() => onNavigate(pane.index, "C:\\", true)}
              >
                C:\ 드라이브로 이동
              </button>
            </div>
          ) : pane.viewMode === "details" ? (
            <table
              className="file-details-table"
              style={{
                width: colWidths.name + colWidths.size + colWidths.type + colWidths.date,
                minWidth: "100%",
              }}
            >
              <colgroup>
                <col style={{ width: colWidths.name }} />
                <col style={{ width: colWidths.size }} />
                <col style={{ width: colWidths.type }} />
                <col style={{ width: colWidths.date }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th onClick={() => handleSortClick("name")} className="col-name">
                    <span>이름</span>
                    {pane.sortField === "name" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => startColResize(e, "name")}
                      onDoubleClick={(e) => resetColWidth(e, "name")}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th onClick={() => handleSortClick("size")} className="col-size">
                    <span>크기</span>
                    {pane.sortField === "size" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => startColResize(e, "size")}
                      onDoubleClick={(e) => resetColWidth(e, "size")}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th onClick={() => handleSortClick("fileType")} className="col-type">
                    <span>유형</span>
                    {pane.sortField === "fileType" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => startColResize(e, "type")}
                      onDoubleClick={(e) => resetColWidth(e, "type")}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th onClick={() => handleSortClick("modifiedMs")} className="col-date">
                    <span>수정한 날짜</span>
                    {pane.sortField === "modifiedMs" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => startColResize(e, "date")}
                      onDoubleClick={(e) => resetColWidth(e, "date")}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th className="col-filler" />
                </tr>
              </thead>
              <tbody>
                {parentPath && (
                  <tr
                    className={`file-row parent-dir-row ${hoverClass("__up__")}`}
                    {...dropHandlers(parentPath, "__up__")}
                    onDoubleClick={handleGoUp}
                    title="더블클릭하여 상위 폴더로 이동 (..)"
                  >
                    <td className="cell-name">
                      <ParentFolder3DIcon size={16} />
                      <span className="entry-name-text">[..] 상위 폴더</span>
                    </td>
                    <td className="cell-size">&lt;UP&gt;</td>
                    <td className="cell-type">상위 폴더</td>
                    <td className="cell-date">-</td>
                  </tr>
                )}
                {visibleEntries.map((entry, idx) => {
                  const isSelected = pane.selectedPaths.includes(entry.path);
                  const { color, isBold } = resolveEntryColor(
                    entry,
                    colorRules,
                    useColorStart,
                    theme
                  );
                  const isRenaming = renamingPath === entry.path;
                  const dirCalculatedSize = pane.folderSizes[entry.path];

                  return (
                    <tr
                      key={entry.path}
                      data-idx={idx}
                      draggable={!isRenaming}
                      onDragStart={(e) => handleDragStart(e, entry)}
                      onMouseDown={(e) => !isRenaming && handleRowMouseDown(e, entry)}
                      onDragEnd={endDrag}
                      {...(entry.isDir ? dropHandlers(entry.path, entry.path) : {})}
                      className={`file-row ${isSelected ? "selected" : ""} ${
                        entry.isHidden ? "hidden-entry" : ""
                      } ${entry.isDir ? hoverClass(entry.path) : ""}`}
                      onClick={(e) => handleItemClick(e, entry, idx)}
                      onDoubleClick={() => handleItemDoubleClick(entry)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onFocusPane(pane.index);
                        if (!pane.selectedPaths.includes(entry.path)) {
                          onUpdatePane(pane.index, { selectedPaths: [entry.path] });
                        }
                        onSelectForPreview(entry);
                        setContextMenu({ x: e.clientX, y: e.clientY, entry });
                      }}
                    >
                      <td className="cell-name">
                        {renderEntryIcon(entry, color, 16)}
                        {isRenaming ? (
                          <input
                            type="text"
                            className="inline-rename-input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="entry-name-text"
                            style={{
                              color,
                              fontWeight: isBold ? 600 : 400,
                            }}
                          >
                            {entry.name}
                          </span>
                        )}
                      </td>
                      <td className="cell-size">
                        {entry.isDir
                          ? dirCalculatedSize !== undefined
                            ? formatBytes(dirCalculatedSize)
                            : "<DIR>"
                          : formatBytes(entry.size)}
                      </td>
                      <td className="cell-type">{entry.fileType}</td>
                      <td className="cell-date">{formatDate(entry.modifiedMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className={`file-grid-view mode-${pane.viewMode}`}>
              {parentPath && (
                <div
                  className={`file-card parent-card ${hoverClass("__up__")}`}
                  {...dropHandlers(parentPath, "__up__")}
                  onDoubleClick={handleGoUp}
                >
                  <ParentFolder3DIcon size={pane.viewMode === "large-icons" ? 32 : 20} />
                  <span className="card-name">[..] 상위 폴더</span>
                </div>
              )}
              {visibleEntries.map((entry, idx) => {
                const isSelected = pane.selectedPaths.includes(entry.path);
                const { color, isBold } = resolveEntryColor(
                  entry,
                  colorRules,
                  useColorStart,
                  theme
                );
                return (
                  <div
                    key={entry.path}
                    data-idx={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, entry)}
                    onMouseDown={(e) => handleRowMouseDown(e, entry)}
                    onDragEnd={endDrag}
                    {...(entry.isDir ? dropHandlers(entry.path, entry.path) : {})}
                    className={`file-card ${isSelected ? "selected" : ""} ${
                      entry.isDir ? hoverClass(entry.path) : ""
                    }`}
                    onClick={(e) => handleItemClick(e, entry, idx)}
                    onDoubleClick={() => handleItemDoubleClick(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onFocusPane(pane.index);
                      if (!pane.selectedPaths.includes(entry.path)) {
                        onUpdatePane(pane.index, { selectedPaths: [entry.path] });
                      }
                      onSelectForPreview(entry);
                      setContextMenu({ x: e.clientX, y: e.clientY, entry });
                    }}
                  >
                    {renderEntryIcon(
                      entry,
                      color,
                      pane.viewMode === "large-icons" ? 34 : 20
                    )}
                    <div className="card-meta">
                      <span
                        className="card-name"
                        style={{ color, fontWeight: isBold ? 600 : 400 }}
                      >
                        {entry.name}
                      </span>
                      {pane.viewMode === "tiles" && (
                        <span className="card-sub">
                          {entry.isDir ? "폴더" : formatBytes(entry.size)} · {entry.fileType}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. Q-Dir Filter Bar (Positive & Negative Filter) + Cross-Pane Transfer Bar */}
      {pane.showFilterBar && (
        <div className="pane-filterbar">
          <div className="filter-inputs-group">
            <label className="filter-field" title="와일드카드(*.jpg;*.png) 또는 파일명 검색어">
              <Filter size={11} />
              <span>필터:</span>
              <input
                type="text"
                placeholder="*.zip;*.exe 또는 검색어"
                value={pane.includeFilter}
                onChange={(e) => onUpdatePane(pane.index, { includeFilter: e.target.value })}
              />
              {pane.includeFilter && (
                <button
                  type="button"
                  className="clear-filter-btn"
                  onClick={() => onUpdatePane(pane.index, { includeFilter: "" })}
                >
                  ×
                </button>
              )}
            </label>

            <label
              className="filter-field neg-filter"
              title="Q-Dir Negativ-Filter: 특정 패턴 제외 (예: Thumbs.db;*.bak)"
            >
              <span>제외:</span>
              <input
                type="text"
                placeholder="Thumbs.db;*.bak"
                value={pane.negativeFilter}
                onChange={(e) => onUpdatePane(pane.index, { negativeFilter: e.target.value })}
              />
              {pane.negativeFilter && (
                <button
                  type="button"
                  className="clear-filter-btn"
                  onClick={() => onUpdatePane(pane.index, { negativeFilter: "" })}
                >
                  ×
                </button>
              )}
            </label>
          </div>

          <div className="cross-pane-transfer-group">
            <span className="transfer-caption">
              <Send size={11} /> 다른 패널로 전송:
            </span>
            {transferTargets
              .filter((targetIdx) => targetIdx !== pane.index)
              .map((targetIdx) => (
                <div key={targetIdx} className="transfer-btn-pair">
                  <button
                    type="button"
                    className="transfer-chip copy"
                    disabled={pane.selectedPaths.length === 0}
                    onClick={() =>
                      onTransferBetweenPanes(
                        pane.index,
                        targetIdx,
                        pane.selectedPaths,
                        "copy"
                      )
                    }
                    title={`선택된 항목을 #${targetIdx + 1} 패널로 복사`}
                  >
                    #{targetIdx + 1} 복사
                  </button>
                  <button
                    type="button"
                    className="transfer-chip move"
                    disabled={pane.selectedPaths.length === 0}
                    onClick={() =>
                      onTransferBetweenPanes(
                        pane.index,
                        targetIdx,
                        pane.selectedPaths,
                        "move"
                      )
                    }
                    title={`선택된 항목을 #${targetIdx + 1} 패널로 이동`}
                  >
                    이동
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 6. Status Bar */}
      <footer className="pane-statusbar">
        <div className="status-left">
          <span>총 {visibleEntries.length}개 항목</span>
          {pane.selectedPaths.length > 0 && (
            <span className="status-selected">
              · 선택됨: {pane.selectedPaths.length}개 ({formatBytes(selectedBytes)})
            </span>
          )}
        </div>
        <div className="status-right">
          {pane.selectedPaths.length === 1 && (
            <button
              type="button"
              className="status-mini-action"
              onClick={() => {
                const target = visibleEntries.find((e) => e.path === pane.selectedPaths[0]);
                if (target) startRename(target);
              }}
            >
              이름변경(F2)
            </button>
          )}
          {pane.selectedPaths.length > 0 && (
            <>
              <button
                type="button"
                className="status-mini-action"
                onClick={() =>
                  onCopySelectionToClipboard(pane.index, "copy", pane.selectedPaths)
                }
              >
                복사(Ctrl+C)
              </button>
              <button
                type="button"
                className="status-mini-action danger"
                onClick={() => onDeletePaths(pane.index, pane.selectedPaths, false)}
              >
                삭제(Del)
              </button>
            </>
          )}
          {clipboard && clipboard.paths.length > 0 && (
            <button
              type="button"
              className="status-mini-action highlight"
              onClick={() => onPasteFromClipboard(pane.index)}
            >
              붙여넣기({clipboard.paths.length})
            </button>
          )}
        </div>
      </footer>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu-popup"
          style={{
            ...(contextMenu.y > window.innerHeight - 390
              ? {
                  bottom: Math.max(32, window.innerHeight - contextMenu.y),
                  top: "auto",
                  maxHeight: Math.max(200, contextMenu.y - 16),
                }
              : {
                  top: Math.max(8, contextMenu.y),
                  bottom: "auto",
                  maxHeight: Math.max(200, window.innerHeight - contextMenu.y - 36),
                }),
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 235)),
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          {contextMenu.entry && (
            <>
              <button
                type="button"
                className="ctx-item primary"
                onClick={() => {
                  handleItemDoubleClick(contextMenu.entry!);
                  setContextMenu(null);
                }}
              >
                <ExternalLink size={13} />
                <span>{contextMenu.entry.isDir ? "폴더 열기" : "파일 실행 / 열기"}</span>
              </button>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  startRename(contextMenu.entry!);
                  setContextMenu(null);
                }}
              >
                <Edit3 size={13} />
                <span>이름 바꾸기 (F2)</span>
              </button>
              <div className="ctx-divider" />
            </>
          )}

          {pane.selectedPaths.length > 0 && (
            <>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  onCopySelectionToClipboard(pane.index, "copy", pane.selectedPaths);
                  setContextMenu(null);
                }}
              >
                <Copy size={13} />
                <span>복사 (Ctrl+C)</span>
              </button>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  onCopySelectionToClipboard(pane.index, "cut", pane.selectedPaths);
                  setContextMenu(null);
                }}
              >
                <Scissors size={13} />
                <span>잘라내기 (Ctrl+X)</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onPasteFromClipboard(pane.index);
              setContextMenu(null);
            }}
          >
            <Clipboard size={13} />
            <span>
              여기에 붙여넣기 (Ctrl+V)
              {clipboard && clipboard.paths.length > 0 ? ` · ${clipboard.paths.length}개` : ""}
            </span>
          </button>

          <div className="ctx-divider" />
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              setCreatingMode("folder");
              setCreateNameInput("새 폴더");
              setContextMenu(null);
            }}
          >
            <FolderPlus size={13} />
            <span>새 폴더 만들기 (F7)</span>
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              handleCalculateFolderSizes();
              setContextMenu(null);
            }}
          >
            <Calculator size={13} />
            <span>폴더 용량 계산 (fld_size)</span>
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              apiOpenInExplorer(contextMenu.entry?.path || currentPath);
              setContextMenu(null);
            }}
          >
            <ExternalLink size={13} />
            <span>Windows 탐색기에서 보기</span>
          </button>
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              apiOpenInTerminal(currentPath);
              setContextMenu(null);
            }}
          >
            <Terminal size={13} />
            <span>여기서 PowerShell 열기</span>
          </button>

          <div className="ctx-divider" />
          <button
            type="button"
            className="ctx-item"
            onClick={() => {
              onOpenSearch();
              setContextMenu(null);
            }}
          >
            <Search size={13} />
            <span>파일 검색 (Ctrl+F)</span>
          </button>
          {selectedEntries.length > 0 && (
            <>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  navigator.clipboard
                    .writeText(selectedEntries.map((e) => e.path).join("\r\n"))
                    .then(() => onNotify("경로를 복사했습니다."))
                    .catch(() => onNotify("클립보드에 복사하지 못했습니다.", true));
                  setContextMenu(null);
                }}
              >
                <Copy size={13} />
                <span>경로 복사</span>
              </button>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  navigator.clipboard
                    .writeText(selectedEntries.map((e) => e.name).join("\r\n"))
                    .then(() => onNotify("이름을 복사했습니다."))
                    .catch(() => onNotify("클립보드에 복사하지 못했습니다.", true));
                  setContextMenu(null);
                }}
              >
                <Copy size={13} />
                <span>이름 복사</span>
              </button>
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  const single = selectedEntries.length === 1 ? selectedEntries[0] : null;
                  const suggested = single
                    ? single.isDir
                      ? single.name
                      : single.name.replace(/\.[^.]+$/, "")
                    : currentPath.split(/[\\/]/).filter(Boolean).pop() || "압축";
                  onZip(
                    selectedEntries.map((e) => e.path),
                    currentPath,
                    suggested
                  );
                  setContextMenu(null);
                }}
              >
                <Archive size={13} />
                <span>ZIP으로 압축</span>
              </button>
              {selectedEntries.length === 1 &&
                !selectedEntries[0].isDir &&
                selectedEntries[0].extension.toLowerCase() === "zip" && (
                  <button
                    type="button"
                    className="ctx-item"
                    onClick={() => {
                      onUnzip(selectedEntries[0].path, currentPath);
                      setContextMenu(null);
                    }}
                  >
                    <PackageOpen size={13} />
                    <span>여기에 압축 풀기</span>
                  </button>
                )}
              <button
                type="button"
                className="ctx-item"
                onClick={() => {
                  onOpenProperties(selectedEntries);
                  setContextMenu(null);
                }}
              >
                <Info size={13} />
                <span>속성 (Alt+Enter)</span>
              </button>
            </>
          )}

          {pane.selectedPaths.length > 0 && (
            <>
              <div className="ctx-divider" />
              <button
                type="button"
                className="ctx-item danger"
                onClick={() => {
                  onDeletePaths(pane.index, pane.selectedPaths, false);
                  setContextMenu(null);
                }}
              >
                <Trash2 size={13} />
                <span>휴지통으로 삭제 (Del)</span>
              </button>
              <button
                type="button"
                className="ctx-item danger"
                onClick={() => {
                  onDeletePaths(pane.index, pane.selectedPaths, true);
                  setContextMenu(null);
                }}
              >
                <Trash2 size={13} />
                <span>영구 삭제 (Shift+Del)</span>
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
};
