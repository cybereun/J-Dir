import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  ClipboardFiles,
  ConflictPolicy,
  DriveInfo,
  FileActionReport,
  FileEntry,
  FilePreviewData,
  ParsedDocument,
  ZipListing,
  IndexFolder,
  IndexProgress,
  SearchRequestDto,
  SearchResponse,
  FolderSizeStats,
  JobProgressEvent,
  PathPair,
  QDirWorkspaceConfig,
  SearchQuery,
  SearchResult,
  SpecialPaths,
  UpdateCheckResult,
} from "../types/jdir";
import { DEFAULT_QDIR_COLOR_RULES } from "../utils/colorFilter";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function apiListDirectory(path: string, showHidden: boolean): Promise<FileEntry[]> {
  if (!isTauriRuntime()) {
    return [
      {
        name: "Favoriten",
        path: `${path}\\Favoriten`,
        isDir: true,
        isHidden: false,
        isSystem: false,
        isReadonly: false,
        size: 0,
        modifiedMs: Date.now() - 86400000,
        createdMs: Date.now() - 86400000,
        extension: "",
        fileType: "파일 폴더",
      },
      {
        name: "Q-Dir.exe",
        path: `${path}\\Q-Dir.exe`,
        isDir: false,
        isHidden: false,
        isSystem: false,
        isReadonly: false,
        size: 1725440,
        modifiedMs: Date.now() - 3600000,
        createdMs: Date.now() - 3600000,
        extension: "exe",
        fileType: "응용 프로그램",
      },
      {
        name: "Q-Dir.ini",
        path: `${path}\\Q-Dir.ini`,
        isDir: false,
        isHidden: false,
        isSystem: false,
        isReadonly: false,
        size: 41586,
        modifiedMs: Date.now() - 1800000,
        createdMs: Date.now() - 1800000,
        extension: "ini",
        fileType: "설정 파일",
      },
      {
        name: "start.qdr",
        path: `${path}\\start.qdr`,
        isDir: false,
        isHidden: false,
        isSystem: false,
        isReadonly: false,
        size: 16436,
        modifiedMs: Date.now() - 900000,
        createdMs: Date.now() - 900000,
        extension: "qdr",
        fileType: "설정 파일",
      },
    ];
  }
  return invoke<FileEntry[]>("cmd_list_directory", { path, showHidden });
}

export async function apiListSubdirectories(
  path: string,
  showHidden: boolean
): Promise<FileEntry[]> {
  if (!isTauriRuntime()) {
    const items = await apiListDirectory(path, showHidden);
    return items.filter((i) => i.isDir);
  }
  return invoke<FileEntry[]>("cmd_list_subdirectories", { path, showHidden });
}

export async function apiListDrives(): Promise<DriveInfo[]> {
  if (!isTauriRuntime()) {
    return [
      {
        letter: "C:",
        rootPath: "C:\\",
        label: "Windows",
        driveType: "로컬 디스크",
        totalBytes: 512 * 1024 * 1024 * 1024,
        freeBytes: 180 * 1024 * 1024 * 1024,
      },
      {
        letter: "E:",
        rootPath: "E:\\",
        label: "UTIL_DATA",
        driveType: "로컬 디스크",
        totalBytes: 1024 * 1024 * 1024 * 1024,
        freeBytes: 640 * 1024 * 1024 * 1024,
      },
      {
        letter: "Y:",
        rootPath: "Y:\\",
        label: "Google Drive",
        driveType: "네트워크 드라이브",
        totalBytes: 2048 * 1024 * 1024 * 1024,
        freeBytes: 1200 * 1024 * 1024 * 1024,
      },
    ];
  }
  return invoke<DriveInfo[]>("cmd_list_drives");
}

