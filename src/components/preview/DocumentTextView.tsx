import React, { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Search, X } from "lucide-react";
import { DocBlock, DocBlockTable, ParsedDocument } from "../../types/jdir";

function safeHref(href: string | null | undefined): string | null {
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

function blockTexts(block: DocBlock): string[] {
  const cells = block.table?.cells.flatMap((row) => row.map((c) => c.text)) ?? [];
  return [block.text ?? "", ...cells, ...(block.children?.flatMap(blockTexts) ?? [])].filter(Boolean);
}

function countOccurrences(text: string, query: string): number {
  if (!query) return 0;
  const source = text.toLowerCase();
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(query, offset)) !== -1) {
    count += 1;
    offset += Math.max(1, query.length);
  }
  return count;
}

/** Drops grid slots covered by a spanning cell so rowSpan/colSpan tables render correctly. */
function renderableRows(table: DocBlockTable) {
  const occupied = new Set<string>();
  return table.cells.map((row, r) =>
    row.flatMap((cell, c) => {
      if (occupied.has(`${r}:${c}`)) return [];
      const colSpan = Math.max(1, cell.colSpan || 1);
      const rowSpan = Math.max(1, cell.rowSpan || 1);
      for (let dr = 0; dr < rowSpan; dr += 1) {
        for (let dc = 0; dc < colSpan; dc += 1) {
          if (dr || dc) occupied.add(`${r + dr}:${c + dc}`);
        }
      }
      return [{ cell, c, colSpan, rowSpan }];
    }),
  );
}

export const DocumentTextView: React.FC<{ doc: ParsedDocument; highlight?: string }> = ({ doc, highlight }) => {
  const [findOpen, setFindOpen] = useState(Boolean(highlight));
  const [query, setQuery] = useState(highlight ?? "");
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const activeMark = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLElement>(null);

  const needle = query.toLowerCase();
  const total = useMemo(
    () => (needle ? doc.blocks.flatMap(blockTexts).reduce((n, t) => n + countOccurrences(t, needle), 0) : 0),
    [doc.blocks, needle],
  );

  useEffect(() => {
    if (highlight) {
      setQuery(highlight);
      setFindOpen(true);
    }
  }, [highlight, doc]);

  useEffect(() => setActive(0), [needle]);
  useEffect(() => {
    activeMark.current?.scrollIntoView?.({ block: "center" });
  }, [active, needle]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => input.current?.focus(), 0);
      } else if (e.key === "Escape" && findOpen) {
        setFindOpen(false);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [findOpen]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(doc.plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  const move = (dir: number) => {
    if (total) setActive((a) => (a + dir + total) % total);
  };

  let matchIndex = 0;
  const hl = (text: string): ReactNode => {
    if (!needle) return text;
    const source = text.toLowerCase();
    const out: ReactNode[] = [];
    let cursor = 0;
    let at = source.indexOf(needle);
    while (at !== -1) {
      if (at > cursor) out.push(text.slice(cursor, at));
      const current = matchIndex++;
      out.push(
        <mark
          key={`${at}-${current}`}
          className={current === active ? "is-active" : undefined}
          ref={(el) => {
            if (current === active) activeMark.current = el;
          }}
        >
          {text.slice(at, at + needle.length)}
        </mark>,
      );
      cursor = at + needle.length;
      at = source.indexOf(needle, cursor);
    }
    out.push(text.slice(cursor));
    return out;
  };

  const linked = (block: DocBlock): ReactNode => {
    const href = safeHref(block.href);
    const text = hl(block.text ?? "");
    return href ? (
      <a href={href} rel="noreferrer noopener" target="_blank">
        {text}
      </a>
    ) : (
      text
    );
  };

  const renderBlock = (block: DocBlock, key: string): ReactNode => {
    switch (block.type) {
      case "heading":
        return createElement(`h${Math.min(6, Math.max(1, block.level ?? 2))}`, { key }, linked(block));
      case "table": {
        const table = block.table;
        if (!table) return null;
        return (
          <div className="doc-table-scroll" key={key}>
            <table>
              <tbody>
                {renderableRows(table).map((row, r) => (
                  <tr key={r}>
                    {row.map(({ cell, c, colSpan, rowSpan }) => {
                      const Tag = table.hasHeader && r === 0 ? "th" : "td";
                      return (
                        <Tag key={c} colSpan={colSpan} rowSpan={rowSpan}>
                          {hl(cell.text)}
                        </Tag>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "list": {
        const List = block.listType === "ordered" ? "ol" : "ul";
        return (
          <List key={key}>
            <li>
              {linked(block)}
              {block.children?.map((child, i) => renderBlock(child, `${key}-${i}`))}
            </li>
          </List>
        );
      }
      case "separator":
        return <hr key={key} />;
      case "image":
        return (
          <p key={key} className="doc-image-note">
            [이미지] {linked(block)}
          </p>
        );
      default:
        return <p key={key}>{linked(block)}</p>;
    }
  };

  return (
    <section className="doc-text-view" ref={root} tabIndex={-1}>
      <div className="doc-text-toolbar">
        <button type="button" className="mini-ghost-btn" onClick={() => setFindOpen((v) => !v)} title="문서 내 찾기 (Ctrl+F)">
          <Search size={12} />
          <span>찾기</span>
        </button>
        <button type="button" className="mini-ghost-btn" onClick={() => void copyAll()} title="문서 텍스트 전체를 클립보드에 복사">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "복사됨" : "전체 복사"}</span>
        </button>
        <span className="doc-text-hint">본문은 드래그해서 선택·복사할 수 있습니다</span>
      </div>
      {findOpen && (
        <div className="doc-find">
          <input
            ref={input}
            value={query}
            placeholder="문서 내 찾기"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") move(e.shiftKey ? -1 : 1);
            }}
          />
          <span>{total ? `${active + 1} / ${total}` : "0 / 0"}</span>
          <button type="button" className="mini-ghost-btn" onClick={() => move(-1)} title="이전">
            <ChevronUp size={12} />
          </button>
          <button type="button" className="mini-ghost-btn" onClick={() => move(1)} title="다음">
            <ChevronDown size={12} />
          </button>
          <button type="button" className="mini-ghost-btn" onClick={() => setFindOpen(false)} title="닫기">
            <X size={12} />
          </button>
        </div>
      )}
      <div className="doc-blocks">
        {doc.blocks.length === 0 ? (
          <p className="doc-empty">추출된 텍스트가 없습니다.</p>
        ) : (
          doc.blocks.map((block, i) => renderBlock(block, String(i)))
        )}
      </div>
    </section>
  );
};
