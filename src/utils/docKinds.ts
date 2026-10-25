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

/** Audio formats; the first group plays in WebView2, the rest is attempted and reported if unsupported. */
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg; codecs=opus",
  flac: "audio/flac",
  weba: "audio/webm",
  wma: "audio/x-ms-wma",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  mid: "audio/midi",
  midi: "audio/midi",
};

/** Video containers; mp4(H.264)/webm usually play in WebView2, the rest is attempted. */
const VIDEO_EXTS = new Set(["mp4", "m4v", "webm", "mov", "mkv", "avi", "wmv", "ogv"]);

/** Formats that have an original-layout renderer (and a parsed-text view). */
const LAYOUT_DOCS = new Set(["pdf", "hwp", "hwpx"]);

/** Formats shown as parsed text / tables only. */
const TEXT_DOCS = new Set([
  "doc", "docx", "xls", "xlsx", "xlsm", "ppt", "pptx", "odt", "ods", "odp", "rtf", "hwpml",
]);

export type PreviewFileKind = "image" | "audio" | "video" | "layout-doc" | "text-doc" | "other";

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function imageMime(ext: string): string | undefined {
  return IMAGE_MIME[ext];
}

export function audioMime(ext: string): string | undefined {
  return AUDIO_MIME[ext];
}

export function previewKindOf(name: string): PreviewFileKind {
  const ext = fileExt(name);
  if (IMAGE_MIME[ext]) return "image";
  if (AUDIO_MIME[ext]) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (LAYOUT_DOCS.has(ext)) return "layout-doc";
  if (TEXT_DOCS.has(ext)) return "text-doc";
  return "other";
}