export async function apiGetSpecialPaths(): Promise<SpecialPaths> {
  if (!isTauriRuntime()) {
    return {
      desktop: "C:\\Users\\cybereun\\Desktop",
      documents: "C:\\Users\\cybereun\\Documents",
      downloads: "C:\\Users\\cybereun\\Downloads",
      appdata: "C:\\Users\\cybereun\\AppData\\Roaming",
      windir: "C:\\Windows",
      sysdir: "C:\\Windows\\System32",
      userProfile: "C:\\Users\\cybereun",
      currentDir: "Y:\\내 드라이브\\AI\\App_Bulid\\J-Dir",
    };
  }
  return invoke<SpecialPaths>("cmd_get_special_paths");
}

export async function apiCalculateFolderSize(
  path: string,
  jobId: string
): Promise<FolderSizeStats> {
  if (!isTauriRuntime()) {
    return { path, totalBytes: 1024 * 1024 * 12, fileCount: 42, dirCount: 5 };
  }
  return invoke<FolderSizeStats>("cmd_calculate_folder_size", { path, jobId });
}

export async function apiCancelJob(jobId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_cancel_job", { jobId });
}

export async function apiJobDone(jobId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_job_done", { jobId });
}

/** Subscribes to progress events of long-running jobs. Resolves to an unsubscribe function. */
export async function onJobProgress(cb: (ev: JobProgressEvent) => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  return listen<JobProgressEvent>("jdir://progress", (e) => cb(e.payload));
}

/** Subscribes to file-system change notifications (path of the changed folder / item). */
export async function onFsChanged(cb: (path: string) => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  return listen<string>("jdir://fs-changed", (e) => cb(e.payload));
}

export async function apiWatchDirs(paths: string[]): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_watch_dirs", { paths });
}

export async function apiRestoreMoves(pairs: PathPair[]): Promise<FileActionReport> {
  return invoke<FileActionReport>("cmd_restore_moves", { pairs });
}

export async function apiSetAttributes(
  paths: string[],
  readonly?: boolean,
  hidden?: boolean
): Promise<FileActionReport> {
  return invoke<FileActionReport>("cmd_set_attributes", { paths, readonly, hidden });
}

export async function apiSearchFiles(
  root: string,
  query: SearchQuery,
  jobId: string
): Promise<SearchResult> {
  return invoke<SearchResult>("cmd_search_files", { root, query, jobId });
}

export async function apiZipItems(
  sources: string[],
  destZip: string,
  jobId: string
): Promise<string> {
  return invoke<string>("cmd_zip_items", { sources, destZip, jobId });
}

export async function apiUnzip(
  zipPath: string,
  destDir: string,
  jobId: string
): Promise<string> {
  return invoke<string>("cmd_unzip", { zipPath, destDir, jobId });
}

export async function apiClipboardSetFiles(paths: string[], cut: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_clipboard_set_files", { paths, cut });
}

export async function apiClipboardGetFiles(): Promise<ClipboardFiles | null> {
  if (!isTauriRuntime()) return null;
  return invoke<ClipboardFiles | null>("cmd_clipboard_get_files");
}

export async function apiClipboardClear(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_clipboard_clear");
}

export async function apiCheckConflicts(
  sources: string[],
  destinationDir: string
): Promise<string[]> {
  return invoke<string[]>("cmd_check_conflicts", { sources, destinationDir });
}

export async function apiCopyItems(
  sources: string[],
  destinationDir: string,
  policy: ConflictPolicy,
  jobId: string
): Promise<FileActionReport> {
  return invoke<FileActionReport>("cmd_copy_items", {
    sources,
    destinationDir,
    policy,
    jobId,
  });
}

export async function apiMoveItems(
  sources: string[],
  destinationDir: string,
  policy: ConflictPolicy,
  jobId: string
): Promise<FileActionReport> {
  return invoke<FileActionReport>("cmd_move_items", {
    sources,
    destinationDir,
    policy,
    jobId,
  });
}

export async function apiDeleteItems(
  paths: string[],
  permanent = false
): Promise<FileActionReport> {
  return invoke<FileActionReport>("cmd_delete_items", { paths, permanent });
}

