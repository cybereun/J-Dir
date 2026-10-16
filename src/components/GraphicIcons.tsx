import React from "react";
import { FileEntry } from "../types/jdir";

interface IconSizeProps {
  size?: number;
  className?: string;
}

/**
 * J-Dir Official 3D App Brand Icon (Quad Explorer 4-pane 3D Folder & Badge)
 */
export const JDirBrand3DIcon: React.FC<IconSizeProps> = ({
  size = 20,
  className = "",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    className={`graphic-3d-icon ${className}`}
  >
    <defs>
      <linearGradient id="jdirBg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#0F172A" />
      </linearGradient>
      <linearGradient id="jdirQ1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
      <linearGradient id="jdirQ2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#34D399" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="jdirQ3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
      <linearGradient id="jdirQ4" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F472B6" />
        <stop offset="100%" stopColor="#BE185D" />
      </linearGradient>
      <linearGradient id="jdirGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="50%" stopColor="#FACC15" />
        <stop offset="100%" stopColor="#CA8A04" />
      </linearGradient>
    </defs>
    {/* Outer 3D Squircle Frame */}
    <rect
      x="1.5"
      y="1.5"
      width="29"
      height="29"
      rx="7"
      fill="url(#jdirBg)"
      stroke="#475569"
      strokeWidth="1.2"
    />
    {/* 4 Quad Panes */}
    <rect x="4" y="4" width="11" height="11" rx="3" fill="url(#jdirQ1)" />
    <rect x="5.5" y="5.5" width="8" height="2" rx="1" fill="#DBEAFE" opacity="0.85" />
    <rect x="17" y="4" width="11" height="11" rx="3" fill="url(#jdirQ2)" />
    <rect x="18.5" y="5.5" width="8" height="2" rx="1" fill="#D1FAE5" opacity="0.85" />
    <rect x="4" y="17" width="11" height="11" rx="3" fill="url(#jdirQ3)" />
    <rect x="5.5" y="18.5" width="8" height="2" rx="1" fill="#FEF3C7" opacity="0.85" />
    <rect x="17" y="17" width="11" height="11" rx="3" fill="url(#jdirQ4)" />
    <rect x="18.5" y="18.5" width="8" height="2" rx="1" fill="#FCE7F3" opacity="0.85" />
    {/* Center 3D Golden Folder Shield with 'J' */}
    <rect
      x="9.5"
      y="9.5"
      width="13"
      height="13"
      rx="3.5"
      fill="#0F172A"
      opacity="0.45"
    />
    <path
      d="M10 12C10 10.9 10.9 10 12 10H15L16.5 11.6H20C21.1 11.6 22 12.5 22 13.6V20C22 21.1 21.1 22 20 22H12C10.9 22 10 21.1 10 20V12Z"
      fill="url(#jdirGold)"
      stroke="#854D0E"
      strokeWidth="0.9"
    />
    <text
      x="16"
      y="19.3"
      textAnchor="middle"
      fill="#1E293B"
      fontSize="8.5"
      fontWeight="900"
      fontFamily="Segoe UI, Arial, sans-serif"
    >
      J
    </text>
  </svg>
);

/**
 * Cute 3D Golden Folder Icon (Closed / Open with inner paper peek)
 */
export const Folder3DIcon: React.FC<IconSizeProps & { open?: boolean }> = ({
  size = 18,
  open = false,
  className = "",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={`graphic-3d-icon ${className}`}
  >
    <defs>
      <linearGradient id="fldBack" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
      <linearGradient id="fldFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="35%" stopColor="#FACC15" />
        <stop offset="100%" stopColor="#EA580C" />
      </linearGradient>
      <linearGradient id="fldPaper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#E2E8F0" />
      </linearGradient>
    </defs>
    {/* Drop shadow base */}
    <rect x="2" y="19" width="20" height="2.5" rx="1.2" fill="rgba(0,0,0,0.16)" />
    {/* Folder back plate & tab */}
    <path
      d="M2 6C2 4.6 3.1 3.5 4.5 3.5H9.2C10 3.5 10.7 3.9 11.2 4.6L12.3 6H19.5C20.9 6 22 7.1 22 8.5V18C22 19.4 20.9 20.5 19.5 20.5H4.5C3.1 20.5 2 19.4 2 18V6Z"
      fill="url(#fldBack)"
    />
    {/* Inner white paper peek when open */}
    {open && (
      <rect
        x="4"
        y="5.8"
        width="16"
        height="9"
        rx="1.5"
        fill="url(#fldPaper)"
        stroke="#CBD5E1"
        strokeWidth="0.6"
      />
    )}
    {/* Glossy 3D front flap */}
    <path
      d={
        open
          ? "M1.5 10.5C1.5 9.4 2.4 8.5 3.5 8.5H20.5C21.6 8.5 22.4 9.5 22.2 10.6L20.8 18.8C20.6 19.8 19.7 20.5 18.7 20.5H4.3C3.3 20.5 2.4 19.8 2.2 18.8L1.5 10.5Z"
          : "M2 9.2C2 8 3 7 4.2 7H19.8C21 7 22 8 22 9.2V18.2C22 19.5 21 20.5 19.7 20.5H4.3C3 20.5 2 19.5 2 18.2V9.2Z"
      }
      fill="url(#fldFront)"
      stroke="#D97706"
      strokeWidth="0.7"
    />
    {/* Top specular highlight */}
    <path
      d={open ? "M3.5 9.5H20.5" : "M4 8.2H20"}
      stroke="rgba(255,255,255,0.75)"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Cute 3D Parent Directory [..] Folder Icon with Blue Up-Arrow
 */
export const ParentFolder3DIcon: React.FC<IconSizeProps> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
    <Folder3DIcon size={24} />
    <circle cx="16.5" cy="15.5" r="5.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.2" />
    <path
      d="M16.5 12.5L13.8 15.3H15.5V18.2H17.5V15.3H19.2L16.5 12.5Z"
      fill="#FFFFFF"
    />
  </svg>
);

/**
 * 3D Hard Drive Icon (with Windows badge for C: drive and glowing LED)
 */
export const Drive3DIcon: React.FC<IconSizeProps & { isSystemDrive?: boolean }> = ({
  size = 18,
  isSystemDrive = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
    <defs>
      <linearGradient id="hddBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F1F5F9" />
        <stop offset="55%" stopColor="#CBD5E1" />
        <stop offset="100%" stopColor="#64748B" />
      </linearGradient>
      <linearGradient id="hddFront" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#334155" />
      </linearGradient>
    </defs>
    {/* 3D Metallic Enclosure */}
    <path
      d="M4.5 6.5C4.8 5.3 5.8 4.5 7 4.5H17C18.2 4.5 19.2 5.3 19.5 6.5L21.5 14.5V18C21.5 19.4 20.4 20.5 19 20.5H5C3.6 20.5 2.5 19.4 2.5 18V14.5L4.5 6.5Z"
      fill="url(#hddBody)"
      stroke="#475569"
      strokeWidth="0.9"
    />
    {/* Front Bezel */}
    <rect
      x="3.2"
      y="13.5"
      width="17.6"
      height="6"
      rx="2"
      fill="url(#hddFront)"
      stroke="#0F172A"
      strokeWidth="0.7"
    />
    {/* Glowing LED Indicator */}
    <circle cx="17.5" cy="16.5" r="1.5" fill={isSystemDrive ? "#38BDF8" : "#22C55E"} />
    <rect x="6" y="15.8" width="7" height="1.4" rx="0.7" fill="#64748B" />
    {/* Windows 4-tile badge for C: drive */}
    {isSystemDrive && (
      <g transform="translate(8, 5.8)">
        <rect x="0" y="0" width="3.4" height="3.2" rx="0.5" fill="#0284C7" />
        <rect x="4" y="0" width="3.4" height="3.2" rx="0.5" fill="#0EA5E9" />
        <rect x="0" y="3.8" width="3.4" height="3.2" rx="0.5" fill="#0369A1" />
        <rect x="4" y="3.8" width="3.4" height="3.2" rx="0.5" fill="#0284C7" />
      </g>
    )}
  </svg>
);

/**
 * 3D Computer ("내 PC") Icon
 */
export const MyPc3DIcon: React.FC<IconSizeProps> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
    <defs>
      <linearGradient id="pcScreen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
    </defs>
    <rect
      x="2.5"
      y="3.5"
      width="19"
      height="13"
      rx="2.2"
      fill="url(#pcScreen)"
      stroke="#1E3A8A"
      strokeWidth="1"
    />
    <path d="M5 6H13L8 14H5V6Z" fill="rgba(255,255,255,0.28)" />
    <path d="M9.5 16.5H14.5L15.5 20H8.5L9.5 16.5Z" fill="#94A3B8" />
    <rect x="6.5" y="19.5" width="11" height="1.8" rx="0.9" fill="#475569" />
  </svg>
);

/**
 * 3D Star Icon for Quick-Links Header
 */
export const Star3DIcon: React.FC<IconSizeProps> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
    <defs>
      <linearGradient id="starGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="50%" stopColor="#FACC15" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>
    <path
      d="M12 2.2L14.9 8.2L21.5 9.1L16.7 13.7L17.9 20.3L12 17.1L6.1 20.3L7.3 13.7L2.5 9.1L9.1 8.2L12 2.2Z"
      fill="url(#starGrad)"
      stroke="#B45309"
      strokeWidth="0.9"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 3D Graphic Icons for Special Quick-Link Items (바탕화면, 다운로드, 내 문서, AppData, Windows, 작업폴더, 유틸리티)
 */
export const QuickLink3DIcon: React.FC<IconSizeProps & { label: string }> = ({
  label,
  size = 17,
}) => {
  const lower = label.toLowerCase();

  if (lower.includes("바탕화면") || lower.includes("desktop")) {
    return <MyPc3DIcon size={size} />;
  }

  if (lower.includes("다운로드") || lower.includes("download")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <defs>
          <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="4.5"
          fill="url(#dlGrad)"
          stroke="#047857"
          strokeWidth="0.9"
        />
        <path
          d="M12 6.5V14.5M12 14.5L8.5 11M12 14.5L15.5 11"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7 17.5H17" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (lower.includes("문서") || lower.includes("doc")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <defs>
          <linearGradient id="docBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#DBEAFE" />
          </linearGradient>
        </defs>
        <path
          d="M5 3.5C5 2.7 5.7 2 6.5 2H14.5L19.5 7V20.5C19.5 21.3 18.8 22 18 22H6.5C5.7 22 5 21.3 5 20.5V3.5Z"
          fill="url(#docBody)"
          stroke="#2563EB"
          strokeWidth="1"
        />
        <path d="M14.5 2V7H19.5" fill="#93C5FD" stroke="#2563EB" strokeWidth="0.9" />
        <rect x="7.5" y="10" width="9" height="1.8" rx="0.9" fill="#2563EB" />
        <rect x="7.5" y="13.5" width="9" height="1.8" rx="0.9" fill="#60A5FA" />
        <rect x="7.5" y="17" width="6" height="1.8" rx="0.9" fill="#93C5FD" />
      </svg>
    );
  }

  if (lower.includes("windows")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <rect x="3" y="3" width="8.2" height="8.2" rx="1.6" fill="#0EA5E9" />
        <rect x="12.8" y="3" width="8.2" height="8.2" rx="1.6" fill="#38BDF8" />
        <rect x="3" y="12.8" width="8.2" height="8.2" rx="1.6" fill="#0284C7" />
        <rect x="12.8" y="12.8" width="8.2" height="8.2" rx="1.6" fill="#0EA5E9" />
      </svg>
    );
  }

  if (lower.includes("appdata") || lower.includes("유틸리티")) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <Folder3DIcon size={24} />
        <circle cx="17" cy="16" r="4.8" fill="#6366F1" stroke="#FFFFFF" strokeWidth="1" />
        <circle cx="17" cy="16" r="1.8" fill="#FFFFFF" />
      </svg>
    );
  }

  return <Folder3DIcon size={size} />;
};

