export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isHidden: boolean;
  isSystem: boolean;
  isReadonly: boolean;
  size: number;
  modifiedMs: number;
  createdMs: number;
  extension: string;
  fileType: string;
}

export interface DriveInfo {
  letter: string;
  rootPath: string;
  label: string;
  driveType: string;
  totalBytes: number;
  freeBytes: number;
}

export interface SpecialPaths {
  desktop: string;
  documents: string;
  downloads: string;
  appdata: string;
  windir: string;
  sysdir: string;
  userProfile: string;
  currentDir: string;
}

export interface FolderSizeStats {
  path: string;
  totalBytes: number;
  fileCount: number;
  dirCount: number;
}

export interface ColorFilterRule {
  id: string;
  label: string;
  pattern: string;
  colorHex: string;
  enabled: boolean;
  isBold: boolean;
}

export interface QuickLinkItem {
  name: string;
  targetPath: string;
  category: string;
}

export interface QDirWorkspaceConfig {
  sourceDir: string;
  layoutMode: number;
  useColorStart: boolean;
  designMode: number;
  treeMode: number;
  sp0: number;
  sp1: number;
  sp2: number;
  spt: number;
  tree1: number;
  tree2: number;
  tree3: number;
  tree4: number;
  tree1Split: number;
  tree2Split: number;
  tree3Split: number;
  tree4Split: number;
  previewEnabled: boolean;
  previewPos: number;
  previewFilter: string;
  activeFocus: number;
  panePaths: [string, string, string, string];
  paneViewModes: [number, number, number, number];
  showFilterPane3: boolean;
  colorRules: ColorFilterRule[];
  quickLinks: QuickLinkItem[];
}

export interface FileActionError {
  path: string;
  error: string;
}

export interface FileActionReport {
  succeeded: string[];
  failed: FileActionError[];
  skipped?: string[];
}

export type ConflictPolicy = "rename" | "overwrite" | "skip";

export interface FilePreviewData {
  path: string;
  name: string;
  size: number;
  modifiedMs: number;
  previewKind: "image" | "text" | "video" | "audio" | "hex" | "directory";
  mimeType: string;
  textContent?: string | null;
  dataUrl?: string | null;
  hexDump?: string | null;
  encoding?: string | null;
  truncated: boolean;
}

export type LayoutMode =
  | "4-grid"
  | "4-columns"
  | "4-rows"
  | "3-top1-bottom2"
  | "3-top2-bottom1"
  | "3-left1-right2"
  | "3-left2-right1"
  | "2-vertical"
  | "2-horizontal"
  | "1-single";

export type ViewMode = "details" | "large-icons" | "small-icons" | "list" | "tiles";

export type SortField = "name" | "size" | "extension" | "modifiedMs" | "fileType";

export interface PaneTab {
  id: string;
  title: string;
  path: string;
  history: string[];
  historyIndex: number;
  locked?: boolean;
}

export interface PaneState {
  index: number; // 0..3 (Pane 1..4)
  tabs: PaneTab[];
  activeTabId: string;
  viewMode: ViewMode;
  sortField: SortField;
  sortAsc: boolean;
  showFilterBar: boolean;
  includeFilter: string;
  negativeFilter: string;
  showLocalTree: boolean;
  selectedPaths: string[];
  folderSizes: Record<string, number>;
}

export interface SavedQdrPreset {
  id: string;
  name: string;
  createdAt: string;
  layoutMode: LayoutMode;
  treeMode: number;
  sp0: number;
  sp1: number;
  sp2: number;
  spt: number;
  panePaths: [string, string, string, string];
  paneViewModes: [ViewMode, ViewMode, ViewMode, ViewMode];
}

export interface ClipboardState {
  mode: "copy" | "cut";
  paths: string[];
  sourcePaneIndex: number;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  downloadUrl: string;
  assetName: string;
  htmlUrl: string;
}

