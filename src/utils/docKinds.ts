const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  apng: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  jfif: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** Formats that have an original-layout renderer (and a parsed-text view). */
const LAYOUT_DOCS = new Set(["pdf", "hwp", "hwpx"]);

/** Formats shown as parsed text / tables only. */
const TEXT_DOCS = new Set([
  "doc", "docx", "xls", "xlsx", "xlsm", "ppt", "pptx", "odt", "ods", "odp", "rtf", "hwpml",
]);

export type PreviewFileKind = "image" | "layout-doc" | "text-doc" | "other";

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function imageMime(ext: string): string | undefined {
  return IMAGE_MIME[ext];
}

export function previewKindOf(name: string): PreviewFileKind {
  const ext = fileExt(name);
  if (IMAGE_MIME[ext]) return "image";
  if (LAYOUT_DOCS.has(ext)) return "layout-doc";
  if (TEXT_DOCS.has(ext)) return "text-doc";
  return "other";
}
