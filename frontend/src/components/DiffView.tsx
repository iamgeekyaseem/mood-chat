import { useEffect, useMemo, useState } from "react";
import { pathToRoot, type ChildMap, type NodeMap } from "../tree";

interface Props {
  nodes: NodeMap;
  children: ChildMap;
  isDark: boolean;
  /** Node to preselect on the left, if any (e.g. the focused thread tip). */
  initialLeft?: string | null;
  onClose: () => void;
}

type Row =
  | { kind: "same"; left: string; right: string }
  | { kind: "del"; left: string }
  | { kind: "add"; right: string };

/**
 * A classic LCS line diff. Two branches are just two root→tip paths, and the
 * thing worth comparing is where their answers diverge — so we diff the
 * rendered transcripts line by line and colour the gaps.
 */
function diffLines(a: string[], b: string[]): Row[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", left: a[i], right: b[j] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ kind: "del", left: a[i] });
      i++;
    } else {
      rows.push({ kind: "add", right: b[j] });
      j++;
    }
  }
  while (i < n) rows.push({ kind: "del", left: a[i++] });
  while (j < m) rows.push({ kind: "add", right: b[j++] });
  return rows;
}

function transcript(nodes: NodeMap, id: string): string[] {
  const path = pathToRoot(nodes, id);
  const out: string[] = [];
  for (const n of path) {
    out.push(n.role === "user" ? "▸ You" : `▸ ${n.model ?? "Assistant"}`);
    for (const line of (n.content || "").split("\n")) out.push(line);
    out.push("");
  }
  return out;
}

export function DiffView({ nodes, children, isDark, initialLeft, onClose }: Props) {
  // Candidates worth diffing: branch roots and any leaf (thread tips).
  const candidates = useMemo(() => {
    const isLeaf = (id: string) => (children[id]?.length ?? 0) === 0;
    return Object.values(nodes)
      .filter((n) => n.anchor_text != null || isLeaf(n.id))
      .sort((a, b) => a.created_at - b.created_at)
      .map((n) => ({
        id: n.id,
        label:
          (n.anchor_text ? `⑂ ${n.anchor_text} · ` : "") +
          (n.content.replace(/\s+/g, " ").slice(0, 42) || "(empty)"),
      }));
  }, [nodes, children]);

  const [left, setLeft] = useState<string>(
    initialLeft && nodes[initialLeft] ? initialLeft : candidates[0]?.id ?? "",
  );
  const [right, setRight] = useState<string>(
    candidates[1]?.id ?? candidates[0]?.id ?? "",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    if (!left || !right || !nodes[left] || !nodes[right]) return [];
    return diffLines(transcript(nodes, left), transcript(nodes, right));
  }, [left, right, nodes]);

  const addBg = isDark ? "rgba(0,131,0,0.22)" : "rgba(0,131,0,0.12)";
  const delBg = isDark ? "rgba(213,81,129,0.20)" : "rgba(232,123,164,0.14)";

  const Picker = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] outline-none focus:border-ink"
    >
      {candidates.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Diff two branches"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[80vh] w-full max-w-[980px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-medium">Diff two branches</h2>
          <button
            onClick={onClose}
            aria-label="Close diff"
            className="ml-auto text-[13px] text-faint hover:text-text"
          >
            ✕
          </button>
        </header>

        {candidates.length < 2 ? (
          <p className="p-8 text-center text-[13px] text-faint">
            Need at least two branches or thread tips to compare.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 border-b border-border px-5 py-3">
              <Picker value={left} onChange={setLeft} />
              <Picker value={right} onChange={setRight} />
            </div>

            <div className="scroll-y flex-1 px-3 py-2 font-mono text-[12px] leading-relaxed">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                  <div
                    className="whitespace-pre-wrap px-2"
                    style={{
                      background: r.kind === "del" ? delBg : undefined,
                      color: r.kind === "add" ? "var(--color-faint)" : undefined,
                    }}
                  >
                    {r.kind === "add" ? "" : (r as { left: string }).left}
                  </div>
                  <div
                    className="whitespace-pre-wrap px-2"
                    style={{
                      background: r.kind === "add" ? addBg : undefined,
                      color: r.kind === "del" ? "var(--color-faint)" : undefined,
                    }}
                  >
                    {r.kind === "del" ? "" : (r as { right: string }).right}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
