import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../bridge";
import type { SearchResult } from "../types";

interface Props {
  currentTreeId: string | null;
  onOpen: (treeId: string, nodeId: string) => void;
  onClose: () => void;
}

type Scope = "all" | "current";

/**
 * Command-K search across every message. Full-text on the backend (SQLite
 * FTS5); this is the navigator — type, arrow through hits, Enter to jump. A hit
 * in another conversation opens that conversation first.
 */
export function SearchPalette({ currentTreeId, onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Debounced query — FTS is fast, but not per-keystroke fast.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const hits = await api.search(q, scope);
        if (!cancelled) {
          setResults(hits);
          setActive(0);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, scope]);

  // Keep the active row in view as you arrow through.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      const r = results[active];
      onOpen(r.tree_id, r.node_id);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search messages"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="flex max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="text-[14px] text-faint">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <div className="flex shrink-0 rounded-md border border-border p-0.5 text-[11px]">
            {(["all", "current"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                disabled={s === "current" && !currentTreeId}
                className={`rounded px-2 py-0.5 ${
                  scope === s ? "bg-ink text-on-ink" : "text-muted hover:text-text"
                } disabled:opacity-40`}
              >
                {s === "all" ? "all" : "this chat"}
              </button>
            ))}
          </div>
        </div>

        <ul ref={listRef} className="scroll-y flex-1">
          {query.trim() === "" ? (
            <li className="px-4 py-6 text-center text-[13px] text-faint">
              Type to search every message.
            </li>
          ) : searching && results.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-faint">
              Searching…
            </li>
          ) : results.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-faint">
              No matches.
            </li>
          ) : (
            results.map((r, i) => (
              <li key={`${r.node_id}-${i}`} data-idx={i}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onOpen(r.tree_id, r.node_id)}
                  className={`block w-full border-l-2 px-4 py-2.5 text-left ${
                    i === active
                      ? "border-ink bg-sunken"
                      : "border-transparent hover:bg-sunken/60"
                  }`}
                >
                  <div className="mb-0.5 flex items-center gap-2 text-[11px] text-faint">
                    <span className="truncate">{r.tree_title}</span>
                    <span>·</span>
                    <span>{r.role === "user" ? "you" : "reply"}</span>
                    {r.anchor_text && (
                      <span className="truncate">· ⑂ {r.anchor_text}</span>
                    )}
                  </div>
                  <Snippet snippet={r.snippet} />
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-faint">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
          {results.length > 0 && (
            <span className="ml-auto">
              {results.length} match{results.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Render the backend's \x02…\x03 highlight markers as emphasis. The snippet is
 * plain text placed into React text nodes (never HTML), so a match term can't
 * inject markup — the markers only tell us where to wrap.
 */
function Snippet({ snippet }: { snippet: string }) {
  const parts = useMemo(() => {
    const out: { text: string; hit: boolean }[] = [];
    let rest = snippet;
    for (;;) {
      const open = rest.indexOf("\x02");
      if (open === -1) {
        if (rest) out.push({ text: rest, hit: false });
        break;
      }
      if (open > 0) out.push({ text: rest.slice(0, open), hit: false });
      const close = rest.indexOf("\x03", open + 1);
      if (close === -1) {
        out.push({ text: rest.slice(open + 1), hit: true });
        break;
      }
      out.push({ text: rest.slice(open + 1, close), hit: true });
      rest = rest.slice(close + 1);
    }
    return out;
  }, [snippet]);

  return (
    <div className="line-clamp-2 text-[13px] text-text">
      {parts.map((p, i) =>
        p.hit ? (
          <mark
            key={i}
            className="rounded-sm bg-transparent font-semibold text-text underline decoration-2"
            style={{ textDecorationColor: "var(--color-star)" }}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i} className="text-muted">
            {p.text}
          </span>
        ),
      )}
    </div>
  );
}
