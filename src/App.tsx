import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import {
  ClipboardState,
  ColorFilterRule,
  ConflictPolicy,
  DriveInfo,
  FileEntry,
  JobState,
  LayoutMode,
  PaneState,
  PaneTab,
  QuickLinkItem,
  SavedQdrPreset,
  SortField,
  UndoOp,
  UpdateCheckResult,
  ViewMode,
} from "./types/jdir";
import {
  DEFAULT_QDIR_COLOR_RULES,
  getParentPath,
  qdirAlsToLayoutMode,
  qdirViewModeNumberToViewMode,
} from "./utils/colorFilter";
import {
  apiCancelJob,
  apiCheckConflicts,
  apiCheckForUpdates,
  apiClipboardClear,
  apiClipboardGetFiles,
  apiClipboardSetFiles,
  apiCopyItems,
  apiJobDone,
  apiOpenItem,
  apiRestoreMoves,
  apiUnzip,
  apiWatchDirs,
  apiZipItems,
  onFsChanged,
  onJobProgress,
  apiDeleteItems,
  apiImportQDirConfig,
  apiInstallUpdateAndRestart,
  apiListDrives,
  apiMoveItems,
} from "./services/tauriApi";
import { TopMenuBar } from "./components/TopMenuBar";
import { DirectoryTree } from "./components/DirectoryTree";
import { ExplorerPane } from "./components/ExplorerPane";
import { PreviewPanel } from "./components/PreviewPanel";
import { emit, listen } from "@tauri-apps/api/event";
import { apiClosePreviewWindow, apiFocusMainWindow, apiOpenPreviewWindow } from "./services/tauriApi";
import { PREVIEW_EVENTS, PREVIEW_MODE_KEY, loadWinRect } from "./utils/previewWindow";
import { GlobalFooter } from "./components/GlobalFooter";
import { JobPanel } from "./components/JobPanel";
import { PropertiesModal } from "./components/PropertiesModal";
import { SearchModal } from "./components/SearchModal";
import {
  ColorFilterModal,
  ConfirmDeleteDialog,
  ConflictDialog,
  ExportListModal,
  MagnifierHud,
  PresetsAndFavoritesModal,
  UpdateModal,
} from "./components/Modals";

function folderTitleFromPath(path: string): string {
  const cleaned = path.replace(/[\\/]+$/, "");
  if (/^[A-Za-z]:$/.test(cleaned)) {
    return `${cleaned}\\`;
  }
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function makeInitialPane(
  index: number,
  initialPath: string,
  viewMode: ViewMode = "details",
  showFilterBar = true
): PaneState {
  const tabId = `tab-${index}-init`;
  return {
    index,
    tabs: [
      {
        id: tabId,
        title: folderTitleFromPath(initialPath),
        path: initialPath,
        history: [initialPath],
        historyIndex: 0,
      },
    ],
    activeTabId: tabId,
    viewMode,
    sortField: "name",
    sortAsc: true,
    showFilterBar,
    includeFilter: "",
    negativeFilter: "",
    showLocalTree: false,
    selectedPaths: [],
    folderSizes: {},
  };
}

const SESSION_KEY = "jdir_session_v1";
const ALL_LAYOUTS: LayoutMode[] = [
  "4-grid",
  "4-columns",
  "4-rows",
  "3-top1-bottom2",
  "3-top2-bottom1",
  "3-left1-right2",
  "3-left2-right1",
  "2-vertical",
  "2-horizontal",
  "1-single",
];
const ALL_VIEW_MODES: ViewMode[] = ["details", "large-icons", "small-icons", "list", "tiles"];
const ALL_SORT_FIELDS: SortField[] = ["name", "size", "extension", "modifiedMs", "fileType"];

interface SessionData {
  theme: "dark" | "light";
  layoutMode: LayoutMode;
  treeMode: number;
  previewEnabled: boolean;
  useColorStart: boolean;
  showHidden: boolean;
  confirmTrash: boolean;
  zoomPct: number;
  sptPct: number;
  sp0Pct: number;
  sp1Pct: number;
  sp2Pct: number;
  activeFocus: number;
  colorRules: ColorFilterRule[] | null;
  quickLinks: QuickLinkItem[];
  panes: PaneState[];
}

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: Record<string, any> = JSON.parse(raw);
    if (!d || d.v !== 1 || !Array.isArray(d.panes) || d.panes.length !== 4) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const panes: PaneState[] = d.panes.map((p: Record<string, any>, i: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tabs: PaneTab[] = (Array.isArray(p?.tabs) ? p.tabs : [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((t: Record<string, any>) => t && typeof t.id === "string" && typeof t.path === "string")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: Record<string, any>): PaneTab => {
          const history: string[] =
            Array.isArray(t.history) && t.history.length > 0 && t.history.every((h: unknown) => typeof h === "string")
              ? t.history
              : [t.path];
          return {
            id: t.id,
            title: folderTitleFromPath(t.path),
            path: t.path,
            history,
            historyIndex: clampNum(t.historyIndex, history.length - 1, 0, history.length - 1),
          };
        });
      if (tabs.length === 0) {
        return makeInitialPane(i, "C:\\");
      }
      const activeTabId = tabs.some((t) => t.id === p.activeTabId) ? p.activeTabId : tabs[0].id;
      return {
        index: i,
        tabs,
        activeTabId,
        viewMode: ALL_VIEW_MODES.includes(p.viewMode) ? p.viewMode : "details",
        sortField: ALL_SORT_FIELDS.includes(p.sortField) ? p.sortField : "name",
        sortAsc: typeof p.sortAsc === "boolean" ? p.sortAsc : true,
        showFilterBar: typeof p.showFilterBar === "boolean" ? p.showFilterBar : true,
        includeFilter: typeof p.includeFilter === "string" ? p.includeFilter : "",
        negativeFilter: typeof p.negativeFilter === "string" ? p.negativeFilter : "",
        showLocalTree: Boolean(p.showLocalTree),
        selectedPaths: [],
        folderSizes: {},
      };
    });

    return {
      theme: d.theme === "dark" ? "dark" : "light",
      layoutMode: ALL_LAYOUTS.includes(d.layoutMode) ? d.layoutMode : "4-grid",
      treeMode: [0, 1, 2].includes(d.treeMode) ? d.treeMode : 1,
      previewEnabled: Boolean(d.previewEnabled),
      useColorStart: d.useColorStart !== false,
      showHidden: d.showHidden !== false,
      confirmTrash: d.confirmTrash !== false,
      zoomPct: clampNum(d.zoomPct, 100, 85, 160),
      sptPct: clampNum(d.sptPct, 17, 12, 35),
      sp0Pct: clampNum(d.sp0Pct, 50, 15, 85),
      sp1Pct: clampNum(d.sp1Pct, 50, 15, 85),
      sp2Pct: clampNum(d.sp2Pct, 50, 15, 85),
      activeFocus: clampNum(d.activeFocus, 0, 0, 3),
      colorRules: Array.isArray(d.colorRules) && d.colorRules.length > 0 ? d.colorRules : null,
      quickLinks: Array.isArray(d.quickLinks) ? d.quickLinks : [],
      panes,
    };
  } catch {
    return null;
  }
}

/** Panes that are actually on screen for a layout (hidden panes must never be a transfer target). */
function visiblePaneIndices(layout: LayoutMode, activeFocus: number): number[] {
  switch (layout) {
    case "1-single":
      return [activeFocus];
    case "2-vertical":
    case "2-horizontal":
      return [0, 1];
    case "3-top1-bottom2":
    case "3-top2-bottom1":
    case "3-left1-right2":
    case "3-left2-right1":
      return [0, 1, 2];
    default:
      return [0, 1, 2, 3];
  }
}