export async function apiRenameItem(path: string, newName: string): Promise<string> {
  return invoke<string>("cmd_rename_item", { path, newName });
}

export async function apiCreateDirectory(parentDir: string, name: string): Promise<string> {
  return invoke<string>("cmd_create_directory", { parentDir, name });
}

export async function apiCreateTextFile(
  parentDir: string,
  name: string,
  content = ""
): Promise<string> {
  return invoke<string>("cmd_create_text_file", { parentDir, name, content });
}

export async function apiOpenItem(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_open_item", { path });
}

export async function apiOpenInExplorer(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_open_in_explorer", { path });
}

export async function apiOpenInTerminal(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_open_in_terminal", { path });
}

export async function apiExportFileList(
  entries: FileEntry[],
  outputPath: string,
  format: "csv" | "txt"
): Promise<string> {
  return invoke<string>("cmd_export_file_list", { entries, outputPath, format });
}

export async function apiImportQDirConfig(
  qdirDirPath?: string
): Promise<QDirWorkspaceConfig> {
  if (!isTauriRuntime()) {
    return {
      sourceDir: "E:\\UTIL\\4.시스템\\Q-Dir_Portable_x64\\Q-Dir",
      layoutMode: 5,
      useColorStart: true,
      designMode: 1,
      treeMode: 1,
      sp0: 5000,
      sp1: 5000,
      sp2: 5000,
      spt: 1617,
      tree1: 0,
      tree2: 0,
      tree3: 0,
      tree4: 0,
      tree1Split: 2500,
      tree2Split: 2500,
      tree3Split: 2500,
      tree4Split: 2500,
      previewEnabled: false,
      previewPos: 7500,
      previewFilter: "*.avi;*.bmp;*.gif;*.ico;*.jpeg;*.jpg;*.mp*;*.pdf;*.png;*.wm*;",
      activeFocus: 3,
      panePaths: [
        "Y:\\내 드라이브\\AI\\App_Bulid",
        "E:\\UTIL\\4.시스템\\Q-Dir_Portable_x64\\Q-Dir",
        "C:\\Users\\cybereun\\Desktop",
        "C:\\Users\\cybereun\\Downloads",
      ],
      paneViewModes: [4, 4, 4, 4],
      showFilterPane3: true,
      colorRules: DEFAULT_QDIR_COLOR_RULES,
      quickLinks: [
        {
          name: "작업폴더",
          targetPath: "Y:\\내 드라이브\\AI\\App_Bulid",
          category: "Quick-Link",
        },
        {
          name: "유틸리티",
          targetPath: "E:\\UTIL",
          category: "Quick-Link",
        },
      ],
    };
  }
  return invoke<QDirWorkspaceConfig>("cmd_import_qdir_config", {
    qdirDirPath: qdirDirPath ?? null,
  });
}

export async function apiReadFilePreview(
  path: string,
  maxBytes = 65536
): Promise<FilePreviewData> {
  if (!isTauriRuntime()) {
    return {
      path,
      name: path.split("\\").pop() || path,
      size: 1024,
      modifiedMs: Date.now(),
      previewKind: "text",
      mimeType: "text/plain",
      textContent: "[Start]\nm_lang_id=1\nuseColorStart=1\nAls=5\n",
      encoding: "UTF-8",
      truncated: false,
    };
  }
  return invoke<FilePreviewData>("cmd_read_file_preview", { path, maxBytes });
}

const ZIP_URI = "zip://";

/** Virtual path for one entry inside a zip: `zip://<index>/<zip path>`. */
export function zipEntryUri(zipPath: string, index: number): string {
  return `${ZIP_URI}${index}/${zipPath}`;
}

function parseZipUri(path: string): { zipPath: string; index: number } | null {
  if (!path.startsWith(ZIP_URI)) return null;
  const rest = path.slice(ZIP_URI.length);
  const slash = rest.indexOf("/");
  const index = Number(rest.slice(0, slash));
  if (slash < 0 || !Number.isInteger(index)) return null;
  return { zipPath: rest.slice(slash + 1), index };
}

