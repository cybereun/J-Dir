import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  PanelLeftClose,
  RefreshCw,
} from "lucide-react";
import { DriveInfo, FileEntry, QuickLinkItem } from "../types/jdir";
import { apiListSubdirectories } from "../services/tauriApi";
import { formatBytes } from "../utils/colorFilter";
import {
  DropMode,
  dragIncludesDestination,
  dropModeFor,
  endDrag,
  isJdirDrag,
  readDrag,
} from "../utils/dragDrop";
import {
  Drive3DIcon,
  Folder3DIcon,
  MyPc3DIcon,
  QuickLink3DIcon,
  Star3DIcon,
} from "./GraphicIcons";

interface DirectoryTreeProps {
  drives: DriveInfo[];
  quickLinks: QuickLinkItem[];
  activePath: string;
  activePaneIndex: number;
  showHidden: boolean;
  onSelectPath: (path: string) => void;
  onDropItems?: (destPath: string, paths: string[], mode: DropMode) => void;
  compact?: boolean;
  onCollapsePanel?: () => void;
}

interface TreeNodeProps {
  name: string;
  path: string;
  activePath: string;
  showHidden: boolean;
  depth: number;
  isDrive?: boolean;
  isSystemDrive?: boolean;
  initialExpanded: boolean;
  expandSignal: { version: number; mode: "collapse-all" | "expand-drives" | "normal" };
  onSelectPath: (path: string) => void;
  onDropItems?: (destPath: string, paths: string[], mode: DropMode) => void;
}

