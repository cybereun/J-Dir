import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardState,
  ColorFilterRule,
  DriveInfo,
  FileEntry,
  LayoutMode,
  PaneState,
  PaneTab,
  QuickLinkItem,
  SavedQdrPreset,
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
  apiCheckForUpdates,
  apiCopyItems,
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
import { GlobalFooter } from "./components/GlobalFooter";
import {
  ColorFilterModal,
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

export const App: React.FC = () => {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("4-grid");
  const [treeMode, setTreeMode] = useState<number>(1); // 1 = Global tree, 0 = Per-pane tree, 2 = Off
  const [previewEnabled, setPreviewEnabled] = useState<boolean>(false);
  const [useColorStart, setUseColorStart] = useState<boolean>(true);
  const [showHidden, setShowHidden] = useState<boolean>(true);
  const [zoomPct, setZoomPct] = useState<number>(100);
  const [magnifierActive, setMagnifierActive] = useState<boolean>(false);

  // Q-Dir split ratios (in percentages, mapped from SP0=5000, SP1=5000, SP2=5000, SPT=1617)
  const [sptPct, setSptPct] = useState<number>(17);
  const [sp0Pct, setSp0Pct] = useState<number>(50);
  const [sp1Pct, setSp1Pct] = useState<number>(50);
  const [sp2Pct, setSp2Pct] = useState<number>(50);

  const [activeFocus, setActiveFocus] = useState<number>(2); // Focus=3 in Q-Dir -> index 2 (or 0..3)
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLinkItem[]>([]);
  const [colorRules, setColorRules] = useState<ColorFilterRule[]>(DEFAULT_QDIR_COLOR_RULES);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [selectedForPreview, setSelectedForPreview] = useState<FileEntry | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const [panes, setPanes] = useState<PaneState[]>(() => [
    makeInitialPane(0, "Y:\\내 드라이브\\AI\\App_Bulid", "details", true),
    makeInitialPane(1, "E:\\UTIL\\4.시스템\\Q-Dir_Portable_x64\\Q-Dir", "details", true),
    makeInitialPane(2, "C:\\", "details", true),
    makeInitialPane(3, "C:\\", "details", true),
  ]);

  const paneEntriesRef = useRef<Record<number, FileEntry[]>>({});
  const [paneEntriesMap, setPaneEntriesMap] = useState<Record<number, FileEntry[]>>({});

  const handleEntriesLoaded = useCallback((idx: number, list: FileEntry[]) => {
    paneEntriesRef.current[idx] = list;
    setPaneEntriesMap((prev) => ({ ...prev, [idx]: list }));
  }, []);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    "color" | "presets" | "export" | "update" | null
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
    applyQDirConfig(undefined, false);
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
      notify(
        `${paths.length}개 항목이 클립보드에 ${
          mode === "copy" ? "복사" : "잘라내기"
        }되었습니다.`
      );
    },
    [notify]
  );

  const handlePasteFromClipboard = useCallback(
    async (targetPaneIndex: number) => {
      if (!clipboard || clipboard.paths.length === 0) return;
      const targetPane = panes[targetPaneIndex];
      const activeTab =
        targetPane.tabs.find((t) => t.id === targetPane.activeTabId) ||
        targetPane.tabs[0];
      const destDir = activeTab.path;

      try {
        const report =
          clipboard.mode === "copy"
            ? await apiCopyItems(clipboard.paths, destDir, false)
            : await apiMoveItems(clipboard.paths, destDir, false);

        if (clipboard.mode === "cut") {
          setClipboard(null);
        }
        setRefreshTrigger((t) => t + 1);
        if (report.failed.length > 0) {
          notify(
            `성공 ${report.succeeded.length}개 / 실패 ${report.failed.length}개: ${report.failed[0].error}`,
            true
          );
        } else {
          notify(
            `패널 #${targetPaneIndex + 1}(${folderTitleFromPath(destDir)})에 ${
              report.succeeded.length
            }개 항목 붙여넣기 완료`
          );
        }
      } catch (err) {
        notify(String(err), true);
      }
    },
    [clipboard, panes, notify]
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
      const destDir = activeTab.path;

      try {
        const report =
          mode === "copy"
            ? await apiCopyItems(paths, destDir, false)
            : await apiMoveItems(paths, destDir, false);

        setRefreshTrigger((t) => t + 1);
        if (report.failed.length > 0) {
          notify(
            `전송 중 오류 (${report.failed.length}건): ${report.failed[0].error}`,
            true
          );
        } else {
          notify(
            `패널 #${sourcePaneIndex + 1} → 패널 #${targetPaneIndex + 1} (${
              mode === "copy" ? "복사" : "이동"
            } ${report.succeeded.length}개 완료)`
          );
        }
      } catch (err) {
        notify(String(err), true);
      }
    },
    [panes, notify]
  );

  const handleDeletePaths = useCallback(
    async (paneIndex: number, paths: string[], permanent: boolean) => {
      if (paths.length === 0) return;
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

  // Global keyboard shortcuts (Ctrl+C, Ctrl+X, Ctrl+V, Del, Backspace, Ctrl+T, Alt+1..4)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
        setActiveFocus(Number(e.key) - 1);
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
        if (clipboard && clipboard.paths.length > 0) {
          e.preventDefault();
          handlePasteFromClipboard(activeFocus);
        }
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
        // Quick move to next pane
        if (activePane.selectedPaths.length > 0) {
          e.preventDefault();
          const targetIdx = (activeFocus + 1) % 4;
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
    activeFocus,
    panes,
    clipboard,
    handleCopySelectionToClipboard,
    handlePasteFromClipboard,
    handleAddTab,
    handleDeletePaths,
    handleNavigate,
    handleTransferBetweenPanes,
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
      refreshTrigger={refreshTrigger}
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
        hasUpdateAvailable={Boolean(updateInfo?.updateAvailable)}
        onOpenUpdateModal={() => {
          setActiveModal("update");
          handleCheckUpdates(true);
        }}
      />

      <main className="jdir-main-workspace">
        {/* Global Single Tree (when tree_mode === 1) */}
        {treeMode === 1 && (
          <>
            <div className="global-tree-dock" style={{ width: `${sptPct}%` }}>
              <DirectoryTree
                drives={drives}
                quickLinks={quickLinks}
                activePath={activePaneTab?.path || "C:\\"}
                activePaneIndex={activeFocus}
                showHidden={showHidden}
                onSelectPath={(path) => handleNavigate(activeFocus, path, true)}
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
        {previewEnabled && (
          <PreviewPanel
            selectedEntry={selectedForPreview}
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
          onInstallAndRestart={handleInstallUpdateAndRestart}
          onClose={() => setActiveModal(null)}
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
