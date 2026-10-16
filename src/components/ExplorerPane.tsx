import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  onDeletePaths: (paneIndex: number, paths: string[], permanent: boolean) => void;
  onAddQuickLink: (name: string, targetPath: string) => void;
  onEntriesLoaded?: (paneIndex: number, entries: FileEntry[]) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

function renderEntryIcon(entry: FileEntry, _color?: string, size = 16) {
  return <EntryGraphic3DIcon entry={entry} size={size} />;
}

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

  // Inline rename state
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
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const loadDir = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await apiListDirectory(currentPath, showHidden);
      setEntries(list);
      onEntriesLoaded?.(pane.index, list);
    } catch (err) {
      setErrorMsg(String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [currentPath, showHidden, pane.index, onEntriesLoaded]);

  useEffect(() => {
    setAddressInput(currentPath);
    loadDir();
  }, [currentPath, showHidden, refreshTrigger, loadDir]);

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
    setRenamingPath(entry.path);
    setRenameValue(entry.name);
  };

  const commitRename = async () => {
    if (!renamingPath) return;
    const targetPath = renamingPath;
    const newName = renameValue.trim();
    setRenamingPath(null);
    if (!newName) return;

    try {
      await apiRenameItem(targetPath, newName);
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
        await apiCreateDirectory(currentPath, name);
        onNotify(`새 폴더 생성 완료: ${name}`);
      } else {
        await apiCreateTextFile(currentPath, name, "");
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

    onNotify(`${targetDirs.length}개 폴더 용량 계산 중...`);
    const nextSizes = { ...pane.folderSizes };
    for (const dir of targetDirs) {
      try {
        const stats = await apiCalculateFolderSize(dir.path);
        nextSizes[dir.path] = stats.totalBytes;
      } catch {
        // Ignore inaccessible system folder
      }
    }
    onUpdatePane(pane.index, { folderSizes: nextSizes });
    onNotify("폴더 크기 계산이 완료되었습니다.");
  };

  // Drag & Drop handlers between panes
  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const dragPaths = pane.selectedPaths.includes(entry.path)
      ? pane.selectedPaths
      : [entry.path];
    e.dataTransfer.setData(
      "application/x-jdir-items",
      JSON.stringify({
        sourcePaneIndex: pane.index,
        paths: dragPaths,
      })
    );
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-jdir-items")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.shiftKey ? "move" : "copy";
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const raw = e.dataTransfer.getData("application/x-jdir-items");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { sourcePaneIndex: number; paths: string[] };
      if (parsed.paths && parsed.paths.length > 0) {
        const mode = e.shiftKey ? "move" : "copy";
        onTransferBetweenPanes(parsed.sourcePaneIndex, pane.index, parsed.paths, mode);
      }
    } catch {
      // ignore invalid payload
    }
  };

  const showLocalTree = globalTreeMode === 0 || pane.showLocalTree;
  const parentPath = getParentPath(currentPath);

  return (
    <section
      className={`explorer-pane ${isFocused ? "focused-pane" : ""} ${
        isDragOver ? "drag-over-pane" : ""
      }`}
      onMouseDown={() => onFocusPane(pane.index)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
                    className="crumb-btn"
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
              className={`drive-chip ${isCurrentDrive ? "active" : ""}`}
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
            <table className="file-details-table">
              <thead>
                <tr>
                  <th onClick={() => handleSortClick("name")} className="col-name">
                    <span>이름</span>
                    {pane.sortField === "name" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </th>
                  <th onClick={() => handleSortClick("size")} className="col-size">
                    <span>크기</span>
                    {pane.sortField === "size" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </th>
                  <th onClick={() => handleSortClick("fileType")} className="col-type">
                    <span>유형</span>
                    {pane.sortField === "fileType" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </th>
                  <th onClick={() => handleSortClick("modifiedMs")} className="col-date">
                    <span>수정한 날짜</span>
                    {pane.sortField === "modifiedMs" &&
                      (pane.sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {parentPath && (
                  <tr
                    className="file-row parent-dir-row"
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
                      draggable={!isRenaming}
                      onDragStart={(e) => handleDragStart(e, entry)}
                      className={`file-row ${isSelected ? "selected" : ""} ${
                        entry.isHidden ? "hidden-entry" : ""
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
                              if (e.key === "Escape") setRenamingPath(null);
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
                <div className="file-card parent-card" onDoubleClick={handleGoUp}>
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
                    draggable
                    onDragStart={(e) => handleDragStart(e, entry)}
                    className={`file-card ${isSelected ? "selected" : ""}`}
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
            {[0, 1, 2, 3]
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

          {clipboard && clipboard.paths.length > 0 && (
            <button
              type="button"
              className="ctx-item"
              onClick={() => {
                onPasteFromClipboard(pane.index);
                setContextMenu(null);
              }}
            >
              <Clipboard size={13} />
              <span>여기에 붙여넣기 ({clipboard.paths.length}개)</span>
            </button>
          )}

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
