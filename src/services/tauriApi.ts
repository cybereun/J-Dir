import { invoke } from "@tauri-apps/api/core";
import {
  DriveInfo,
  FileActionReport,
  FileEntry,
  FilePreviewData,
  FolderSizeStats,
  QDirWorkspaceConfig,
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

export async function apiCalculateFolderSize(path: string): Promise<FolderSizeStats> {
  if (!isTauriRuntime()) {
    return { path, totalBytes: 1024 * 1024 * 12, fileCount: 42, dirCount: 5 };
  }
  return invoke<FolderSizeStats>("cmd_calculate_folder_size", { path });
}

export async function apiCopyItems(
  sources: string[],
  destinationDir: string,
  overwrite = false
): Promise<FileActionReport> {
  return invoke<FileActionReport>("cmd_copy_items", {
    sources,
    destinationDir,
    overwrite,
  });
}

export async function apiMoveItems(
  sources: string[],
  destinationDir: string,
  overwrite = false
): Promise<FileActionReport> {
  return invoke<FileActionReport>("cmd_move_items", {
    sources,
    destinationDir,
    overwrite,
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

export async function apiCheckForUpdates(): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) {
    return {
      updateAvailable: false,
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      releaseTitle: "J-Dir v1.0.0",
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