const initialSession = loadSession();

export const App: React.FC = () => {
  const [theme, setTheme] = useState<"dark" | "light">(initialSession?.theme ?? "light");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initialSession?.layoutMode ?? "4-grid");
  const [treeCollapsed, setTreeCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("jdir-tree-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const setTreeCollapsedPersist = (v: boolean) => {
    setTreeCollapsed(v);
    try {
      localStorage.setItem("jdir-tree-collapsed", v ? "1" : "0");
    } catch {
      // ignore
    }
  };
  const [treeMode, setTreeMode] = useState<number>(initialSession?.treeMode ?? 1); // 1 = Global tree, 0 = Per-pane tree, 2 = Off
  const [previewEnabled, setPreviewEnabled] = useState<boolean>(initialSession?.previewEnabled ?? false);
  const [useColorStart, setUseColorStart] = useState<boolean>(initialSession?.useColorStart ?? true);
  const [showHidden, setShowHidden] = useState<boolean>(initialSession?.showHidden ?? true);
  const [confirmTrash, setConfirmTrash] = useState<boolean>(initialSession?.confirmTrash ?? true);
  const [zoomPct, setZoomPct] = useState<number>(initialSession?.zoomPct ?? 100);
  const [magnifierActive, setMagnifierActive] = useState<boolean>(false);

  // Q-Dir split ratios (in percentages, mapped from SP0=5000, SP1=5000, SP2=5000, SPT=1617)
  const [sptPct, setSptPct] = useState<number>(initialSession?.sptPct ?? 17);
  const [sp0Pct, setSp0Pct] = useState<number>(initialSession?.sp0Pct ?? 50);
  const [sp1Pct, setSp1Pct] = useState<number>(initialSession?.sp1Pct ?? 50);
  const [sp2Pct, setSp2Pct] = useState<number>(initialSession?.sp2Pct ?? 50);

  const [activeFocus, setActiveFocus] = useState<number>(initialSession?.activeFocus ?? 2); // Focus=3 in Q-Dir -> index 2 (or 0..3)
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLinkItem[]>(initialSession?.quickLinks ?? []);
  const [colorRules, setColorRules] = useState<ColorFilterRule[]>(
    initialSession?.colorRules ?? DEFAULT_QDIR_COLOR_RULES
  );
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [selectedForPreview, setSelectedForPreview] = useState<FileEntry | null>(null);
  const [previewMode, setPreviewMode] = useState<"dock" | "popup">(() => {
    try {
      return localStorage.getItem(PREVIEW_MODE_KEY) === "popup" ? "popup" : "dock";
    } catch {
      return "dock";
    }
  });
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // First run starts on C:\ and is then populated from Q-Dir settings / built-in defaults.
  const [panes, setPanes] = useState<PaneState[]>(
    () =>
      initialSession?.panes ?? [
        makeInitialPane(0, "C:\\", "details", true),
        makeInitialPane(1, "C:\\", "details", true),
        makeInitialPane(2, "C:\\", "details", true),
        makeInitialPane(3, "C:\\", "details", true),
      ]
  );

  const paneEntriesRef = useRef<Record<number, FileEntry[]>>({});
  const [paneEntriesMap, setPaneEntriesMap] = useState<Record<number, FileEntry[]>>({});

  const handleEntriesLoaded = useCallback((idx: number, list: FileEntry[]) => {
    paneEntriesRef.current[idx] = list;
    setPaneEntriesMap((prev) => ({ ...prev, [idx]: list }));
  }, []);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    "color" | "presets" | "export" | "update" | "search" | null
  >(null);
  const [savedPresets, setSavedPresets] = useState<SavedQdrPreset[]>(() => {
    try {
      const raw = localStorage.getItem("jdir_saved_presets");
      if (!raw) return [];
      const parsed: SavedQdrPreset[] = JSON.parse(raw);
      return parsed.map((p) => ({
        ...p,
        name: p.name.replace(/^원본\s+/, ""),
      }));
    } catch {
      return [];
    }
  });

  // Auto-update state
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateChecking, setUpdateChecking] = useState<boolean>(false);
  const [updateInstalling, setUpdateInstalling] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{
    paneIndex: number;
    paths: string[];
    permanent: boolean;
  } | null>(null);
  const [conflictPrompt, setConflictPrompt] = useState<{
    names: string[];
    mode: "copy" | "move";
    resolve: (policy: ConflictPolicy | null) => void;
  } | null>(null);
  const [propsEntries, setPropsEntries] = useState<FileEntry[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [paneRefresh, setPaneRefresh] = useState<number[]>([0, 0, 0, 0]);
  const undoStackRef = useRef<UndoOp[]>([]);
  const jobSeqRef = useRef(0);
  const dialogOpen =
    activeModal !== null ||
    pendingDelete !== null ||
    conflictPrompt !== null ||
    propsEntries !== null;

  const notify = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCheckUpdates = useCallback(
    async (manual = false) => {
      setUpdateChecking(true);
      setUpdateError(null);
      try {
        const res = await apiCheckForUpdates();
        setUpdateInfo(res);
        if (res.updateAvailable) {
          setActiveModal("update");
        } else if (manual) {
          setActiveModal("update");
        }
      } catch (err) {
        setUpdateError(String(err));
        if (manual) {
          setActiveModal("update");
        }
      } finally {
        setUpdateChecking(false);
      }
    },
    []
  );

  const handleInstallUpdateAndRestart = useCallback(async () => {
    if (!updateInfo || !updateInfo.downloadUrl) {
      setUpdateError("다운로드 가능한 설치 파일 URL을 찾을 수 없습니다.");
      return;
    }
    setUpdateInstalling(true);
    setUpdateError(null);
    try {
      await apiInstallUpdateAndRestart(updateInfo.downloadUrl, updateInfo.assetName);
      notify("업데이트 설치를 시작합니다. 잠시 후 앱이 재시작됩니다...");
    } catch (err) {
      setUpdateError(String(err));
      setUpdateInstalling(false);
    }
  }, [updateInfo, notify]);

  const applyQDirConfig = useCallback(
    async (customPath?: string, showToast = false) => {
      try {
        const cfg = await apiImportQDirConfig(customPath);
        setLayoutMode(qdirAlsToLayoutMode(cfg.layoutMode));
        setUseColorStart(cfg.useColorStart);
        setTreeMode(cfg.treeMode);
        setSp0Pct(Math.round((cfg.sp0 || 5000) / 100));
        setSp1Pct(Math.round((cfg.sp1 || 5000) / 100));
        setSp2Pct(Math.round((cfg.sp2 || 5000) / 100));
        setSptPct(Math.max(12, Math.min(35, Math.round((cfg.spt || 1617) / 100))));
        setPreviewEnabled(cfg.previewEnabled);
        const focusIdx = Math.max(0, Math.min(3, (cfg.activeFocus || 1) - 1));
        setActiveFocus(focusIdx);

        if (cfg.colorRules && cfg.colorRules.length > 0) {
          setColorRules(cfg.colorRules);
        }
        if (cfg.quickLinks && cfg.quickLinks.length > 0) {
          setQuickLinks(cfg.quickLinks);
        }

        setPanes((prev) =>
          prev.map((pane, idx) => {
            const targetPath = cfg.panePaths[idx] || pane.tabs[0].path;
            const vm = qdirViewModeNumberToViewMode(cfg.paneViewModes[idx] || 4);
            const tabId = `tab-${idx}-${Date.now()}`;
            return {
              ...pane,
              viewMode: vm,
              showFilterBar: true,
              tabs: [
                {
                  id: tabId,
                  title: folderTitleFromPath(targetPath),
                  path: targetPath,
                  history: [targetPath],
                  historyIndex: 0,
                },
              ],
              activeTabId: tabId,
              selectedPaths: [],
            };
          })
        );

        // Save initial start.qdr preset if empty
        setSavedPresets((prev) => {
          const cleanedPrev = prev.map((p) => ({
            ...p,
            name: p.name.replace(/^원본\s+/, ""),
          }));
          if (cleanedPrev.some((p) => p.id === "qdir-original-start")) return cleanedPrev;
          const origPreset: SavedQdrPreset = {
            id: "qdir-original-start",
            name: "Q-Dir 설정 (start.qdr & Q-Dir.ini)",
            createdAt: "Q-Dir 5.00 호환",
            layoutMode: qdirAlsToLayoutMode(cfg.layoutMode),
            treeMode: cfg.treeMode,
            sp0: cfg.sp0,
            sp1: cfg.sp1,
            sp2: cfg.sp2,
            spt: cfg.spt,
            panePaths: cfg.panePaths,
            paneViewModes: [
              qdirViewModeNumberToViewMode(cfg.paneViewModes[0]),
              qdirViewModeNumberToViewMode(cfg.paneViewModes[1]),
              qdirViewModeNumberToViewMode(cfg.paneViewModes[2]),
              qdirViewModeNumberToViewMode(cfg.paneViewModes[3]),
            ],
          };
          return [origPreset, ...cleanedPrev];
        });

        if (showToast) {
          notify(`Q-Dir 설정(${cfg.sourceDir})을 성공적으로 불러왔습니다.`);
        }
      } catch (err) {
        if (showToast) {
          notify(String(err), true);
        }
      }
    },
    [notify]
  );

  // Initial load: Drives + Q-Dir.ini / start.qdr auto-import + GitHub Release update check
  useEffect(() => {
    apiListDrives()
      .then(setDrives)
      .catch(() => {});
    if (!initialSession) {
      applyQDirConfig(undefined, false);
    }
    handleCheckUpdates(false);
  }, [applyQDirConfig, handleCheckUpdates]);

  const handleUpdatePane = useCallback((paneIndex: number, patch: Partial<PaneState>) => {
    setPanes((prev) =>
      prev.map((p, idx) => (idx === paneIndex ? { ...p, ...patch } : p))
    );
  }, []);

  const handleNavigate = useCallback(
    (paneIndex: number, newPath: string, addToHistory = true) => {
      setPanes((prev) =>
        prev.map((p, idx) => {
          if (idx !== paneIndex) return p;
          const nextTabs: PaneTab[] = p.tabs.map((tab) => {
            if (tab.id !== p.activeTabId) return tab;
            const nextHistory = addToHistory
              ? [...tab.history.slice(0, tab.historyIndex + 1), newPath]
              : tab.history;
            return {
              ...tab,
              path: newPath,
              title: folderTitleFromPath(newPath),
              history: nextHistory,
              historyIndex: addToHistory ? nextHistory.length - 1 : tab.historyIndex,
            };
          });
          return {
            ...p,
            tabs: nextTabs,
            selectedPaths: [],
          };
        })
      );
    },
    []
  );

  const handleHistoryBack = useCallback((paneIndex: number) => {
    setPanes((prev) =>
      prev.map((p, idx) => {
        if (idx !== paneIndex) return p;
        const nextTabs = p.tabs.map((tab) => {
          if (tab.id !== p.activeTabId || tab.historyIndex <= 0) return tab;
          const nextIdx = tab.historyIndex - 1;
          const targetPath = tab.history[nextIdx];
          return {
            ...tab,
            path: targetPath,
            title: folderTitleFromPath(targetPath),
            historyIndex: nextIdx,
          };
        });
        return { ...p, tabs: nextTabs, selectedPaths: [] };
      })
    );
  }, []);

  const handleHistoryForward = useCallback((paneIndex: number) => {
    setPanes((prev) =>
      prev.map((p, idx) => {
        if (idx !== paneIndex) return p;
        const nextTabs = p.tabs.map((tab) => {
          if (tab.id !== p.activeTabId || tab.historyIndex >= tab.history.length - 1)
            return tab;
          const nextIdx = tab.historyIndex + 1;
          const targetPath = tab.history[nextIdx];
          return {
            ...tab,
            path: targetPath,
            title: folderTitleFromPath(targetPath),
            historyIndex: nextIdx,
          };
        });
        return { ...p, tabs: nextTabs, selectedPaths: [] };
      })
    );
  }, []);

  const handleAddTab = useCallback((paneIndex: number, initialPath?: string) => {
    setPanes((prev) =>
      prev.map((p, idx) => {
        if (idx !== paneIndex) return p;
        const activeTab = p.tabs.find((t) => t.id === p.activeTabId) || p.tabs[0];
        const path = initialPath || activeTab?.path || "C:\\";
        const newTab: PaneTab = {
          id: `tab-${paneIndex}-${Date.now()}`,
          title: folderTitleFromPath(path),
          path,
          history: [path],
          historyIndex: 0,
        };
        return {
          ...p,
          tabs: [...p.tabs, newTab],
          activeTabId: newTab.id,
          selectedPaths: [],
        };
      })
    );
  }, []);

  const handleCloseTab = useCallback((paneIndex: number, tabId: string) => {
    setPanes((prev) =>
      prev.map((p, idx) => {
        if (idx !== paneIndex || p.tabs.length <= 1) return p;
        const remaining = p.tabs.filter((t) => t.id !== tabId);
        const nextActiveId =
          p.activeTabId === tabId ? remaining[remaining.length - 1].id : p.activeTabId;
        return {
          ...p,
          tabs: remaining,
          activeTabId: nextActiveId,
          selectedPaths: [],
        };
      })
    );
  }, []);

  const handleSelectTab = useCallback((paneIndex: number, tabId: string) => {
    setPanes((prev) =>
      prev.map((p, idx) =>
        idx === paneIndex ? { ...p, activeTabId: tabId, selectedPaths: [] } : p
      )
    );
  }, []);

  const handleCopySelectionToClipboard = useCallback(
    (paneIndex: number, mode: "copy" | "cut", paths: string[]) => {
      if (paths.length === 0) return;
      setClipboard({ mode, paths, sourcePaneIndex: paneIndex });
      // Also publish to the Windows clipboard so Explorer / other apps can paste these files.
      apiClipboardSetFiles(paths, mode === "cut").catch(() => {});
      notify(
        `${paths.length}개 항목이 클립보드에 ${
          mode === "copy" ? "복사" : "잘라내기"
        }되었습니다.`
      );
    },
    [notify]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    onJobProgress((ev) => {
      setJobs((prev) =>
        prev[ev.jobId]
          ? {
              ...prev,
              [ev.jobId]: {
                ...prev[ev.jobId],
                doneBytes: ev.doneBytes,
                totalBytes: ev.totalBytes,
                doneItems: ev.doneItems,
                totalItems: ev.totalItems,
                current: ev.current,
              },
            }
          : prev
      );
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  /** Runs a long operation with a progress card + cancel button. */
  const runJob = useCallback(
    async <T,>(label: string, fn: (jobId: string) => Promise<T>): Promise<T> => {
      const id = `job-${Date.now()}-${jobSeqRef.current++}`;
      setJobs((prev) => ({
        ...prev,
        [id]: {
          id,
          label,
          doneBytes: 0,
          totalBytes: 0,
          doneItems: 0,
          totalItems: 0,
          current: "",
          cancelling: false,
        },
      }));
      try {
        return await fn(id);
      } finally {
        apiJobDone(id).catch(() => {});
        setJobs((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    []
  );

  const cancelJob = useCallback((id: string) => {
    apiCancelJob(id).catch(() => {});
    setJobs((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], cancelling: true } } : prev));
  }, []);

  const pushUndo = useCallback((op: UndoOp) => {
    undoStackRef.current.push(op);
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }, []);

  const performUndo = useCallback(async () => {
    const op = undoStackRef.current.pop();
    if (!op) {
      notify("되돌릴 작업이 없습니다.");
      return;
    }
    try {
      const report =
        op.kind === "move-back"
          ? await apiRestoreMoves(op.pairs)
          : await apiDeleteItems(op.paths, false);
      setRefreshTrigger((t) => t + 1);
      if (report.failed.length > 0) {
        notify(`되돌리기 실패 (${op.label}): ${report.failed[0].error}`, true);
      } else {
        notify(`되돌렸습니다: ${op.label}`);
      }
    } catch (err) {
      notify(String(err), true);
    }
  }, [notify]);

  const askConflictPolicy = useCallback(
    (names: string[], mode: "copy" | "move") =>
      new Promise<ConflictPolicy | null>((resolve) => {
        setConflictPrompt({ names, mode, resolve });
      }),
    []
  );

  /** Copies/moves `paths` into `destDir`, asking how to resolve name conflicts. Returns true on full success. */
  const executeTransfer = useCallback(
    async (
      paths: string[],
      destDir: string,
      mode: "copy" | "move",
      label: string
    ): Promise<boolean> => {
      try {
        const names = await apiCheckConflicts(paths, destDir);
        let policy: ConflictPolicy = "rename";
        if (names.length > 0) {
          const chosen = await askConflictPolicy(names, mode);
          if (!chosen) {
            notify("작업이 취소되었습니다.");
            return false;
          }
          policy = chosen;
        }
        const report = await runJob(label, (jobId) =>
          mode === "copy"
            ? apiCopyItems(paths, destDir, policy, jobId)
            : apiMoveItems(paths, destDir, policy, jobId)
        );

        setRefreshTrigger((t) => t + 1);
        const skippedCount = report.skipped?.length ?? 0;
        const pairs = report.pairs ?? [];
        // Overwriting destroys the previous file, so it cannot be undone safely.
        if (pairs.length > 0 && policy !== "overwrite") {
          pushUndo(
            mode === "copy"
              ? { label: `${label}`, kind: "trash", paths: pairs.map((p) => p.to) }
              : { label: `${label}`, kind: "move-back", pairs }
          );
        }
        if (report.cancelled) {
          notify(`작업을 취소했습니다 (${report.succeeded.length}개 완료).`, true);
          return false;
        }
        if (report.failed.length > 0) {
          notify(
            `성공 ${report.succeeded.length}개 / 실패 ${report.failed.length}개: ${report.failed[0].error}`,
            true
          );
          return false;
        }
        if (report.succeeded.length === 0) {
          notify(`변경된 항목이 없습니다 (건너뜀 ${skippedCount}개).`);
          return true;
        }
        notify(
          `${label} ${report.succeeded.length}개 완료${skippedCount > 0 ? ` (건너뜀 ${skippedCount}개)` : ""}`
        );
        return true;
      } catch (err) {
        notify(String(err), true);
        return false;
      }
    },
    [askConflictPolicy, notify, runJob, pushUndo]
  );

  const handlePasteFromClipboard = useCallback(
    async (targetPaneIndex: number) => {
      // Prefer the Windows clipboard (works for files copied in Explorer as well as in J-Dir).
      let paths: string[] | null = null;
      let mode: "copy" | "cut" = "copy";
      try {
        const osFiles = await apiClipboardGetFiles();
        if (osFiles && osFiles.paths.length > 0) {
          paths = osFiles.paths;
          mode = osFiles.cut ? "cut" : "copy";
        }
      } catch {
        // fall back to the in-app clipboard
      }
      if (!paths && clipboard && clipboard.paths.length > 0) {
        paths = clipboard.paths;
        mode = clipboard.mode;
      }
      if (!paths) {
        notify("붙여넣을 파일이 클립보드에 없습니다.", true);
        return;
      }
      const targetPane = panes[targetPaneIndex];
      const activeTab =
        targetPane.tabs.find((t) => t.id === targetPane.activeTabId) ||
        targetPane.tabs[0];
      const destDir = activeTab.path;
      const ok = await executeTransfer(
        paths,
        destDir,
        mode === "copy" ? "copy" : "move",
        `패널 #${targetPaneIndex + 1}(${folderTitleFromPath(destDir)}) 붙여넣기`
      );
      if (ok && mode === "cut") {
        setClipboard(null);
        apiClipboardClear().catch(() => {});
      }
    },
    [clipboard, panes, executeTransfer, notify]
  );

  const handleTransferBetweenPanes = useCallback(
    async (
      sourcePaneIndex: number,
      targetPaneIndex: number,
      paths: string[],
      mode: "copy" | "move"
    ) => {
      if (paths.length === 0) return;
      const targetPane = panes[targetPaneIndex];
      const activeTab =
        targetPane.tabs.find((t) => t.id === targetPane.activeTabId) ||
        targetPane.tabs[0];
      await executeTransfer(
        paths,
        activeTab.path,
        mode,
        `패널 #${sourcePaneIndex + 1} → #${targetPaneIndex + 1} ${mode === "copy" ? "복사" : "이동"}`
      );
    },
    [panes, executeTransfer]
  );

  const handleDropToPath = useCallback(
    (destDir: string, paths: string[], mode: "copy" | "move") => {
      executeTransfer(
        paths,
        destDir,
        mode,
        `${folderTitleFromPath(destDir)}(으)로 ${mode === "copy" ? "복사" : "이동"}`
      );
    },
    [executeTransfer]
  );

  const handleZip = useCallback(
    async (paths: string[], baseDir: string, suggestedName: string) => {
      const dest = `${baseDir.replace(/[\\/]+$/, "")}\\${suggestedName}.zip`;
      try {
        const out = await runJob(`ZIP 압축: ${suggestedName}`, (jobId) =>
          apiZipItems(paths, dest, jobId)
        );
        pushUndo({ label: `ZIP 압축 (${suggestedName})`, kind: "trash", paths: [out] });
        setRefreshTrigger((t) => t + 1);
        notify(`압축 완료: ${folderTitleFromPath(out)}`);
      } catch (err) {
        const msg = String(err);
        notify(msg.includes("취소") ? "압축을 취소했습니다." : msg, !msg.includes("취소"));
        setRefreshTrigger((t) => t + 1);
      }
    },
    [runJob, pushUndo, notify]
  );

  const handleUnzip = useCallback(
    async (zipPath: string, destDir: string) => {
      try {
        const out = await runJob(`압축 풀기: ${folderTitleFromPath(zipPath)}`, (jobId) =>
          apiUnzip(zipPath, destDir, jobId)
        );
        pushUndo({ label: `압축 풀기 (${folderTitleFromPath(zipPath)})`, kind: "trash", paths: [out] });
        setRefreshTrigger((t) => t + 1);
        notify(`압축 풀기 완료: ${folderTitleFromPath(out)}`);
      } catch (err) {
        const msg = String(err);
        notify(msg.includes("취소") ? "압축 풀기를 취소했습니다." : msg, !msg.includes("취소"));
        setRefreshTrigger((t) => t + 1);
      }
    },
    [runJob, pushUndo, notify]
  );

  const performDelete = useCallback(
    async (paneIndex: number, paths: string[], permanent: boolean) => {
      try {
        const report = await apiDeleteItems(paths, permanent);
        handleUpdatePane(paneIndex, { selectedPaths: [] });
        setRefreshTrigger((t) => t + 1);
        if (report.failed.length > 0) {
          notify(`삭제 실패: ${report.failed[0].error}`, true);
        } else {
          notify(
            `${report.succeeded.length}개 항목을 ${
              permanent ? "영구 삭제" : "휴지통으로 이동"
            }했습니다.`
          );
        }
      } catch (err) {
        notify(String(err), true);
      }
    },
    [handleUpdatePane, notify]
  );

  const handleDeletePaths = useCallback(
    (paneIndex: number, paths: string[], permanent: boolean) => {
      if (paths.length === 0) return;
      if (permanent || confirmTrash) {
        setPendingDelete({ paneIndex, paths, permanent });
      } else {
        performDelete(paneIndex, paths, false);
      }
    },
    [confirmTrash, performDelete]
  );

  const handleAddQuickLink = useCallback(
    (name: string, targetPath: string) => {
      setQuickLinks((prev) => {
        if (prev.some((q) => q.targetPath === targetPath)) return prev;
        return [...prev, { name, targetPath, category: "Quick-Link" }];
      });
      notify(`즐겨찾기(Quick-Link) 추가: ${name}`);
    },
    [notify]
  );

  const handleRemoveQuickLink = useCallback(
    (targetPath: string) => {
      setQuickLinks((prev) => prev.filter((q) => q.targetPath !== targetPath));
      notify("즐겨찾기에서 제거되었습니다.");
    },
    [notify]
  );

  const handleSaveCurrentPreset = useCallback(
    (name: string) => {
      const panePaths = panes.map((p) => {
        const tab = p.tabs.find((t) => t.id === p.activeTabId) || p.tabs[0];
        return tab.path;
      }) as [string, string, string, string];
      const paneViewModes = panes.map((p) => p.viewMode) as [
        ViewMode,
        ViewMode,
        ViewMode,
        ViewMode
      ];
      const preset: SavedQdrPreset = {
        id: `preset-${Date.now()}`,
        name,
        createdAt: new Date().toLocaleString("ko-KR"),
        layoutMode,
        treeMode,
        sp0: sp0Pct * 100,
        sp1: sp1Pct * 100,
        sp2: sp2Pct * 100,
        spt: sptPct * 100,
        panePaths,
        paneViewModes,
      };
      setSavedPresets((prev) => {
        const next = [preset, ...prev];
        localStorage.setItem("jdir_saved_presets", JSON.stringify(next));
        return next;
      });
      notify(`.qdr 레이아웃 프리셋 저장 완료: ${name}`);
    },
    [panes, layoutMode, treeMode, sp0Pct, sp1Pct, sp2Pct, sptPct, notify]
  );

  const handleLoadPreset = useCallback(
    (preset: SavedQdrPreset) => {
      setLayoutMode(preset.layoutMode);
      setTreeMode(preset.treeMode);
      setSp0Pct(Math.round((preset.sp0 || 5000) / 100));
      setSp1Pct(Math.round((preset.sp1 || 5000) / 100));
      setSp2Pct(Math.round((preset.sp2 || 5000) / 100));
      setSptPct(Math.max(12, Math.min(35, Math.round((preset.spt || 1617) / 100))));
      setPanes((prev) =>
        prev.map((p, idx) => {
          const path = preset.panePaths[idx] || "C:\\";
          const tabId = `tab-${idx}-${Date.now()}`;
          return {
            ...p,
            viewMode: preset.paneViewModes[idx] || "details",
            tabs: [
              {
                id: tabId,
                title: folderTitleFromPath(path),
                path,
                history: [path],
                historyIndex: 0,
              },
            ],
            activeTabId: tabId,
            selectedPaths: [],
          };
        })
      );
      notify(`프리셋 불러오기 완료: ${preset.name}`);
    },
    [notify]
  );

  const handleDeletePreset = useCallback((id: string) => {
    setSavedPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      localStorage.setItem("jdir_saved_presets", JSON.stringify(next));
      return next;
    });
  }, []);

  // Global keyboard shortcuts (Ctrl+C/X/V/T, Del, Backspace, F6, Alt+1..4).
  // Pane-level navigation (arrows, Enter, F2/F5/F7, Ctrl+A, Alt+←/→) lives in ExplorerPane.
  const visiblePanes = useMemo(
    () => visiblePaneIndices(layoutMode, activeFocus),
    [layoutMode, activeFocus]
  );

  useEffect(() => {
    if (layoutMode !== "1-single" && !visiblePanes.includes(activeFocus)) {
      setActiveFocus(visiblePanes[0]);
    }
  }, [layoutMode, visiblePanes, activeFocus]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (dialogOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      const activePane = panes[activeFocus];
      if (!activePane) return;
      const activeTab =
        activePane.tabs.find((t) => t.id === activePane.activeTabId) ||
        activePane.tabs[0];

      if (e.altKey && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (layoutMode === "1-single" || visiblePanes.includes(idx)) {
          setActiveFocus(idx);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (activePane.selectedPaths.length > 0) {
          e.preventDefault();
          handleCopySelectionToClipboard(activeFocus, "copy", activePane.selectedPaths);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        if (activePane.selectedPaths.length > 0) {
          e.preventDefault();
          handleCopySelectionToClipboard(activeFocus, "cut", activePane.selectedPaths);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePasteFromClipboard(activeFocus);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        performUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setActiveModal("search");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleAddTab(activeFocus, activeTab?.path);
      } else if (e.key === "Delete") {
        if (activePane.selectedPaths.length > 0) {
          e.preventDefault();
          handleDeletePaths(activeFocus, activePane.selectedPaths, e.shiftKey);
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        const parent = getParentPath(activeTab?.path || "C:\\");
        if (parent) {
          handleNavigate(activeFocus, parent, true);
        }
      } else if (e.key === "F6") {
        // Quick move to the next *visible* pane
        if (activePane.selectedPaths.length > 0) {
          e.preventDefault();
          const pos = visiblePanes.indexOf(activeFocus);
          if (visiblePanes.length < 2 || pos < 0) {
            notify("이동할 다른 패널이 화면에 없습니다.", true);
            return;
          }
          const targetIdx = visiblePanes[(pos + 1) % visiblePanes.length];
          handleTransferBetweenPanes(
            activeFocus,
            targetIdx,
            activePane.selectedPaths,
            "move"
          );
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    dialogOpen,
    layoutMode,
    visiblePanes,
    activeFocus,
    panes,
    notify,
    performUndo,
    handlePasteFromClipboard,
    handleCopySelectionToClipboard,
    handleAddTab,
    handleDeletePaths,
    handleNavigate,
    handleTransferBetweenPanes,
  ]);

  // Watch the folders shown in visible panes and refresh them when they change on disk.
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const watchKey = useMemo(() => {
    const set = new Set<string>();
    panes.forEach((p, i) => {
      if (layoutMode !== "1-single" && !visiblePanes.includes(i)) return;
      if (layoutMode === "1-single" && i !== activeFocus) return;
      const tab = p.tabs.find((t) => t.id === p.activeTabId) || p.tabs[0];
      if (tab) set.add(tab.path);
    });
    return Array.from(set).sort().join("|");
  }, [panes, layoutMode, visiblePanes, activeFocus]);

  useEffect(() => {
    apiWatchDirs(watchKey ? watchKey.split("|") : []).catch(() => {});
  }, [watchKey]);

  useEffect(() => {
    const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
    const pending = new Set<string>();
    let timer: number | null = null;
    let unlisten: (() => void) | null = null;
    let disposed = false;

    onFsChanged((changed) => {
      pending.add(norm(changed));
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        const dirs = new Set(pending);
        pending.clear();
        setPaneRefresh((prev) =>
          prev.map((n, i) => {
            const p = panesRef.current[i];
            const tab = p?.tabs.find((t) => t.id === p.activeTabId) || p?.tabs[0];
            return tab && dirs.has(norm(tab.path)) ? n + 1 : n;
          })
        );
      }, 300);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  // Network / virtual drives may not emit change events — refresh when the window regains focus.
  useEffect(() => {
    let last = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - last < 1500) return;
      last = now;
      setRefreshTrigger((t) => t + 1);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Persist the workspace (debounced) so the next launch restores it.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            v: 1,
            theme,
            layoutMode,
            treeMode,
            previewEnabled,
            useColorStart,
            showHidden,
            confirmTrash,
            zoomPct,
            sptPct,
            sp0Pct,
            sp1Pct,
            sp2Pct,
            activeFocus,
            colorRules,
            quickLinks,
            panes: panes.map((p) => ({
              tabs: p.tabs,
              activeTabId: p.activeTabId,
              viewMode: p.viewMode,
              sortField: p.sortField,
              sortAsc: p.sortAsc,
              showFilterBar: p.showFilterBar,
              includeFilter: p.includeFilter,
              negativeFilter: p.negativeFilter,
              showLocalTree: p.showLocalTree,
            })),
          })
        );
      } catch {
        // storage unavailable — session simply won't persist
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    theme,
    layoutMode,
    treeMode,
    previewEnabled,
    useColorStart,
    showHidden,
    confirmTrash,
    zoomPct,
    sptPct,
    sp0Pct,
    sp1Pct,
    sp2Pct,
    activeFocus,
    colorRules,
    quickLinks,
    panes,
  ]);

  const activePane = panes[activeFocus] || panes[0];
  const activePaneTab =
    activePane.tabs.find((t) => t.id === activePane.activeTabId) || activePane.tabs[0];

  const renderPane = (paneIndex: number) => (
    <ExplorerPane
      key={paneIndex}
      pane={panes[paneIndex]}
      isFocused={activeFocus === paneIndex}
      drives={drives}
      quickLinks={quickLinks}
      colorRules={colorRules}
      useColorStart={useColorStart}
      showHidden={showHidden}
      theme={theme}
      globalTreeMode={treeMode}
      clipboard={clipboard}
      refreshTrigger={refreshTrigger + (paneRefresh[paneIndex] ?? 0)}
      transferTargets={visiblePanes.filter((i) => i !== paneIndex)}
      shortcutsEnabled={!dialogOpen}
      onFocusPane={setActiveFocus}
      onNavigate={handleNavigate}
      onHistoryBack={handleHistoryBack}
      onHistoryForward={handleHistoryForward}
      onAddTab={handleAddTab}
      onCloseTab={handleCloseTab}
      onSelectTab={handleSelectTab}
      onUpdatePane={handleUpdatePane}
      onSelectForPreview={setSelectedForPreview}
      onCopySelectionToClipboard={handleCopySelectionToClipboard}
      onPasteFromClipboard={handlePasteFromClipboard}
      onTransferBetweenPanes={handleTransferBetweenPanes}
      onDropToPath={handleDropToPath}
      runJob={runJob}
      onZip={handleZip}
      onUnzip={handleUnzip}
      onOpenProperties={setPropsEntries}
      onOpenSearch={() => setActiveModal("search")}
      onRecordUndo={pushUndo}
      onDeletePaths={handleDeletePaths}
      onAddQuickLink={handleAddQuickLink}
      onEntriesLoaded={handleEntriesLoaded}
      onNotify={notify}
    />
  );

  // Interactive splitter drag helper
  const startDragSplitter = (
    e: React.MouseEvent,
    axis: "x" | "y",
    currentPct: number,
    setPct: (val: number) => void,
    minPct = 15,
    maxPct = 85
  ) => {
    e.preventDefault();
    const startCoord = axis === "x" ? e.clientX : e.clientY;
    const totalSize = axis === "x" ? window.innerWidth : window.innerHeight - 60;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = (axis === "x" ? moveEvent.clientX : moveEvent.clientY) - startCoord;
      const deltaPct = (delta / Math.max(totalSize, 300)) * 100;
      const next = Math.max(minPct, Math.min(maxPct, Math.round(currentPct + deltaPct)));
      setPct(next);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const renderQuadWorkspace = () => {
    switch (layoutMode) {
      case "1-single":
        return <div className="quad-stage single-pane-stage">{renderPane(activeFocus)}</div>;

      case "2-vertical":
        return (
          <div className="quad-stage split-row">
            <div className="split-child" style={{ width: `${sp0Pct}%` }}>
              {renderPane(0)}
            </div>
            <div
              className="splitter-bar vertical"
              onMouseDown={(e) => startDragSplitter(e, "x", sp0Pct, setSp0Pct)}
            />
            <div className="split-child" style={{ width: `${100 - sp0Pct}%` }}>
              {renderPane(1)}
            </div>
          </div>
        );

      case "2-horizontal":
        return (
          <div className="quad-stage split-col">
            <div className="split-child" style={{ height: `${sp0Pct}%` }}>
              {renderPane(0)}
            </div>
            <div
              className="splitter-bar horizontal"
              onMouseDown={(e) => startDragSplitter(e, "y", sp0Pct, setSp0Pct)}
            />
            <div className="split-child" style={{ height: `${100 - sp0Pct}%` }}>
              {renderPane(1)}
            </div>
          </div>
        );

      case "4-columns":
        return (
          <div className="quad-stage equal-4-cols">
            {renderPane(0)}
            {renderPane(1)}
            {renderPane(2)}
            {renderPane(3)}
          </div>
        );

      case "4-rows":
        return (
          <div className="quad-stage equal-4-rows">
            {renderPane(0)}
            {renderPane(1)}
            {renderPane(2)}
            {renderPane(3)}
          </div>
        );

      case "3-top1-bottom2":
        return (
          <div className="quad-stage split-col">
            <div className="split-child" style={{ height: `${sp0Pct}%` }}>
              {renderPane(0)}
            </div>
            <div
              className="splitter-bar horizontal"
              onMouseDown={(e) => startDragSplitter(e, "y", sp0Pct, setSp0Pct)}
            />
            <div className="split-child split-row" style={{ height: `${100 - sp0Pct}%` }}>
              <div className="split-child" style={{ width: `${sp2Pct}%` }}>
                {renderPane(1)}
              </div>
              <div
                className="splitter-bar vertical"
                onMouseDown={(e) => startDragSplitter(e, "x", sp2Pct, setSp2Pct)}
              />
              <div className="split-child" style={{ width: `${100 - sp2Pct}%` }}>
                {renderPane(2)}
              </div>
            </div>
          </div>
        );

      case "3-top2-bottom1":
        return (
          <div className="quad-stage split-col">
            <div className="split-child split-row" style={{ height: `${sp0Pct}%` }}>
              <div className="split-child" style={{ width: `${sp1Pct}%` }}>
                {renderPane(0)}
              </div>
              <div
                className="splitter-bar vertical"
                onMouseDown={(e) => startDragSplitter(e, "x", sp1Pct, setSp1Pct)}
              />
              <div className="split-child" style={{ width: `${100 - sp1Pct}%` }}>
                {renderPane(1)}
              </div>
            </div>
            <div
              className="splitter-bar horizontal"
              onMouseDown={(e) => startDragSplitter(e, "y", sp0Pct, setSp0Pct)}
            />
            <div className="split-child" style={{ height: `${100 - sp0Pct}%` }}>
              {renderPane(2)}
            </div>
          </div>
        );

      case "3-left1-right2":
        return (
          <div className="quad-stage split-row">
            <div className="split-child" style={{ width: `${sp0Pct}%` }}>
              {renderPane(0)}
            </div>
            <div
              className="splitter-bar vertical"
              onMouseDown={(e) => startDragSplitter(e, "x", sp0Pct, setSp0Pct)}
            />
            <div className="split-child split-col" style={{ width: `${100 - sp0Pct}%` }}>
              <div className="split-child" style={{ height: `${sp1Pct}%` }}>
                {renderPane(1)}
              </div>
              <div
                className="splitter-bar horizontal"
                onMouseDown={(e) => startDragSplitter(e, "y", sp1Pct, setSp1Pct)}
              />
              <div className="split-child" style={{ height: `${100 - sp1Pct}%` }}>
                {renderPane(2)}
              </div>
            </div>
          </div>
        );

      case "3-left2-right1":
        return (
          <div className="quad-stage split-row">
            <div className="split-child split-col" style={{ width: `${sp0Pct}%` }}>
              <div className="split-child" style={{ height: `${sp1Pct}%` }}>
                {renderPane(0)}
              </div>
              <div
                className="splitter-bar horizontal"
                onMouseDown={(e) => startDragSplitter(e, "y", sp1Pct, setSp1Pct)}
              />
              <div className="split-child" style={{ height: `${100 - sp1Pct}%` }}>
                {renderPane(1)}
              </div>
            </div>
            <div
              className="splitter-bar vertical"
              onMouseDown={(e) => startDragSplitter(e, "x", sp0Pct, setSp0Pct)}
            />
            <div className="split-child" style={{ width: `${100 - sp0Pct}%` }}>
              {renderPane(2)}
            </div>
          </div>
        );

      case "4-grid":
      default:
        return (
          <div className="quad-stage split-col">
            {/* Top Row: Pane 1 & Pane 2 (SP1 ratio) */}
            <div className="split-child split-row" style={{ height: `${sp0Pct}%` }}>
              <div className="split-child" style={{ width: `${sp1Pct}%` }}>
                {renderPane(0)}
              </div>
              <div
                className="splitter-bar vertical"
                onMouseDown={(e) => startDragSplitter(e, "x", sp1Pct, setSp1Pct)}
                title="드래그하여 상단 좌/우 패널 폭 조절 (SP1)"
              />
              <div className="split-child" style={{ width: `${100 - sp1Pct}%` }}>
                {renderPane(1)}
              </div>
            </div>

            {/* Horizontal Center Splitter (SP0 ratio) */}
            <div
              className="splitter-bar horizontal"
              onMouseDown={(e) => startDragSplitter(e, "y", sp0Pct, setSp0Pct)}
              title="드래그하여 상/하 패널 높이 조절 (SP0)"
            />

            {/* Bottom Row: Pane 3 & Pane 4 (SP2 ratio) */}
            <div className="split-child split-row" style={{ height: `${100 - sp0Pct}%` }}>
              <div className="split-child" style={{ width: `${sp2Pct}%` }}>
                {renderPane(2)}
              </div>
              <div
                className="splitter-bar vertical"
                onMouseDown={(e) => startDragSplitter(e, "x", sp2Pct, setSp2Pct)}
                title="드래그하여 하단 좌/우 패널 폭 조절 (SP2)"
              />
              <div className="split-child" style={{ width: `${100 - sp2Pct}%` }}>
                {renderPane(3)}
              </div>
            </div>
          </div>
        );
    }
  };

  // "Show in pane" requests from the search tab (possibly from the detached preview window):
  // navigate the active pane to the file's folder, then select the file once the list has loaded.
  const activeFocusRef = useRef(activeFocus);
  activeFocusRef.current = activeFocus;
  const revealRef = useRef<{ pane: number; path: string; until: number } | null>(null);
  const [revealTick, setRevealTick] = useState(0);

  useEffect(() => {
    let off: (() => void) | undefined;
    let disposed = false;
    listen<{ path: string }>("jdir://reveal-file", (ev) => {
      const path = ev.payload.path;
      const cut = path.lastIndexOf("\\");
      if (cut <= 0) return;
      let parent = path.slice(0, cut);
      if (/^[A-Za-z]:$/.test(parent)) parent += "\\";
      const pane = activeFocusRef.current;
      revealRef.current = { pane, path, until: Date.now() + 5000 };
      setActiveFocus(pane);
      handleNavigate(pane, parent, true);
      void apiFocusMainWindow().catch(() => undefined);
      setRevealTick((t) => t + 1);
      window.setTimeout(() => setRevealTick((t) => t + 1), 5200);
    }).then((fn) => (disposed ? fn() : (off = fn)));
    return () => {
      disposed = true;
      off?.();
    };
  }, [handleNavigate]);

  useEffect(() => {
    const req = revealRef.current;
    if (!req) return;
    const wanted = req.path.toLowerCase();
    const found = (paneEntriesMap[req.pane] ?? []).some((e) => e.path.toLowerCase() === wanted);
    if (found) {
      revealRef.current = null;
      handleUpdatePane(req.pane, { selectedPaths: (paneEntriesMap[req.pane] ?? []).filter((e) => e.path.toLowerCase() === wanted).map((e) => e.path) });
    } else if (Date.now() > req.until) {
      revealRef.current = null;
      notify("목록에서 파일을 찾지 못했습니다. 파일이 이동·삭제되었거나 숨김 파일일 수 있습니다.", true);
    }
  }, [paneEntriesMap, revealTick, handleUpdatePane, notify]);

  // Detached preview window: open/close with the mode, and keep it fed with the selection.
  const previewPopupOpen = previewEnabled && previewMode === "popup";
  const latestPreviewRef = useRef({ entry: selectedForPreview, theme });
  latestPreviewRef.current = { entry: selectedForPreview, theme };

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_MODE_KEY, previewMode);
    } catch {
      /* storage unavailable */
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewPopupOpen) {
      apiOpenPreviewWindow(loadWinRect()).catch(() => setPreviewMode("dock"));
    } else {
      apiClosePreviewWindow().catch(() => undefined);
    }
  }, [previewPopupOpen]);

  useEffect(() => {
    if (previewPopupOpen) void emit(PREVIEW_EVENTS.entry, { entry: selectedForPreview, theme });
  }, [previewPopupOpen, selectedForPreview, theme]);

  useEffect(() => {
    const offs: Array<() => void> = [];
    let disposed = false;
    const reg = (name: string, fn: () => void) =>
      listen(name, fn).then((off) => (disposed ? off() : offs.push(off)));
    void reg(PREVIEW_EVENTS.ready, () => void emit(PREVIEW_EVENTS.entry, latestPreviewRef.current));
    void reg(PREVIEW_EVENTS.dock, () => setPreviewMode("dock"));
    void reg(PREVIEW_EVENTS.closed, () => setPreviewMode((m) => (m === "popup" ? "dock" : m)));
    return () => {
      disposed = true;
      offs.forEach((off) => off());
    };
  }, []);

  return (
    <div
      className={`jdir-app-root theme-${theme}`}
      style={{ fontSize: `${zoomPct}%` }}
    >
      <TopMenuBar
        layoutMode={layoutMode}
        onChangeLayout={setLayoutMode}
        onResetSplits={() => {
          setSp0Pct(50);
          setSp1Pct(50);
          setSp2Pct(50);
          setSptPct(17);
          notify("분할 비율이 50:50 균등 비율로 초기화되었습니다.");
        }}
        treeMode={treeMode}
        onCycleTreeMode={() => setTreeMode((m) => (m === 1 ? 0 : m === 0 ? 2 : 1))}
        previewEnabled={previewEnabled}
        onTogglePreview={() => setPreviewEnabled((v) => !v)}
        useColorStart={useColorStart}
        onToggleColorStart={() => setUseColorStart((v) => !v)}
        showHidden={showHidden}
        onToggleShowHidden={() => setShowHidden((v) => !v)}
        zoomPct={zoomPct}
        onChangeZoom={setZoomPct}
        magnifierActive={magnifierActive}
        onToggleMagnifier={() => setMagnifierActive((v) => !v)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        activeFocus={activeFocus}
        onOpenColorModal={() => setActiveModal("color")}
        onOpenPresetsModal={() => setActiveModal("presets")}
        onOpenExportModal={() => setActiveModal("export")}
        onImportOriginalQDir={() => applyQDirConfig(undefined, true)}
        updateAvailable={Boolean(updateInfo?.updateAvailable)}
        latestVersion={updateInfo?.latestVersion}
        onOpenUpdateModal={() => {
          setActiveModal("update");
          handleCheckUpdates(true);
        }}
      />

      <main className="jdir-main-workspace">
        {/* Global Single Tree (when tree_mode === 1) */}
        {treeMode === 1 && treeCollapsed && (
          <div className="tree-collapsed-rail">
            <button
              type="button"
              className="icon-btn tree-collapse-btn"
              onClick={() => setTreeCollapsedPersist(false)}
              title="폴더 트리 열기"
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
        )}
        {treeMode === 1 && !treeCollapsed && (
          <>
            <div className="global-tree-dock" style={{ width: `${sptPct}%` }}>
              <DirectoryTree
                drives={drives}
                quickLinks={quickLinks}
                activePath={activePaneTab?.path || "C:\\"}
                activePaneIndex={activeFocus}
                showHidden={showHidden}
                onSelectPath={(path) => handleNavigate(activeFocus, path, true)}
                onDropItems={handleDropToPath}
                onCollapsePanel={() => setTreeCollapsedPersist(true)}
              />
            </div>
            <div
              className="splitter-bar vertical"
              onMouseDown={(e) => startDragSplitter(e, "x", sptPct, setSptPct, 12, 35)}
              title="드래그하여 좌측 통합 트리 폭 조절 (SPT)"
            />
          </>
        )}

        {/* Center Quad Explorer Area */}
        <div className="quad-explorer-region">{renderQuadWorkspace()}</div>

        {/* Right Preview Dock ([Vorschau]) */}
        {previewEnabled && previewMode === "dock" && (
          <PreviewPanel
            selectedEntry={selectedForPreview}
            mode="dock"
            onToggleMode={() => setPreviewMode("popup")}
            onClose={() => setPreviewEnabled(false)}
          />
        )}
      </main>

      {/* Global Bottom Status Footer (Q-Dir Style) */}
      <GlobalFooter
        activePane={activePane}
        activePath={activePaneTab?.path || "C:\\"}
        activeEntries={paneEntriesMap[activeFocus] || []}
        drives={drives}
        quickLinks={quickLinks}
        clipboard={clipboard}
      />

      {/* Modals */}
      {activeModal === "color" && (
        <ColorFilterModal
          rules={colorRules}
          onChangeRules={setColorRules}
          onImportFromQDirIni={() => applyQDirConfig(undefined, true)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === "presets" && (
        <PresetsAndFavoritesModal
          presets={savedPresets}
          quickLinks={quickLinks}
          onSaveCurrentPreset={handleSaveCurrentPreset}
          onLoadPreset={handleLoadPreset}
          onDeletePreset={handleDeletePreset}
          onAddQuickLink={handleAddQuickLink}
          onRemoveQuickLink={handleRemoveQuickLink}
          onNavigateActivePane={(path) => handleNavigate(activeFocus, path, true)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === "export" && (
        <ExportListModal
          paneIndex={activeFocus}
          currentPath={activePaneTab?.path || "C:\\"}
          entries={paneEntriesRef.current[activeFocus] || []}
          onNotify={notify}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === "update" && (
        <UpdateModal
          updateInfo={updateInfo}
          checking={updateChecking}
          installing={updateInstalling}
          errorMsg={updateError}
          onCheckAgain={() => handleCheckUpdates(true)}
          onInstallNow={handleInstallUpdateAndRestart}
          onClose={() => setActiveModal(null)}
        />
      )}

      <JobPanel jobs={Object.values(jobs)} onCancel={cancelJob} />

      {activeModal === "search" && (
        <SearchModal
          initialRoot={activePaneTab?.path || "C:\\"}
          onClose={() => setActiveModal(null)}
          onOpenEntry={(entry) => {
            if (entry.isDir) {
              handleNavigate(activeFocus, entry.path, true);
              setActiveModal(null);
            } else {
              apiOpenItem(entry.path).catch((err) => notify(String(err), true));
            }
          }}
          onRevealEntry={(entry) => {
            const parent = getParentPath(entry.path);
            if (parent) handleNavigate(activeFocus, parent, true);
            setActiveModal(null);
          }}
        />
      )}

      {propsEntries && (
        <PropertiesModal
          entries={propsEntries}
          onChanged={() => setRefreshTrigger((t) => t + 1)}
          onNotify={notify}
          onClose={() => setPropsEntries(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          paths={pendingDelete.paths}
          permanent={pendingDelete.permanent}
          onCancel={() => setPendingDelete(null)}
          onConfirm={(dontAskAgain) => {
            const job = pendingDelete;
            setPendingDelete(null);
            if (dontAskAgain && !job.permanent) setConfirmTrash(false);
            performDelete(job.paneIndex, job.paths, job.permanent);
          }}
        />
      )}

      {conflictPrompt && (
        <ConflictDialog
          names={conflictPrompt.names}
          mode={conflictPrompt.mode}
          onChoose={(policy) => {
            conflictPrompt.resolve(policy);
            setConflictPrompt(null);
          }}
        />
      )}

      {/* Lupe Magnifier Floating HUD */}
      {magnifierActive && (
        <MagnifierHud
          zoomPct={zoomPct}
          selectedEntry={selectedForPreview}
          onChangeZoom={setZoomPct}
          onClose={() => setMagnifierActive(false)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`jdir-toast ${toast.isError ? "error" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
};

export default App;
