import { ColorFilterRule, FileEntry, LayoutMode, SortField, ViewMode } from "../types/jdir";

export const DEFAULT_QDIR_COLOR_RULES: ColorFilterRule[] = [
  {
    id: "0",
    label: "숨김 항목 (#Hidden)",
    pattern: "#Hidden",
    colorHex: "#334155",
    enabled: true,
    isBold: false,
  },
  {
    id: "1",
    label: "압축 파일 (Archive)",
    pattern: "*.zip;*.rar;*.gz;*.7z;",
    colorHex: "#00AA00",
    enabled: true,
    isBold: false,
  },
  {
    id: "2",
    label: "미디어 (Audio/Video)",
    pattern: "*.mp*;*.avi;*.wma;*.mkv;*.mov;",
    colorHex: "#DD0058",
    enabled: true,
    isBold: false,
  },
  {
    id: "3",
    label: "폴더 (#DIR)",
    pattern: "#DIR",
    colorHex: "#008800",
    enabled: true,
    isBold: true,
  },
  {
    id: "4",
    label: "이미지 (Images)",
    pattern: "*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.ico;*.webp",
    colorHex: "#BB00BB",
    enabled: true,
    isBold: false,
  },
  {
    id: "5",
    label: "웹 문서 (Web/URL)",
    pattern: "*.html;*.htm;*.url",
    colorHex: "#456789",
    enabled: true,
    isBold: false,
  },
  {
    id: "6",
    label: "문서 및 스크립트 (Docs)",
    pattern: "*.pl;*.cgi;*.php;*.pdf;*.doc;*.docx;*.hwp;*.rtf;*.xls;*.xlsx",
    colorHex: "#BB8844",
    enabled: true,
    isBold: false,
  },
  {
    id: "7",
    label: "소스 코드 (Code)",
    pattern: "*.cpp;*.hpp;*.h;*.rs;*.ts;*.tsx;*.js;*.py",
    colorHex: "#DD0058",
    enabled: true,
    isBold: false,
  },
  {
    id: "8",
    label: "실행 및 시스템 (Exe/Sys)",
    pattern: "*.exe;*.dll;*.bat;*.cmd;*.msi",
    colorHex: "#FF0000",
    enabled: true,
    isBold: false,
  },
  {
    id: "9",
    label: "기타 모든 파일 (*)",
    pattern: "*",
    colorHex: "#0000BB",
    enabled: true,
    isBold: false,
  },
];

// Maps classic Q-Dir dark-on-light colors to high-readability colors when in Dark Mode
const DARK_MODE_COLOR_MAP: Record<string, string> = {
  "#008800": "#34D399", // Folder Dark Green -> Emerald
  "#00AA00": "#4ADE80", // Archive Green -> Bright Green
  "#DD0058": "#FB7185", // Media/Code Magenta -> Rose Pink
  "#BB00BB": "#C084FC", // Image Purple -> Lavender Purple
  "#456789": "#38BDF8", // Web Slate Blue -> Sky Blue
  "#BB8844": "#FBBF24", // Docs Brown/Gold -> Amber Gold
  "#FF0000": "#F87171", // Exe Red -> Coral Red
  "#0000BB": "#93C5FD", // Default Blue -> Soft Light Blue
  "#8A94A6": "#94A3B8", // Hidden Muted
  "#334155": "#94A3B8",
};

// Ensures light mode colors have strong, crisp contrast against white backgrounds
const LIGHT_MODE_COLOR_MAP: Record<string, string> = {
  "#008800": "#065F46", // Deep crisp forest green for folders
  "#00AA00": "#15803D", // Deep readable green for archives
  "#DD0058": "#BE123C", // Crisp crimson-rose for media/code
  "#BB00BB": "#7E22CE", // Deep purple for images
  "#456789": "#1E3A8A", // Deep navy slate for web files
  "#BB8844": "#92400E", // Deep dark amber-brown for docs
  "#FF0000": "#DC2626", // Strong crimson red for executables
  "#0000BB": "#1E40AF", // Deep royal blue for standard files
  "#8A94A6": "#334155", // Replace pale gray with dark slate (#334155)
  "#334155": "#334155",
};

function mapThemeColor(hex: string, theme: "dark" | "light"): string {
  const upper = hex.toUpperCase();
  return theme === "dark"
    ? DARK_MODE_COLOR_MAP[upper] || upper
    : LIGHT_MODE_COLOR_MAP[upper] || upper;
}

