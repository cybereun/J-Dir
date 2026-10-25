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
  cancelled?: boolean;
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

export interface PathPair {
  from: string;
  to: string;
}

export interface FileActionReport {
  succeeded: string[];
  failed: FileActionError[];
  skipped?: string[];
  pairs?: PathPair[];
  cancelled?: boolean;
}

export interface JobProgressEvent {
  jobId: string;
  doneBytes: number;
  totalBytes: number;
  doneItems: number;
  totalItems: number;
  current: string;
}

export interface JobState {
  id: string;
  label: string;
  doneBytes: number;
  totalBytes: number;
  doneItems: number;
  totalItems: number;
  current: string;
  cancelling: boolean;
}

export interface SearchQuery {
  pattern: string;
  includeDirs: boolean;
  includeHidden: boolean;
  minSize?: number;
  maxSize?: number;
  modifiedAfterMs?: number;
  modifiedBeforeMs?: number;
}

export interface SearchResult {
  entries: FileEntry[];
  truncated: boolean;
  cancelled: boolean;
  scanned: number;
}

export interface ClipboardFiles {
  paths: string[];
  cut: boolean;
}

/** Reversible operation recorded for Ctrl+Z */
export type UndoOp =
  | { label: string; kind: "move-back"; pairs: PathPair[] }
  | { label: string; kind: "trash"; paths: string[] };

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


export interface DocBlockCell {
  text: string;
  colSpan: number;
  rowSpan: number;
}

export interface DocBlockTable {
  rows: number;
  cols: number;
  hasHeader?: boolean;
  cells: DocBlockCell[][];
}

export interface DocBlock {
  type: "paragraph" | "table" | "heading" | "list" | "image" | "separator";
  text?: string;
  level?: number | null;
  pageNumber?: number | null;
  href?: string | null;
  listType?: "ordered" | "unordered" | null;
  children?: DocBlock[];
  table?: DocBlockTable | null;
}

export interface ParsedDocument {
  title: string | null;
  plainText: string;
  blocks: DocBlock[];
  warnings: { code: string; message: string; page?: number }[];
}

export interface ZipEntryInfo {
  index: number;
  name: string;
  isDir: boolean;
  size: number;
  compressed: number;
  modified: string | null;
  encrypted: boolean;
}

export interface ZipListing {
  entries: ZipEntryInfo[];
  totalEntries: number;
  totalFiles: number;
  totalSize: number;
  totalCompressed: number;
  truncated: boolean;
}

export interface IndexFolder {
  id: number;
  path: string;
  docCount: number;
  errorCount: number;
  lastIndexedMs: number | null;
}

export interface IndexProgress {
  running: boolean;
  phase: string;
  folderPath: string;
  total: number;
  done: number;
  errors: number;
  current: string;
  cancelled: boolean;
  finished: boolean;
  message: string;
}

export interface SearchRequestDto {
  text: string;
  mode: "keyword" | "filename";
  exts: string[];
  folderId: number | null;
  limit?: number;
  offset?: number;
}

export interface SearchHit {
  id: number;
  folderId: number;
  path: string;
  name: string;
  ext: string;
  size: number;
  mtimeMs: number;
  status: string;
  snippet: string;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  elapsedMs: number;
  tokens: string[];
}
