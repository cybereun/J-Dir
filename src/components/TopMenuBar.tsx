import React from "react";
import pkg from "../../package.json";
import {
  Columns2,
  Columns4,
  DownloadCloud,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderTree,
  Grid2x2,
  Moon,
  Palette,
  RotateCcw,
  Rows2,
  Rows4,
  Search,
  Sparkles,
  Square,
  Star,
  Sun,
  ZoomIn,
} from "lucide-react";
import { LayoutMode } from "../types/jdir";
import { JDirBrand3DIcon } from "./GraphicIcons";

interface TopMenuBarProps {
  layoutMode: LayoutMode;
  onChangeLayout: (mode: LayoutMode) => void;
  onResetSplits: () => void;
  treeMode: number; // 1 = Global single tree, 0 = Per-pane tree, 2 = Off
  onCycleTreeMode: () => void;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  useColorStart: boolean;
  onToggleColorStart: () => void;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  zoomPct: number;
  onChangeZoom: (pct: number) => void;
  magnifierActive: boolean;
  onToggleMagnifier: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  activeFocus: number;
  updateAvailable: boolean;
  latestVersion?: string;
  onOpenColorModal: () => void;
  onOpenPresetsModal: () => void;
  onOpenExportModal: () => void;
  onOpenUpdateModal: () => void;
  onImportOriginalQDir: () => void;
}

