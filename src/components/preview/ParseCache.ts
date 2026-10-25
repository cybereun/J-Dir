import { ParsedDocument } from "../../types/jdir";
import { apiParseDocument } from "../../services/tauriApi";

const MAX_ENTRIES = 24;
const cache = new Map<string, Promise<ParsedDocument>>();

/** Parses a document once per (path, mtime); failed parses are not cached. */
export function parseDocumentCached(path: string, modifiedMs: number): Promise<ParsedDocument> {
  const key = `${path}|${modifiedMs}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const pending = apiParseDocument(path).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return pending;
}

export function describeParseError(err: unknown): string {
  const text = String(err instanceof Error ? err.message : err);
  if (text.includes("ENCRYPTED")) return "암호화되었거나 보호된 문서라 내용을 읽을 수 없습니다.";
  if (text.includes("DAMAGED")) return "손상된 문서이거나 읽을 수 없는 구조입니다.";
  if (text.includes("UNSUPPORTED")) return "지원하지 않는 문서 형식입니다.";
  if (text.includes("TOO_LARGE")) return "문서가 너무 커서 분석할 수 없습니다.";
  if (text.includes("IMAGE_BASED_PDF")) return "이미지로만 구성된 PDF라 추출할 텍스트가 없습니다.";
  if (text.includes("TIMEOUT")) return "문서 분석 시간이 초과되었습니다.";
  if (text.includes("PARSER_MISSING")) return "문서 파서를 찾을 수 없습니다. 앱을 재설치해 주세요.";
  return text.replace(/^[A-Z_]+:\s*/, "") || "문서를 분석하지 못했습니다.";
}