export function wildcardTokenToRegExp(token: string): RegExp {
  const escaped = token
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchWildcardPatternList(fileName: string, patternList: string): boolean {
  const tokens = patternList
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return false;

  for (const token of tokens) {
    if (token === "*" || token === "*.*") {
      return true;
    }
    if (wildcardTokenToRegExp(token).test(fileName)) {
      return true;
    }
  }
  return false;
}

export function resolveEntryColor(
  entry: FileEntry,
  rules: ColorFilterRule[],
  useColor: boolean,
  theme: "dark" | "light"
): { color?: string; isBold?: boolean } {
  if (!useColor) {
    return {};
  }

  // 1. Check #Hidden first if hidden
  if (entry.isHidden) {
    const hiddenRule = rules.find((r) => r.enabled && r.pattern.toLowerCase() === "#hidden");
    if (hiddenRule) {
      return {
        color: mapThemeColor(hiddenRule.colorHex, theme),
        isBold: hiddenRule.isBold,
      };
    }
  }

  // 2. Check #DIR for folders
  if (entry.isDir) {
    const dirRule = rules.find((r) => r.enabled && r.pattern.toUpperCase() === "#DIR");
    if (dirRule) {
      return {
        color: mapThemeColor(dirRule.colorHex, theme),
        isBold: dirRule.isBold,
      };
    }
    return {};
  }

  // 3. Check specific extension rules before fallback `*`
  let wildcardFallback: ColorFilterRule | undefined;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const pat = rule.pattern.trim();
    if (pat.startsWith("#")) continue;
    if (pat === "*" || pat === "*.*") {
      wildcardFallback = rule;
      continue;
    }
    if (matchWildcardPatternList(entry.name, pat)) {
      return {
        color: mapThemeColor(rule.colorHex, theme),
        isBold: rule.isBold,
      };
    }
  }

  if (wildcardFallback) {
    return {
      color: mapThemeColor(wildcardFallback.colorHex, theme),
      isBold: wildcardFallback.isBold,
    };
  }

  return {};
}

export function filterEntries(
  entries: FileEntry[],
  includeFilter: string,
  negativeFilter: string
): FileEntry[] {
  const inc = includeFilter.trim();
  const neg = negativeFilter.trim();

  return entries.filter((entry) => {
    // Negative filter (e.g. `Thumbs.db;*.bak`) excludes matching items
    if (neg) {
      const hasWildcard = neg.includes("*") || neg.includes("?") || neg.includes(";");
      if (hasWildcard) {
        if (matchWildcardPatternList(entry.name, neg)) return false;
      } else if (entry.name.toLowerCase().includes(neg.toLowerCase())) {
        return false;
      }
    }

    if (!inc) return true;

    const hasWildcard = inc.includes("*") || inc.includes("?") || inc.includes(";");
    if (hasWildcard) {
      return matchWildcardPatternList(entry.name, inc);
    }
    return entry.name.toLowerCase().includes(inc.toLowerCase());
  });
}

export function sortEntries(
  entries: FileEntry[],
  sortField: SortField,
  sortAsc: boolean,
  folderSizes: Record<string, number> = {}
): FileEntry[] {
  const copy = [...entries];
  copy.sort((a, b) => {
    // Folders always stay grouped at top (like Q-Dir / Windows Explorer)
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }

    let cmp = 0;
    switch (sortField) {
      case "name":
        cmp = a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" });
        break;
      case "size": {
        const sizeA = a.isDir ? (folderSizes[a.path] ?? 0) : a.size;
        const sizeB = b.isDir ? (folderSizes[b.path] ?? 0) : b.size;
        cmp = sizeA - sizeB;
        break;
      }
      case "extension":
        cmp = a.extension.localeCompare(b.extension, "ko", { sensitivity: "base" });
        break;
      case "fileType":
        cmp = a.fileType.localeCompare(b.fileType, "ko", { sensitivity: "base" });
        break;
      case "modifiedMs":
        cmp = a.modifiedMs - b.modifiedMs;
        break;
    }

    if (cmp === 0) {
      cmp = a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" });
    }
    return sortAsc ? cmp : -cmp;
  });
  return copy;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${idx === 0 ? val : val.toFixed(val >= 100 ? 0 : 1)} ${units[idx]}`;
}

export function formatDate(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function qdirAlsToLayoutMode(als: number): LayoutMode {
  switch (als) {
    case 0:
      return "1-single";
    case 1:
      return "2-vertical";
    case 2:
      return "2-horizontal";
    case 3:
      return "4-columns";
    case 4:
      return "4-rows";
    case 5:
      return "4-grid";
    case 6:
      return "3-top1-bottom2";
    case 7:
      return "3-top2-bottom1";
    case 8:
      return "3-left1-right2";
    case 9:
      return "3-left2-right1";
    default:
      return "4-grid";
  }
}

export function qdirViewModeNumberToViewMode(vm: number): ViewMode {
  switch (vm) {
    case 1:
      return "large-icons";
    case 2:
      return "small-icons";
    case 3:
      return "list";
    case 4:
      return "details";
    case 6:
      return "tiles";
    default:
      return "details";
  }
}

export function getParentPath(currentPath: string): string | null {
  const cleaned = currentPath.replace(/[\\/]+$/, "");
  if (/^[A-Za-z]:$/.test(cleaned)) {
    return null; // Already at drive root
  }
  const lastSep = Math.max(cleaned.lastIndexOf("\\"), cleaned.lastIndexOf("/"));
  if (lastSep < 0) return null;
  const parent = cleaned.slice(0, lastSep);
  if (/^[A-Za-z]:$/.test(parent)) {
    return `${parent}\\`;
  }
  return parent || null;
}

export function getDriveRoot(currentPath: string): string {
  const match = currentPath.match(/^([A-Za-z]:)/);
  if (match) {
    return `${match[1].toUpperCase()}\\`;
  }
  return "C:\\";
}