export async function apiReadFileBytes(path: string, maxBytes?: number): Promise<Uint8Array> {
  const zip = parseZipUri(path);
  const buf = zip
    ? await invoke<ArrayBuffer>("cmd_zip_read_entry", { path: zip.zipPath, index: zip.index })
    : await invoke<ArrayBuffer>("cmd_read_file_bytes", { path, maxBytes: maxBytes ?? null });
  return new Uint8Array(buf);
}

/** Asks the main window to show `path` (navigate the active pane to its folder and select it). */
export async function apiRevealInPane(path: string): Promise<void> {
  await emit("jdir://reveal-file", { path });
}

export async function apiFocusMainWindow(): Promise<void> {
  await invoke("cmd_focus_main_window");
}

export async function apiIndexFolders(): Promise<IndexFolder[]> {
  return invoke<IndexFolder[]>("cmd_index_folders");
}

export async function apiIndexAddFolder(path: string): Promise<number> {
  return invoke<number>("cmd_index_add_folder", { path });
}

export async function apiIndexRemoveFolder(id: number): Promise<void> {
  return invoke<void>("cmd_index_remove_folder", { id });
}

export async function apiIndexStart(folderId: number | null): Promise<void> {
  return invoke<void>("cmd_index_start", { folderId });
}

export async function apiIndexCancel(): Promise<void> {
  return invoke<void>("cmd_index_cancel");
}

export async function apiIndexProgress(): Promise<IndexProgress> {
  return invoke<IndexProgress>("cmd_index_progress");
}

export async function apiIndexSearch(request: SearchRequestDto): Promise<SearchResponse> {
  return invoke<SearchResponse>("cmd_index_search", { request });
}

export function onIndexProgress(handler: (p: IndexProgress) => void): Promise<() => void> {
  return listen<IndexProgress>("jdir://index-progress", (ev) => handler(ev.payload));
}

export async function apiZipList(path: string): Promise<ZipListing> {
  return invoke<ZipListing>("cmd_zip_list", { path });
}

export async function apiZipExtract(path: string, destDir: string, indices: number[] | null): Promise<string> {
  return invoke<string>("cmd_zip_extract", { path, destDir, indices });
}

/** URL the WebView can stream (Range requests) for audio/video; only this one file is made readable. */
export async function apiStreamUrl(path: string): Promise<string> {
  await invoke("cmd_allow_preview_stream", { path });
  return convertFileSrc(path);
}

export async function apiParseDocument(path: string): Promise<ParsedDocument> {
  const zip = parseZipUri(path);
  if (zip) return invoke<ParsedDocument>("cmd_zip_parse_entry", { path: zip.zipPath, index: zip.index });
  return invoke<ParsedDocument>("cmd_parse_document", { path });
}

export async function apiOpenPreviewWindow(rect?: { x: number; y: number; w: number; h: number } | null): Promise<void> {
  await invoke("cmd_open_preview_window", {
    x: rect?.x ?? null,
    y: rect?.y ?? null,
    width: rect?.w ?? null,
    height: rect?.h ?? null,
  });
}

export async function apiClosePreviewWindow(): Promise<void> {
  await invoke("cmd_close_preview_window");
}

export async function apiCheckForUpdates(): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) {
    return {
      updateAvailable: false,
      currentVersion: "1.1.4",
      latestVersion: "1.1.4",
      releaseName: "J-Dir v1.1.4",
      releaseNotes: "최신 버전을 사용 중입니다.",
      publishedAt: new Date().toISOString(),
      downloadUrl: "",
      assetName: "",
      htmlUrl: "https://github.com/cybereun/J-Dir/releases",
    };
  }
  return invoke<UpdateCheckResult>("cmd_check_for_updates");
}

export async function apiInstallUpdateAndRestart(
  downloadUrl: string,
  assetName: string
): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_install_update_and_restart", {
    downloadUrl,
    assetName,
  });
}
