import React, { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  DownloadCloud,
  FileSpreadsheet,
  Import,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Star,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import {
  ColorFilterRule,
  FileEntry,
  QuickLinkItem,
  SavedQdrPreset,
  UpdateCheckResult,
} from "../types/jdir";
import { DEFAULT_QDIR_COLOR_RULES, formatBytes, formatDate } from "../utils/colorFilter";
import { apiExportFileList } from "../services/tauriApi";
import { JDirBrand3DIcon, QuickLink3DIcon } from "./GraphicIcons";

interface ColorFilterModalProps {
  rules: ColorFilterRule[];
  onChangeRules: (next: ColorFilterRule[]) => void;
  onImportFromQDirIni: () => void;
  onClose: () => void;
}

export const ColorFilterModal: React.FC<ColorFilterModalProps> = ({
  rules,
  onChangeRules,
  onImportFromQDirIni,
  onClose,
}) => {
  const [newLabel, setNewLabel] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newColor, setNewColor] = useState("#00AA00");

  const handleToggleRule = (id: string) => {
    onChangeRules(
      rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleColorChange = (id: string, colorHex: string) => {
    onChangeRules(
      rules.map((r) => (r.id === id ? { ...r, colorHex: colorHex.toUpperCase() } : r))
    );
  };

  const handlePatternChange = (id: string, pattern: string) => {
    onChangeRules(rules.map((r) => (r.id === id ? { ...r, pattern } : r)));
  };

  const handleBoldToggle = (id: string) => {
    onChangeRules(rules.map((r) => (r.id === id ? { ...r, isBold: !r.isBold } : r)));
  };

  const handleDeleteRule = (id: string) => {
    onChangeRules(rules.filter((r) => r.id !== id));
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim()) return;
    const rule: ColorFilterRule = {
      id: String(Date.now()),
      label: newLabel.trim() || `사용자 규칙 (${newPattern.trim()})`,
      pattern: newPattern.trim(),
      colorHex: newColor.toUpperCase(),
      enabled: true,
      isBold: false,
    };
    onChangeRules([rule, ...rules]);
    setNewLabel("");
    setNewPattern("");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Palette size={16} />
            <span>Q-Dir 확장자·속성별 색상 필터 설정 ([Filter2])</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-toolbar-row">
            <button
              type="button"
              className="secondary-btn"
              onClick={onImportFromQDirIni}
            >
              <Import size={13} />
              <span>Q-Dir.ini에서 다시 불러오기</span>
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => onChangeRules(DEFAULT_QDIR_COLOR_RULES)}
            >
              <RotateCcw size={13} />
              <span>기본 10종 색상 초기화</span>
            </button>
          </div>

          <div className="color-rules-table-wrap">
            <table className="color-rules-table">
              <thead>
                <tr>
                  <th>사용</th>
                  <th>이름 / 설명</th>
                  <th>와일드카드 패턴 (; 구분)</th>
                  <th>색상</th>
                  <th>굵게</th>
                  <th>미리보기</th>
                  <th>삭제</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={() => handleToggleRule(r.id)}
                      />
                    </td>
                    <td>{r.label}</td>
                    <td>
                      <input
                        type="text"
                        className="table-text-input"
                        value={r.pattern}
                        onChange={(e) => handlePatternChange(r.id, e.target.value)}
                      />
                    </td>
                    <td>
                      <div className="color-picker-cell">
                        <input
                          type="color"
                          value={r.colorHex.startsWith("#") ? r.colorHex : `#${r.colorHex}`}
                          onChange={(e) => handleColorChange(r.id, e.target.value)}
                        />
                        <code>{r.colorHex}</code>
                      </div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.isBold}
                        onChange={() => handleBoldToggle(r.id)}
                      />
                    </td>
                    <td>
                      <span
                        style={{
                          color: r.colorHex,
                          fontWeight: r.isBold ? 700 : 400,
                        }}
                      >
                        샘플_파일명.ext
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => handleDeleteRule(r.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="add-rule-form" onSubmit={handleAddRule}>
            <input
              type="text"
              placeholder="규칙 이름 (예: 디자인 원본)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <input
              type="text"
              placeholder="패턴 (예: *.psd;*.ai;*.fig)"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
            />
            <button type="submit" className="primary-btn">
              <Plus size={14} />
              <span>규칙 추가</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

interface PresetsAndFavoritesModalProps {
  presets: SavedQdrPreset[];
  quickLinks: QuickLinkItem[];
  onSaveCurrentPreset: (name: string) => void;
  onLoadPreset: (preset: SavedQdrPreset) => void;
  onDeletePreset: (id: string) => void;
  onAddQuickLink: (name: string, targetPath: string) => void;
  onRemoveQuickLink: (targetPath: string) => void;
  onNavigateActivePane: (path: string) => void;
  onClose: () => void;
}

export const PresetsAndFavoritesModal: React.FC<PresetsAndFavoritesModalProps> = ({
  presets,
  quickLinks,
  onSaveCurrentPreset,
  onLoadPreset,
  onDeletePreset,
  onAddQuickLink,
  onRemoveQuickLink,
  onNavigateActivePane,
  onClose,
}) => {
  const [presetName, setPresetName] = useState("내 4분할 작업영역 (start.qdr)");
  const [qlName, setQlName] = useState("");
  const [qlPath, setQlPath] = useState("");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Star size={16} />
            <span>즐겨찾기 (Favoriten / Quick-Link) 및 .qdr 프리셋 관리</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body split-modal-columns">
          {/* Left: .qdr Workspace Presets */}
          <div className="modal-col">
            <h3 className="modal-section-heading">
              1. .qdr 4분할 레이아웃 프리셋 (start.qdr 호환)
            </h3>
            <form
              className="inline-save-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!presetName.trim()) return;
                onSaveCurrentPreset(presetName.trim());
                setPresetName("");
              }}
            >
              <input
                type="text"
                placeholder="프리셋 이름 입력..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button type="submit" className="primary-btn">
                <Save size={13} />
                <span>현재 4패널 상태 저장</span>
              </button>
            </form>

            <div className="preset-cards-list">
              {presets.map((p) => (
                <div key={p.id} className="preset-card">
                  <div className="preset-card-top">
                    <strong>{p.name.replace(/^원본\s*/, "")}</strong>
                    <span className="preset-badge">{p.layoutMode}</span>
                  </div>
                  <div className="preset-paths-grid">
                    {p.panePaths.map((path, i) => (
                      <div key={i} className="preset-path-line">
                        <span className={`pane-dot pane-color-${i + 1}`}>#{i + 1}</span>
                        <span>{path}</span>
                      </div>
                    ))}
                  </div>
                  <div className="preset-card-actions">
                    <span className="preset-date">{p.createdAt}</span>
                    <div>
                      <button
                        type="button"
                        className="mini-primary-btn"
                        onClick={() => {
                          onLoadPreset(p);
                          onClose();
                        }}
                      >
                        불러오기
                      </button>
                      <button
                        type="button"
                        className="mini-ghost-btn danger"
                        onClick={() => onDeletePreset(p.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Favoriten / Quick-Links */}
          <div className="modal-col">
            <h3 className="modal-section-heading">
              2. Quick-Links & 특수 경로 북마크 (Favoriten)
            </h3>
            <form
              className="inline-save-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!qlName.trim() || !qlPath.trim()) return;
                onAddQuickLink(qlName.trim(), qlPath.trim());
                setQlName("");
                setQlPath("");
              }}
            >
              <input
                type="text"
                placeholder="별칭 (예: 프로젝트 폴더)"
                value={qlName}
                onChange={(e) => setQlName(e.target.value)}
              />
              <input
                type="text"
                placeholder="경로 (예: Y:\내 드라이브\AI\App_Bulid)"
                value={qlPath}
                onChange={(e) => setQlPath(e.target.value)}
              />
              <button type="submit" className="primary-btn">
                <Plus size={13} />
                <span>추가</span>
              </button>
            </form>

            <div className="quicklinks-manage-list">
              {quickLinks.map((ql) => (
                <div key={ql.name + ql.targetPath} className="ql-manage-row">
                  <div
                    className="ql-manage-info"
                    onClick={() => {
                      onNavigateActivePane(ql.targetPath);
                      onClose();
                    }}
                  >
                    <QuickLink3DIcon label={ql.name} size={16} />
                    <div>
                      <div className="ql-manage-name">{ql.name}</div>
                      <div className="ql-manage-path">{ql.targetPath}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => onRemoveQuickLink(ql.targetPath)}
                    title="즐겨찾기 삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ExportListModalProps {
  paneIndex: number;
  currentPath: string;
  entries: FileEntry[];
  onNotify: (msg: string, isError?: boolean) => void;
  onClose: () => void;
}

export const ExportListModal: React.FC<ExportListModalProps> = ({
  paneIndex,
  currentPath,
  entries,
  onNotify,
  onClose,
}) => {
  const [format, setFormat] = useState<"csv" | "txt">("csv");
  const defaultOutPath = `${currentPath.replace(/[\\/]+$/, "")}\\J-Dir_List_Pane${
    paneIndex + 1
  }.${format}`;
  const [outputPath, setOutputPath] = useState(defaultOutPath);
  const [copied, setCopied] = useState(false);

  const previewText = useMemo(() => {
    if (format === "csv") {
      const header = "이름,유형,크기(Bytes),수정한 날짜,숨김,전체 경로";
      const rows = entries.map(
        (e) =>
          `"${e.name}","${e.fileType}",${e.isDir ? 0 : e.size},"${formatDate(
            e.modifiedMs
          )}",${e.isHidden ? "Y" : "N"},"${e.path}"`
      );
      return [header, ...rows].join("\n");
    } else {
      const lines = entries.map(
        (e) =>
          `${e.name.padEnd(36)} ${e.fileType.padEnd(14)} ${(e.isDir
            ? "<DIR>"
            : formatBytes(e.size)
          ).padStart(12)}  ${formatDate(e.modifiedMs)}`
      );
      return [
        `J-Dir 목록 내보내기 — 패널 #${paneIndex + 1} (${currentPath})`,
        "-".repeat(80),
        ...lines,
      ].join("\n");
    }
  }, [entries, format, paneIndex, currentPath]);

  const handleCopyClipboard = async () => {
    await navigator.clipboard.writeText(previewText);
    setCopied(true);
    onNotify("파일 목록이 클립보드에 복사되었습니다.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveFile = async () => {
    try {
      const saved = await apiExportFileList(entries, outputPath, format);
      onNotify(`목록 파일 저장 완료: ${saved}`);
      onClose();
    } catch (err) {
      onNotify(String(err), true);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FileSpreadsheet size={16} />
            <span>
              패널 #{paneIndex + 1} 파일 목록 내보내기 (Export zu TXT / CSV)
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="export-controls-row">
            <div className="format-radio-group">
              <button
                type="button"
                className={`toggle-pill ${format === "csv" ? "active" : ""}`}
                onClick={() => {
                  setFormat("csv");
                  setOutputPath(outputPath.replace(/\.txt$/i, ".csv"));
                }}
              >
                CSV (엑셀 호환 UTF-8)
              </button>
              <button
                type="button"
                className={`toggle-pill ${format === "txt" ? "active" : ""}`}
                onClick={() => {
                  setFormat("txt");
                  setOutputPath(outputPath.replace(/\.csv$/i, ".txt"));
                }}
              >
                TXT (정렬된 텍스트 표)
              </button>
            </div>

            <button type="button" className="secondary-btn" onClick={handleCopyClipboard}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? "복사됨" : "클립보드 복사"}</span>
            </button>
          </div>

          <div className="export-path-row">
            <label>저장할 파일 경로:</label>
            <input
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
            />
            <button type="button" className="primary-btn" onClick={handleSaveFile}>
              <Download size={14} />
              <span>파일로 저장</span>
            </button>
          </div>

          <pre className="export-preview-box">{previewText}</pre>
        </div>
      </div>
    </div>
  );
};

interface MagnifierHudProps {
  zoomPct: number;
  selectedEntry: FileEntry | null;
  onChangeZoom: (pct: number) => void;
  onClose: () => void;
}

export const MagnifierHud: React.FC<MagnifierHudProps> = ({
  zoomPct,
  selectedEntry,
  onChangeZoom,
  onClose,
}) => {
  return (
    <div className="lupe-floating-hud">
      <div className="lupe-hud-header">
        <ZoomIn size={14} />
        <span>Q-Dir 돋보기 (Lupe) — {zoomPct}%</span>
        <button type="button" className="icon-btn" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className="lupe-slider-row">
        <input
          type="range"
          min={85}
          max={160}
          step={5}
          value={zoomPct}
          onChange={(e) => onChangeZoom(Number(e.target.value))}
        />
        <button
          type="button"
          className="mini-ghost-btn"
          onClick={() => onChangeZoom(100)}
        >
          100% 초기화
        </button>
      </div>
      {selectedEntry && (
        <div className="lupe-focus-inspect">
          <div className="lupe-big-name">{selectedEntry.name}</div>
          <div className="lupe-big-detail">
            {selectedEntry.isDir ? "폴더" : formatBytes(selectedEntry.size)} ·{" "}
            {selectedEntry.fileType} · {formatDate(selectedEntry.modifiedMs)}
          </div>
        </div>
      )}
    </div>
  );
};

interface UpdateModalProps {
  updateInfo: UpdateCheckResult | null;
  checking: boolean;
  installing: boolean;
  errorMsg: string | null;
  onCheckAgain: () => void;
  onInstallNow: () => void;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  updateInfo,
  checking,
  installing,
  errorMsg,
  onCheckAgain,
  onInstallNow,
  onClose,
}) => {
  return (
    <div className="modal-backdrop" onClick={installing ? undefined : onClose}>
      <div className="modal-dialog modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <DownloadCloud size={16} />
            <span>J-Dir 자동 업데이트 확인 및 설치</span>
          </div>
          {!installing && (
            <button type="button" className="icon-btn" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="modal-body update-modal-body">
          <div className="update-brand-banner">
            <JDirBrand3DIcon size={42} />
            <div className="update-brand-meta">
              <h4>J-Dir — The Quad Explorer</h4>
              <p>
                현재 버전: <strong>v{updateInfo?.currentVersion || "1.1.5"}</strong>
                {updateInfo?.latestVersion && (
                  <>
                    {" "}
                    · 최신 릴리즈: <strong>v{updateInfo.latestVersion}</strong>
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              disabled={checking || installing}
              onClick={onCheckAgain}
            >
              <RefreshCw size={13} className={checking ? "spin-anim" : ""} />
              <span>다시 확인</span>
            </button>
          </div>

          {checking && (
            <div className="update-status-card checking">
              <RefreshCw size={20} className="spin-anim" />
              <span>GitHub 저장소(cybereun/J-Dir)에서 최신 릴리즈를 확인하는 중입니다...</span>
            </div>
          )}

          {!checking && errorMsg && (
            <div className="update-status-card error">
              <p>업데이트 정보를 확인하지 못했습니다: {errorMsg}</p>
            </div>
          )}

          {!checking && !errorMsg && updateInfo && !updateInfo.updateAvailable && (
            <div className="update-status-card latest">
              <Check size={20} />
              <div>
                <strong>현재 최신 버전(v{updateInfo.currentVersion})을 사용 중입니다.</strong>
                <p>새로운 버전이 GitHub 릴리즈에 등록되면 앱 실행 시 자동으로 안내해 드립니다.</p>
              </div>
            </div>
          )}

          {!checking && !errorMsg && updateInfo && updateInfo.updateAvailable && (
            <div className="update-available-box">
              <div className="update-avail-header">
                <span className="update-new-badge">NEW RELEASE</span>
                <strong>
                  {updateInfo.releaseName || `J-Dir v${updateInfo.latestVersion}`} 업데이트가 준비되었습니다!
                </strong>
              </div>

              {updateInfo.releaseNotes && (
                <pre className="update-notes-box">{updateInfo.releaseNotes}</pre>
              )}

              {installing ? (
                <div className="update-status-card installing">
                  <RefreshCw size={18} className="spin-anim" />
                  <span>
                    최신 설치 프로그램({updateInfo.assetName || "Setup.exe"})을 다운로드하고 설치 중입니다.
                    설치가 완료되면 J-Dir이 자동으로 재시작됩니다...
                  </span>
                </div>
              ) : (
                <div className="update-actions-row">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={onInstallNow}
                  >
                    <Download size={14} />
                    <span>지금 업데이트 설치 및 자동 재시작</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


interface ConfirmDeleteDialogProps {
  paths: string[];
  permanent: boolean;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

export const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  paths,
  permanent,
  onConfirm,
  onCancel,
}) => {
  const [dontAsk, setDontAsk] = useState(false);
  const firstName = paths[0]?.split(/[\/]/).filter(Boolean).pop() ?? "";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm(dontAsk);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dontAsk, onConfirm, onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-dialog modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Trash2 size={16} />
            <span>{permanent ? "영구 삭제 확인" : "삭제 확인"}</span>
          </div>
        </div>
        <div className="modal-body confirm-dialog-body">
          <p>
            {paths.length === 1 ? `"${firstName}"` : `선택한 ${paths.length}개 항목`}
            {permanent
              ? " 을(를) 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다."
              : " 을(를) 휴지통으로 이동합니다."}
          </p>
          {!permanent && (
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={dontAsk}
                onChange={(e) => setDontAsk(e.target.checked)}
              />
              <span>휴지통 삭제는 다시 묻지 않기</span>
            </label>
          )}
          <div className="confirm-actions">
            <button type="button" className="secondary-btn" onClick={onCancel}>
              취소 (Esc)
            </button>
            <button
              type="button"
              className={permanent ? "primary-btn danger-btn" : "primary-btn"}
              onClick={() => onConfirm(dontAsk)}
              autoFocus
            >
              {permanent ? "영구 삭제 (Enter)" : "삭제 (Enter)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ConflictDialogProps {
  names: string[];
  mode: "copy" | "move";
  onChoose: (policy: "overwrite" | "rename" | "skip" | null) => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({ names, mode, onChoose }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onChoose(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChoose]);

  return (
    <div className="modal-backdrop" onClick={() => onChoose(null)}>
      <div className="modal-dialog modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Copy size={16} />
            <span>같은 이름의 항목이 있습니다</span>
          </div>
        </div>
        <div className="modal-body confirm-dialog-body">
          <p>
            대상 폴더에 같은 이름이 {names.length}개 있습니다 ({mode === "copy" ? "복사" : "이동"}).
          </p>
          <ul className="conflict-name-list">
            {names.slice(0, 6).map((n) => (
              <li key={n}>{n}</li>
            ))}
            {names.length > 6 && <li>… 외 {names.length - 6}개</li>}
          </ul>
          <div className="confirm-actions conflict-actions">
            <button type="button" className="primary-btn danger-btn" onClick={() => onChoose("overwrite")}>
              덮어쓰기
            </button>
            <button type="button" className="primary-btn" onClick={() => onChoose("rename")} autoFocus>
              둘 다 유지
            </button>
            <button type="button" className="secondary-btn" onClick={() => onChoose("skip")}>
              건너뛰기
            </button>
            <button type="button" className="secondary-btn" onClick={() => onChoose(null)}>
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
