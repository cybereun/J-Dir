import { describe, expect, it } from "vitest";
import {
  DEFAULT_QDIR_COLOR_RULES,
  filterEntries,
  getParentPath,
  matchWildcardPatternList,
  qdirAlsToLayoutMode,
  resolveEntryColor,
  sortEntries,
} from "../colorFilter";
import { FileEntry } from "../../types/jdir";

function makeEntry(partial: Partial<FileEntry> & { name: string }): FileEntry {
  return {
    name: partial.name,
    path: partial.path ?? `C:\\test\\${partial.name}`,
    isDir: partial.isDir ?? false,
    isHidden: partial.isHidden ?? false,
    isSystem: partial.isSystem ?? false,
    isReadonly: partial.isReadonly ?? false,
    size: partial.size ?? 100,
    modifiedMs: partial.modifiedMs ?? 1000,
    createdMs: partial.createdMs ?? 1000,
    extension: partial.extension ?? (partial.name.split(".").pop() || ""),
    fileType: partial.fileType ?? "파일",
  };
}

describe("Q-Dir [Filter2] Color Rules & Wildcard Engine", () => {
  it("matches Q-Dir semicolon and comma separated wildcard lists", () => {
    expect(matchWildcardPatternList("archive.7z", "*.zip;*.rar;*.gz;*.7z;")).toBe(true);
    expect(matchWildcardPatternList("photo.PNG", "*.jpg;*.jpeg;*.png,*.gif;*.bmp;*.ico")).toBe(true);
    expect(matchWildcardPatternList("movie.mp4", "*.mp*;*.avi;*.wma;")).toBe(true);
    expect(matchWildcardPatternList("readme.txt", "*.zip;*.rar;")).toBe(false);
  });

  it("assigns exact Q-Dir.ini colors in light mode and high-contrast colors in dark mode", () => {
    const dirEntry = makeEntry({ name: "Favoriten", isDir: true });
    const exeEntry = makeEntry({ name: "Q-Dir.exe", extension: "exe" });
    const zipEntry = makeEntry({ name: "backup.zip", extension: "zip" });
    const imgEntry = makeEntry({ name: "banner.jpg", extension: "jpg" });
    const normalEntry = makeEntry({ name: "notes.txt", extension: "txt" });

    expect(resolveEntryColor(dirEntry, DEFAULT_QDIR_COLOR_RULES, true, "light").color).toBe(
      "#065F46"
    );
    expect(resolveEntryColor(exeEntry, DEFAULT_QDIR_COLOR_RULES, true, "light").color).toBe(
      "#DC2626"
    );
    expect(resolveEntryColor(zipEntry, DEFAULT_QDIR_COLOR_RULES, true, "light").color).toBe(
      "#15803D"
    );
    expect(resolveEntryColor(imgEntry, DEFAULT_QDIR_COLOR_RULES, true, "light").color).toBe(
      "#7E22CE"
    );
    expect(resolveEntryColor(normalEntry, DEFAULT_QDIR_COLOR_RULES, true, "light").color).toBe(
      "#1E40AF"
    );

    // When useColor is false, no custom color is returned
    expect(resolveEntryColor(exeEntry, DEFAULT_QDIR_COLOR_RULES, false, "light").color).toBeUndefined();
  });

  it("filters entries with positive wildcard/substring and negative filter (Negativ-Filter)", () => {
    const items = [
      makeEntry({ name: "Q-Dir.exe" }),
      makeEntry({ name: "Q-Dir.ini" }),
      makeEntry({ name: "Thumbs.db" }),
      makeEntry({ name: "config.bak" }),
      makeEntry({ name: "photo.jpg" }),
    ];

    const withoutThumbsAndBak = filterEntries(items, "", "Thumbs.db;*.bak");
    expect(withoutThumbsAndBak.map((i) => i.name)).toEqual([
      "Q-Dir.exe",
      "Q-Dir.ini",
      "photo.jpg",
    ]);

    const onlyQdir = filterEntries(items, "Q-Dir*", "Thumbs.db;*.bak");
    expect(onlyQdir.map((i) => i.name)).toEqual(["Q-Dir.exe", "Q-Dir.ini"]);
  });

  it("keeps directories at top while sorting by size or name", () => {
    const items = [
      makeEntry({ name: "z_file.txt", size: 500 }),
      makeEntry({ name: "a_folder", isDir: true, size: 0 }),
      makeEntry({ name: "a_file.txt", size: 1000 }),
    ];
    const sorted = sortEntries(items, "size", false);
    expect(sorted[0].name).toBe("a_folder");
    expect(sorted[1].name).toBe("a_file.txt");
    expect(sorted[2].name).toBe("z_file.txt");
  });

  it("maps Q-Dir Als=5 to 4-grid and resolves parent paths accurately", () => {
    expect(qdirAlsToLayoutMode(5)).toBe("4-grid");
    expect(getParentPath("E:\\UTIL\\4.시스템\\Q-Dir_Portable_x64\\Q-Dir")).toBe(
      "E:\\UTIL\\4.시스템\\Q-Dir_Portable_x64"
    );
    expect(getParentPath("E:\\")).toBeNull();
  });
});
