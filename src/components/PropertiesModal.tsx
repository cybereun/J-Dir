import React, { useEffect, useMemo, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { FileEntry } from "../types/jdir";
import {
  apiCalculateFolderSize,
  apiCancelJob,
  apiJobDone,
  apiSetAttributes,
} from "../services/tauriApi";
import { formatBytes, formatDate, getParentPath } from "../utils/colorFilter";
import { EntryGraphic3DIcon } from "./GraphicIcons";

interface PropertiesModalProps {
  entries: FileEntry[];
  onChanged: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
  onClose: () => void;
}

/** true / false when all items agree, null when mixed */
function tri(values: boolean[]): boolean | null {
  if (values.every(Boolean)) return true;
  if (values.every((v) => !v)) return false;
  return null;
}

const TriCheckbox: React.FC<{
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}> = ({ label, value, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = value === null;
  }, [value]);
  return (
    <label className="props-check">
      <input
        ref={ref}
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
};

export const PropertiesModal: React.FC<PropertiesModalProps> = ({
  entries,
  onChanged,
  onNotify,
  onClose,
}) => {
  const [readonly, setReadonly] = useState<boolean | null>(() => tri(entries.map((e) => e.isReadonly)));
  const [hidden, setHidden] = useState<boolean | null>(() => tri(entries.map((e) => e.isHidden)));
  const initial = useRef({ readonly, hidden });
  const [dirSizes, setDirSizes] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState({ files: 0, dirs: 0 });
  const [calculating, setCalculating] = useState(false);
  const jobRef = useRef<string>(`props-${Date.now()}`);

  useEffect(() => {
    let alive = true;
    const dirs = entries.filter((e) => e.isDir);
    if (dirs.length === 0) return;
    setCalculating(true);
    (async () => {
      let files = 0;
      let dirCount = 0;
      for (const d of dirs) {
        try {
          const st = await apiCalculateFolderSize(d.path, jobRef.current);
          if (!alive || st.cancelled) return;
          files += st.fileCount;
          dirCount += st.dirCount;
          setDirSizes((prev) => ({ ...prev, [d.path]: st.totalBytes }));
          setCounts({ files, dirs: dirCount });
        } catch {
          // inaccessible folder — leave size unknown
        }
      }
      if (alive) setCalculating(false);
    })();
    return () => {
      alive = false;
      apiCancelJob(jobRef.current).catch(() => {});
      setTimeout(() => apiJobDone(jobRef.current).catch(() => {}), 500);
    };
  }, [entries]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const single = entries.length === 1 ? entries[0] : null;
  const totalBytes = useMemo(
    () => entries.reduce((sum, e) => sum + (e.isDir ? dirSizes[e.path] ?? 0 : e.size), 0),
    [entries, dirSizes]
  );
  const folderCount = entries.filter((e) => e.isDir).length;
  const fileCount = entries.length - folderCount;

  const apply = async () => {
    const ro = readonly !== initial.current.readonly && readonly !== null ? readonly : undefined;
    const hid = hidden !== initial.current.hidden && hidden !== null ? hidden : undefined;
    if (ro === undefined && hid === undefined) {
      onClose();
      return;
    }
    try {
      const report = await apiSetAttributes(
        entries.map((e) => e.path),
        ro,
        hid
      );
      if (report.failed.length > 0) {
        onNotify(`속성 변경 실패: ${report.failed[0].error}`, true);
      } else {
        onNotify("속성을 변경했습니다.");
      }
      onChanged();
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
            <Info size={16} />
            <span>속성</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body props-body">
          <div className="props-head">
            {single ? (
              <>
                <EntryGraphic3DIcon entry={single} size={32} />
                <strong className="props-name">{single.name}</strong>
              </>
            ) : (
              <strong>선택한 {entries.length}개 항목</strong>
            )}
          </div>

          <dl className="props-grid">
            {single ? (
              <>
                <dt>유형</dt>
                <dd>{single.fileType}</dd>
                <dt>위치</dt>
                <dd title={single.path}>{getParentPath(single.path) ?? single.path}</dd>
              </>
            ) : (
              <>
                <dt>구성</dt>
                <dd>
                  파일 {fileCount}개, 폴더 {folderCount}개
                </dd>
              </>
            )}
            <dt>크기</dt>
            <dd>
              {formatBytes(totalBytes)} ({totalBytes.toLocaleString()} 바이트)
              {calculating && " · 계산 중..."}
            </dd>
            {folderCount > 0 && (
              <>
                <dt>폴더 내용</dt>
                <dd>
                  파일 {counts.files.toLocaleString()}개, 폴더 {counts.dirs.toLocaleString()}개
                </dd>
              </>
            )}
            {single && (
              <>
                <dt>만든 날짜</dt>
                <dd>{formatDate(single.createdMs)}</dd>
                <dt>수정한 날짜</dt>
                <dd>{formatDate(single.modifiedMs)}</dd>
              </>
            )}
            <dt>특성</dt>
            <dd className="props-attrs">
              <TriCheckbox label="읽기 전용" value={readonly} onChange={setReadonly} />
              <TriCheckbox label="숨김" value={hidden} onChange={setHidden} />
            </dd>
          </dl>

          <div className="confirm-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              닫기
            </button>
            <button type="button" className="primary-btn" onClick={apply}>
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