function makeTreeDropProps(
  destPath: string,
  onDropItems: DirectoryTreeProps["onDropItems"],
  setDragOver: (v: boolean) => void,
  afterDrop?: () => void
) {
  return {
    "data-drop-path": destPath,
    "data-drop-key": "tree",
    onDragOver: (e: React.DragEvent) => {
      if (!onDropItems || !isJdirDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = dropModeFor(e, destPath);
      setDragOver(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.stopPropagation();
      setDragOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!onDropItems) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const data = readDrag(e);
      endDrag();
      if (!data) return;
      if (dragIncludesDestination(data.paths, destPath)) return;
      onDropItems(destPath, data.paths, dropModeFor(e, destPath));
      afterDrop?.();
    },
  };
}

const TreeNode: React.FC<TreeNodeProps> = ({
  name,
  path,
  activePath,
  showHidden,
  depth,
  isDrive = false,
  isSystemDrive = false,
  initialExpanded,
  expandSignal,
  onSelectPath,
  onDropItems,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const normalizedSelf = path.replace(/[\\/]+$/, "").toLowerCase();
  const normalizedActive = activePath.replace(/[\\/]+$/, "").toLowerCase();
  const isCurrent = normalizedSelf === normalizedActive;
  const isAncestor =
    normalizedActive.startsWith(normalizedSelf + "\\") ||
    (normalizedSelf.endsWith(":") &&
      normalizedActive.startsWith(normalizedSelf) &&
      normalizedActive !== normalizedSelf);

  const [expanded, setExpanded] = useState<boolean>(initialExpanded || isAncestor);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const prevActivePathRef = useRef<string>(activePath);
  const prevSignalVersionRef = useRef<number>(expandSignal.version);

  // Respond to global "모두 접기" / "드라이브 펼치기" button clicks
  useEffect(() => {
    if (prevSignalVersionRef.current !== expandSignal.version) {
      prevSignalVersionRef.current = expandSignal.version;
      if (expandSignal.mode === "collapse-all") {
        setExpanded(false);
      } else if (expandSignal.mode === "expand-drives") {
        setExpanded(depth === 0);
      }
    }
  }, [expandSignal, depth]);

  // Only auto-expand ancestor when activePath actually changes to a new path,
  // so the user can freely collapse any folder or drive at any time!
  useEffect(() => {
    if (prevActivePathRef.current !== activePath) {
      prevActivePathRef.current = activePath;
      if (isAncestor) {
        setExpanded(true);
      }
    }
  }, [activePath, isAncestor]);

  useEffect(() => {
    let cancelled = false;
    if (expanded && children === null) {
      setLoading(true);
      apiListSubdirectories(path, showHidden)
        .then((subs) => {
          if (!cancelled) {
            setChildren(subs);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setChildren([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [expanded, children, path, showHidden]);

  const dropProps = makeTreeDropProps(path, onDropItems, setDragOver, () => {
    // expand so the user can see where the item landed
    setExpanded(true);
  });

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  const handleSelect = () => {
    if (isCurrent) {
      // Clicking the already-selected folder toggles expand/collapse
      setExpanded((prev) => !prev);
    } else {
      onSelectPath(path);
      setExpanded(true);
    }
  };

  return (
    <div className="tree-node-wrapper">
      <div
        className={`tree-node-row ${isCurrent ? "selected" : ""} ${dragOver ? "drop-hover" : ""}`}
        {...dropProps}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={handleSelect}
        onDoubleClick={handleToggle}
        title={`${path}\n(클릭: 이동 / 화살표 또는 재클릭: 접기·펼치기)`}
      >
        <button
          type="button"
          className="tree-expand-btn"
          onClick={handleToggle}
          title={expanded ? "폴더 접기" : "폴더 펼치기"}
          aria-label="폴더 펼치기/접기"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="tree-folder-icon" onClick={handleToggle}>
          {isDrive ? (
            <Drive3DIcon size={17} isSystemDrive={isSystemDrive} />
          ) : (
            <Folder3DIcon size={16} open={expanded} />
          )}
        </span>
        <span className="tree-node-label">{name}</span>
      </div>

      {expanded && (
        <div className="tree-children">
          {loading && <div className="tree-loading">로딩 중...</div>}
          {!loading && children && children.length === 0 && (
            <div
              className="tree-empty-sub"
              style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}
            >
              (하위 폴더 없음)
            </div>
          )}
          {!loading &&
            children &&
            children.map((child) => (
              <TreeNode
                key={child.path}
                name={child.name}
                path={child.path}
                activePath={activePath}
                showHidden={showHidden}
                depth={depth + 1}
                initialExpanded={false}
                expandSignal={expandSignal}
                onSelectPath={onSelectPath}
                onDropItems={onDropItems}
              />
            ))}
        </div>
      )}
    </div>
  );
};

const QuickLinkRow: React.FC<{
  ql: QuickLinkItem;
  selected: boolean;
  onSelectPath: (path: string) => void;
  onDropItems?: DirectoryTreeProps["onDropItems"];
}> = ({ ql, selected, onSelectPath, onDropItems }) => {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={`tree-quicklink-row ${selected ? "selected" : ""} ${dragOver ? "drop-hover" : ""}`}
      {...makeTreeDropProps(ql.targetPath, onDropItems, setDragOver)}
      onClick={() => onSelectPath(ql.targetPath)}
      title={ql.targetPath}
    >
      <QuickLink3DIcon label={ql.name} size={16} />
      <span className="tree-node-label">{ql.name}</span>
    </div>
  );
};

export const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  drives,
  quickLinks,
  activePath,
  activePaneIndex,
  showHidden,
  onSelectPath,
  onDropItems,
  compact = false,
  onCollapsePanel,
}) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [quickLinksExpanded, setQuickLinksExpanded] = useState(true);
  const [drivesSectionExpanded, setDrivesSectionExpanded] = useState(true);
  const [expandSignal, setExpandSignal] = useState<{
    version: number;
    mode: "collapse-all" | "expand-drives" | "normal";
  }>({
    version: 0,
    mode: "normal",
  });

  const handleCollapseAll = () => {
    setExpandSignal((prev) => ({
      version: prev.version + 1,
      mode: "collapse-all",
    }));
  };

  const handleExpandDrives = () => {
    setDrivesSectionExpanded(true);
    setExpandSignal((prev) => ({
      version: prev.version + 1,
      mode: "expand-drives",
    }));
  };

  return (
    <aside className={`directory-tree-panel ${compact ? "compact-tree" : ""}`}>
      <div className="tree-header">
        <div className="tree-header-title">
          <span>폴더 트리</span>
          <span className={`tree-pane-badge pane-color-${activePaneIndex + 1}`}>
            #{activePaneIndex + 1} 연동
          </span>
        </div>
        <div className="tree-header-actions">
          <button
            type="button"
            className="tree-action-chip"
            onClick={handleCollapseAll}
            title="모든 드라이브 및 하위 폴더 한 번에 접기"
          >
            <ChevronsDownUp size={12} />
            <span>모두 접기</span>
          </button>
          <button
            type="button"
            className="tree-action-chip"
            onClick={handleExpandDrives}
            title="최상위 드라이브 목록 펼치기"
          >
            <ChevronsUpDown size={12} />
            <span>펼치기</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="폴더 트리 새로고침"
          >
            <RefreshCw size={12} />
          </button>
          {onCollapsePanel && (
            <button
              type="button"
              className="icon-btn tree-collapse-btn"
              onClick={onCollapsePanel}
              title="폴더 트리 닫기"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="tree-scroll-body" key={refreshKey}>
        {!compact && quickLinks.length > 0 && (
          <div className="tree-section">
            <div
              className="tree-section-caption clickable-caption"
              onClick={() => setQuickLinksExpanded((prev) => !prev)}
              title="클릭하여 즐겨찾기 목록 접기/펼치기"
            >
              {quickLinksExpanded ? (
                <ChevronDown size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
              <Star3DIcon size={15} />
              <span>Quick-Links (즐겨찾기)</span>
            </div>
            {quickLinksExpanded &&
              quickLinks.map((ql) => {
                const isSelected =
                  ql.targetPath.replace(/[\\/]+$/, "").toLowerCase() ===
                  activePath.replace(/[\\/]+$/, "").toLowerCase();
                return (
                  <QuickLinkRow
                    key={ql.name + ql.targetPath}
                    ql={ql}
                    selected={isSelected}
                    onSelectPath={onSelectPath}
                    onDropItems={onDropItems}
                  />
                );
              })}
          </div>
        )}

        <div className="tree-section">
          <div
            className="tree-section-caption clickable-caption"
            onClick={() => setDrivesSectionExpanded((prev) => !prev)}
            title="클릭하여 내 PC 드라이브 목록 접기/펼치기"
          >
            {drivesSectionExpanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )}
            <MyPc3DIcon size={16} />
            <span>내 PC (드라이브)</span>
          </div>
          {drivesSectionExpanded &&
            drives.map((drv) => (
              <div key={drv.rootPath} className="tree-drive-group">
                <TreeNode
                  name={`${drv.letter} ${drv.label} (${formatBytes(drv.freeBytes)} 여유)`}
                  path={drv.rootPath}
                  activePath={activePath}
                  showHidden={showHidden}
                  depth={0}
                  isDrive={true}
                  isSystemDrive={drv.letter.toUpperCase() === "C:"}
                  initialExpanded={false}
                  expandSignal={expandSignal}
                  onSelectPath={onSelectPath}
                  onDropItems={onDropItems}
                />
              </div>
            ))}
        </div>
      </div>
    </aside>
  );
};