const LAYOUT_BUTTONS: { mode: LayoutMode; label: string; short: string; icon: React.ReactNode }[] =
  [
    { mode: "4-grid", label: "4분할 격자 (Q-Dir 기본 2x2)", short: "4-Grid", icon: <Grid2x2 size={14} /> },
    { mode: "4-columns", label: "4분할 세로 열 (1x4)", short: "4-Col", icon: <Columns4 size={14} /> },
    { mode: "4-rows", label: "4분할 가로 행 (4x1)", short: "4-Row", icon: <Rows4 size={14} /> },
    { mode: "3-top1-bottom2", label: "3분할 (상단 1 / 하단 2)", short: "3-T1B2", icon: <span className="layout-mini-glyph">⊤</span> },
    { mode: "3-top2-bottom1", label: "3분할 (상단 2 / 하단 1)", short: "3-T2B1", icon: <span className="layout-mini-glyph">⊥</span> },
    { mode: "3-left1-right2", label: "3분할 (좌측 1 / 우측 2)", short: "3-L1R2", icon: <span className="layout-mini-glyph">⊢</span> },
    { mode: "3-left2-right1", label: "3분할 (좌측 2 / 우측 1)", short: "3-L2R1", icon: <span className="layout-mini-glyph">⊣</span> },
    { mode: "2-vertical", label: "2분할 좌우 (1x2)", short: "2-Col", icon: <Columns2 size={14} /> },
    { mode: "2-horizontal", label: "2분할 상하 (2x1)", short: "2-Row", icon: <Rows2 size={14} /> },
    { mode: "1-single", label: "1분할 단일 최대화", short: "1-Max", icon: <Square size={14} /> },
  ];

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  layoutMode,
  onChangeLayout,
  onResetSplits,
  treeMode,
  onCycleTreeMode,
  previewEnabled,
  onTogglePreview,
  useColorStart,
  onToggleColorStart,
  showHidden,
  onToggleShowHidden,
  zoomPct,
  onChangeZoom,
  magnifierActive,
  onToggleMagnifier,
  theme,
  onToggleTheme,
  activeFocus,
  updateAvailable,
  latestVersion,
  onOpenColorModal,
  onOpenPresetsModal,
  onOpenExportModal,
  onOpenUpdateModal,
}) => {
  const treeModeLabel =
    treeMode === 1 ? "통합 트리(좌측)" : treeMode === 0 ? "패널별 트리(1~4)" : "트리 숨김";

  return (
    <header className="top-header-container">
      {/* 1단: 상단 애플리케이션 메뉴 바 */}
      <div className="menubar-row-top">
        <div className="menubar-left">
          <div className="app-brand" title={`J-Dir v${pkg.version} — The Quad Explorer`}>
            <JDirBrand3DIcon size={20} />
            <span className="brand-title">J-Dir</span>
            <span className="brand-ver-tag">v{pkg.version}</span>
            <span
              className={`brand-focus-pill pane-color-${activeFocus + 1}`}
              title="현재 포커스된 활성 패널"
            >
              #{activeFocus + 1}
            </span>
          </div>

          <nav className="menu-actions-group" aria-label="주 메뉴">
            <button
              type="button"
              className="menu-btn"
              onClick={onOpenPresetsModal}
              title="즐겨찾기(Favoriten / Quick-Link) 및 .qdr 레이아웃 프리셋 관리"
            >
              <Star size={13} />
              <span>즐겨찾기 / .qdr</span>
            </button>

            <button
              type="button"
              className="menu-btn"
              onClick={onOpenColorModal}
              title="Q-Dir [Filter2] 확장자·속성별 색상 규칙 편집"
            >
              <Palette size={13} />
              <span>색상 필터(Filter2)</span>
            </button>

            <button
              type="button"
              className="menu-btn"
              onClick={onOpenExportModal}
              title="활성 패널의 파일 목록을 TXT 또는 CSV(엑셀)로 내보내기"
            >
              <FileSpreadsheet size={13} />
              <span>목록 내보내기</span>
            </button>

            {/* 작은 업데이트 확인 아이콘 버튼 */}
            <button
              type="button"
              className={`menu-btn update-check-icon-btn ${
                updateAvailable ? "has-update" : ""
              }`}
              onClick={onOpenUpdateModal}
              title={
                updateAvailable
                  ? `새 버전(${latestVersion}) 업데이트 가능! 클릭하여 설치`
                  : `GitHub 최신 릴리즈 업데이트 확인 (v${pkg.version})`
              }
            >
              <DownloadCloud size={13} />
              <span>{updateAvailable ? `업데이트 (${latestVersion})` : "업데이트"}</span>
              {updateAvailable && <span className="update-dot-badge" />}
            </button>
          </nav>
        </div>

        <div className="menubar-top-info">
          <span className="shortcut-hint-item">
            <kbd>F2</kbd> 이름변경
          </span>
          <span className="shortcut-hint-sep">·</span>
          <span className="shortcut-hint-item">
            <kbd>F6</kbd> 패널전송
          </span>
          <span className="shortcut-hint-sep">·</span>
          <span className="shortcut-hint-item">
            <kbd>F7</kbd> 새폴더
          </span>
          <span className="shortcut-hint-sep">·</span>
          <span className="shortcut-hint-item">
            <kbd>Alt+1~4</kbd> 패널전환
          </span>
        </div>
      </div>

      {/* 2단: 하단 통합 도구 & 화면 분할 레이아웃 툴바 */}
      <div className="menubar-row-bottom">
        {/* 좌측: 탐색기 보기 옵션 토글 */}
        <div className="toolbar-left-toggles">
          <button
            type="button"
            className={`toggle-pill ${treeMode !== 2 ? "active" : ""}`}
            onClick={onCycleTreeMode}
            title="디렉토리 트리 모드 전환: 좌측 통합 트리 → 패널별 개별 트리 → 숨김"
          >
            <FolderTree size={13} />
            <span>{treeModeLabel}</span>
          </button>

          <button
            type="button"
            className={`toggle-pill ${previewEnabled ? "active" : ""}`}
            onClick={onTogglePreview}
            title="미리보기 패널 토글 ([Vorschau] 이미지, 텍스트/코드, 바이너리 Hex)"
          >
            <Search size={13} />
            <span>미리보기</span>
          </button>

          <button
            type="button"
            className={`toggle-pill ${useColorStart ? "active" : ""}`}
            onClick={onToggleColorStart}
            title="확장자별 색상 표시 ON/OFF"
          >
            <Sparkles size={13} />
            <span>색상표시</span>
          </button>

          <button
            type="button"
            className={`toggle-pill ${showHidden ? "active" : ""}`}
            onClick={onToggleShowHidden}
            title="숨김 파일 및 폴더 표시"
          >
            {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>숨김항목</span>
          </button>

          <div className="zoom-control-pill" title="화면 배율 및 돋보기(Lupe)">
            <button
              type="button"
              className={`lupe-btn ${magnifierActive ? "active" : ""}`}
              onClick={onToggleMagnifier}
              title="Q-Dir 돋보기(Lupe) 플로팅 확대경 켜기/끄기"
            >
              <ZoomIn size={13} />
              <span>루페</span>
            </button>
            <select
              aria-label="UI 확대 배율"
              value={zoomPct}
              onChange={(e) => onChangeZoom(Number(e.target.value))}
              className="zoom-select"
            >
              <option value={85}>85%</option>
              <option value={95}>95%</option>
              <option value={100}>100%</option>
              <option value={110}>110%</option>
              <option value={125}>125%</option>
              <option value={140}>140%</option>
            </select>
          </div>

          <button
            type="button"
            className="theme-btn"
            onClick={onToggleTheme}
            title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        {/* 우측(아래 줄로 내린 영역): 화면 분할 레이아웃 스위처 */}
        <div className="toolbar-right-layouts" role="group" aria-label="레이아웃 분할 모드">
          <span className="toolbar-group-label">레이아웃</span>
          <div className="layout-switcher-group">
            {LAYOUT_BUTTONS.map((btn) => (
              <button
                key={btn.mode}
                type="button"
                className={`layout-btn ${layoutMode === btn.mode ? "active" : ""}`}
                onClick={() => onChangeLayout(btn.mode)}
                title={btn.label}
              >
                {btn.icon}
                <span className="layout-btn-text">{btn.short}</span>
              </button>
            ))}
            <button
              type="button"
              className="layout-btn reset-split-btn"
              onClick={onResetSplits}
              title="분할 비율 50:50 균등 초기화"
            >
              <RotateCcw size={12} />
              <span>50:50</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