/**
 * 3D Graphic File & Folder Icon Resolver for ExplorerPane
 */
export const EntryGraphic3DIcon: React.FC<{
  entry: FileEntry;
  size?: number;
}> = ({ entry, size = 18 }) => {
  if (entry.isDir) {
    return <Folder3DIcon size={size} />;
  }

  const ext = entry.extension.toLowerCase();

  // 1. Archive (.zip, .rar, .7z, .gz, .tar) -> 3D Parcel Box with Zipper/Tape
  if (["zip", "rar", "7z", "gz", "tar", "bz2", "xz"].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <defs>
          <linearGradient id="zipBox" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="4"
          width="18"
          height="16.5"
          rx="3"
          fill="url(#zipBox)"
          stroke="#92400E"
          strokeWidth="0.9"
        />
        <path d="M3 9.5H21" stroke="#78350F" strokeWidth="1.2" />
        {/* Zipper teeth */}
        <rect x="10.5" y="4" width="3" height="16.5" fill="#FEF3C7" opacity="0.85" />
        <rect x="11" y="5.5" width="2" height="1.5" fill="#92400E" />
        <rect x="11" y="8.5" width="2" height="1.5" fill="#92400E" />
        <rect x="11" y="11.5" width="2" height="2.5" rx="0.5" fill="#15803D" />
      </svg>
    );
  }

  // 2. Image (.jpg, .png, .gif, .webp, .bmp, .ico, .svg) -> 3D Glossy Landscape Picture Card
  if (["jpg", "jpeg", "png", "gif", "bmp", "ico", "webp", "svg"].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <defs>
          <linearGradient id="imgSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3.5"
          width="18"
          height="17"
          rx="3.2"
          fill="url(#imgSky)"
          stroke="#4F46E5"
          strokeWidth="0.9"
        />
        <circle cx="8.5" cy="9" r="2.2" fill="#FEF08A" />
        <path
          d="M3.5 18.5L9 12.5L13.5 16.5L16.5 13.5L20.5 18.5C20.5 19.6 19.6 20.2 18.5 20.2H5.5C4.4 20.2 3.5 19.6 3.5 18.5Z"
          fill="#22C55E"
        />
      </svg>
    );
  }

  // 3. Video (.mp4, .mkv, .avi, .mov, .wmv, .webm) -> 3D Purple Cinema Reel & Play Badge
  if (["mp4", "mkv", "avi", "mov", "wmv", "webm"].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <defs>
          <linearGradient id="vidGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="3.5"
          fill="url(#vidGrad)"
          stroke="#4338CA"
          strokeWidth="0.9"
        />
        <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="#FFFFFF" />
      </svg>
    );
  }

  // 4. Audio (.mp3, .wav, .flac, .wma, .m4a, .ogg) -> 3D Coral-Rose Music Disc
  if (["mp3", "wav", "flac", "wma", "ogg", "m4a", "aac"].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <defs>
          <linearGradient id="audGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#E11D48" />
          </linearGradient>
        </defs>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="url(#audGrad)"
          stroke="#9F1239"
          strokeWidth="0.9"
        />
        <path
          d="M10.5 15.5V8.5L15.5 7.2V14.2"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9.2" cy="15.5" r="1.7" fill="#FFFFFF" />
        <circle cx="14.2" cy="14.2" r="1.7" fill="#FFFFFF" />
      </svg>
    );
  }

  // 5. Executable / System (.exe, .msi, .bat, .cmd, .dll) -> 3D App Window Icon
  if (["exe", "msi", "bat", "cmd", "ps1", "dll", "sys"].includes(ext)) {
    const isDll = ext === "dll" || ext === "sys";
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <defs>
          <linearGradient id="exeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isDll ? "#94A3B8" : "#60A5FA"} />
            <stop offset="100%" stopColor={isDll ? "#475569" : "#1D4ED8"} />
          </linearGradient>
        </defs>
        <rect
          x="2.5"
          y="4"
          width="19"
          height="16"
          rx="3"
          fill="url(#exeGrad)"
          stroke={isDll ? "#334155" : "#1E3A8A"}
          strokeWidth="0.9"
        />
        <rect x="4" y="8.5" width="16" height="10" rx="1.5" fill="#FFFFFF" opacity="0.92" />
        <circle cx="5.5" cy="6.2" r="1" fill="#FEF08A" />
        <circle cx="8.2" cy="6.2" r="1" fill="#4ADE80" />
        <path
          d="M10.5 11L14.5 13.5L10.5 16V11Z"
          fill={isDll ? "#475569" : "#DC2626"}
        />
      </svg>
    );
  }

  // 6. Spreadsheets (.xls, .xlsx, .csv) -> 3D Green Sheet
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <rect
          x="4"
          y="2.5"
          width="16"
          height="19"
          rx="2.5"
          fill="#16A34A"
          stroke="#14532D"
          strokeWidth="0.9"
        />
        <rect x="6.5" y="6" width="11" height="12.5" rx="1" fill="#DCFCE7" />
        <path d="M6.5 10H17.5M6.5 14H17.5M11.5 6V18.5" stroke="#16A34A" strokeWidth="1.2" />
      </svg>
    );
  }

  // 7. Code / Config (.rs, .ts, .tsx, .js, .py, .json, .ini, .qdr, .html, .css)
  if (
    [
      "rs",
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "c",
      "cpp",
      "h",
      "hpp",
      "json",
      "ini",
      "qdr",
      "toml",
      "yaml",
      "yml",
      "html",
      "htm",
      "css",
    ].includes(ext)
  ) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
        <rect
          x="3.5"
          y="3"
          width="17"
          height="18"
          rx="3"
          fill="#1E293B"
          stroke="#475569"
          strokeWidth="0.9"
        />
        <path
          d="M9.5 9L6.5 12L9.5 15M14.5 9L17.5 12L14.5 15"
          stroke="#38BDF8"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 8. Documents (.pdf, .hwp, .doc, .docx, .txt, .md) & General Files -> 3D Folded Sheet
  const ribbonColor =
    ext === "pdf"
      ? "#DC2626"
      : ["hwp", "hwpx", "doc", "docx"].includes(ext)
      ? "#2563EB"
      : "#64748B";

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="graphic-3d-icon">
      <defs>
        <linearGradient id="pageGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
      </defs>
      <path
        d="M5 3.5C5 2.7 5.7 2 6.5 2H14.5L19.5 7V20.5C19.5 21.3 18.8 22 18 22H6.5C5.7 22 5 21.3 5 20.5V3.5Z"
        fill="url(#pageGrad)"
        stroke="#64748B"
        strokeWidth="0.9"
      />
      <path d="M14.5 2V7H19.5" fill="#CBD5E1" stroke="#64748B" strokeWidth="0.9" />
      <rect x="7" y="10" width="10" height="3.2" rx="1" fill={ribbonColor} />
      <rect x="7" y="15" width="9" height="1.5" rx="0.7" fill="#94A3B8" />
      <rect x="7" y="17.8" width="6.5" height="1.5" rx="0.7" fill="#94A3B8" />
    </svg>
  );
};
