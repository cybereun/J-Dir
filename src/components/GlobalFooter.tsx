import React, { useMemo } from "react";
import { ClipboardState, DriveInfo, FileEntry, PaneState, QuickLinkItem } from "../types/jdir";
import { formatBytes, getDriveRoot } from "../utils/colorFilter";
import { Drive3DIcon, Folder3DIcon, MyPc3DIcon } from "./GraphicIcons";

interface GlobalFooterProps {
  activePane: PaneState;
  activePath: string;
  activeEntries: FileEntry[];
  drives: DriveInfo[];
  quickLinks: QuickLinkItem[];
  clipboard: ClipboardState | null;
}

export const GlobalFooter: React.FC<GlobalFooterProps> = ({
  activePane,
  activePath,
  activeEntries,
  drives,
  quickLinks,
  clipboard,
}) => {
  // Detect Windows username from Quick-Links (e.g. C:\Users\cybereun\Desktop) or default to "cybereun"
  const userName = useMemo(() => {
    for (const ql of quickLinks) {
      const m = ql.targetPath.match(/[\\/]Users[\\/]([^\\/]+)/i);
      if (m && m[1]) {
        return m[1];
      }
    }
    const mPath = activePath.match(/[\\/]Users[\\/]([^\\/]+)/i);
    if (mPath && mPath[1]) {
      return mPath[1];
    }
    return "사용자";
  }, [quickLinks, activePath]);

  const currentDrive = useMemo(() => {
    const root = getDriveRoot(activePath).toLowerCase();
    return (
      drives.find((d) => d.rootPath.toLowerCase() === root) ||
      drives.find((d) => activePath.toLowerCase().startsWith(d.letter.toLowerCase())) ||
      drives[0] ||
      null
    );
  }, [activePath, drives]);

  const stats = useMemo(() => {
    let dirCount = 0;
    let fileCount = 0;
    let totalBytes = 0;

    for (const entry of activeEntries) {
      if (entry.isDir) {
        dirCount += 1;
        totalBytes += activePane.folderSizes[entry.path] ?? 0;
      } else {
        fileCount += 1;
        totalBytes += entry.size;
      }
    }

    const selectedSet = new Set(activePane.selectedPaths);
    let selectedBytes = 0;
    for (const entry of activeEntries) {
      if (selectedSet.has(entry.path)) {
        selectedBytes += entry.isDir
          ? activePane.folderSizes[entry.path] ?? 0
          : entry.size;
      }
    }

    return {
      totalCount: activeEntries.length,
      dirCount,
      fileCount,
      totalBytes,
      selectedCount: activePane.selectedPaths.length,
      selectedBytes,
    };
  }, [activeEntries, activePane.folderSizes, activePane.selectedPaths]);

  const driveUsedPct = useMemo(() => {
    if (!currentDrive || currentDrive.totalBytes <= 0) return 0;
    return Math.round(
      ((currentDrive.totalBytes - currentDrive.freeBytes) / currentDrive.totalBytes) * 100
    );
  }, [currentDrive]);

  return (
    <footer className="jdir-global-footer" role="status" aria-label="전역 상태 표시줄">
      {/* 1. 좌측: 활성 패널 개체 수 · 선택 정보 · 현재 경로 */}
      <div className="footer-cell footer-cell-main">
        <span className={`footer-pane-tag pane-color-${activePane.index + 1}`}>
          #{activePane.index + 1}
        </span>
        <span className="footer-count-strong">{stats.totalCount} 개체</span>
        <span className="footer-sub-detail">
          (폴더 {stats.dirCount} · 파일 {stats.fileCount})
        </span>

        {stats.selectedCount > 0 && (
          <span className="footer-selection-pill">
            선택됨: {stats.selectedCount}개 ({formatBytes(stats.selectedBytes)})
          </span>
        )}

        {clipboard && clipboard.paths.length > 0 && (
          <span className="footer-clipboard-pill">
            클립보드({clipboard.mode === "copy" ? "복사" : "잘라내기"}): {clipboard.paths.length}개
          </span>
        )}

        <span className="footer-active-path" title={activePath}>
          <Folder3DIcon size={13} open />
          <span>{activePath}</span>
        </span>
      </div>

      {/* 2. 우측 셀 1: 내 PC 아이콘 + 현재 폴더(또는 선택 항목) 총 크기 (Q-Dir 스타일) */}
      <div
        className="footer-cell footer-cell-size"
        title="현재 폴더 내 파일 총 크기 (선택 시 선택 항목 크기)"
      >
        <MyPc3DIcon size={15} />
        <span>
          {stats.selectedCount > 0
            ? formatBytes(stats.selectedBytes)
            : formatBytes(stats.totalBytes)}
        </span>
      </div>

      {/* 3. 우측 셀 2: 현재 사용자 및 인코딩 (Q-Dir: cybereun (Unicode)) */}
      <div
        className="footer-cell footer-cell-user"
        title="현재 Windows 사용자 계정 및 문자 인코딩 모드"
      >
        <span>{userName} (Unicode)</span>
      </div>

      {/* 4. 우측 셀 3: 현재 드라이브 볼륨 라벨 및 문자 (Q-Dir: SM2-500G (O:)) */}
      <div
        className="footer-cell footer-cell-drive"
        title={
          currentDrive
            ? `${currentDrive.label} (${currentDrive.letter}) - ${currentDrive.driveType}`
            : activePath
        }
      >
        <Drive3DIcon
          size={15}
          isSystemDrive={currentDrive?.letter.toUpperCase() === "C:"}
        />
        <span>
          {currentDrive
            ? `${currentDrive.label} (${currentDrive.letter})`
            : getDriveRoot(activePath)}
        </span>
      </div>

      {/* 5. 우측 셀 4: 드라이브 여유 공간 / 전체 용량 (Q-Dir: 여유: 234GB / 465GB) */}
      <div
        className="footer-cell footer-cell-space"
        title={
          currentDrive
            ? `사용률: ${driveUsedPct}% (여유: ${formatBytes(
                currentDrive.freeBytes
              )} / 전체: ${formatBytes(currentDrive.totalBytes)})`
            : ""
        }
      >
        {currentDrive ? (
          <>
            <span>
              여유: {formatBytes(currentDrive.freeBytes)} /{" "}
              {formatBytes(currentDrive.totalBytes)}
            </span>
            <span className="footer-space-bar">
              <span
                className="footer-space-fill"
                style={{ width: `${driveUsedPct}%` }}
              />
            </span>
          </>
        ) : (
          <span>용량 정보 없음</span>
        )}
        <span className="footer-resize-grip" aria-hidden="true" />
      </div>
    </footer>
  );
};
