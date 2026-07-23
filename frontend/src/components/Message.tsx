import { useRef, useState } from "react";
import type { ResolvedColor } from "../colors";
import type { Node } from "../types";
import { Markdown } from "./Markdown";

interface Props {
  node: Node;
  color: ResolvedColor | null;
  streaming?: boolean;
  branchCount?: number;
  onBranch: (anchorText: string, anchorNodeId: string) => void;
  onClipExcerpt: (nodeId: string, markdown: string) => void;
  onClipWhole: (nodeId: string) => void;
  onToggleStar: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onPrune?: (id: string) => void;
}

interface Popover {
  x: number;
  y: number;
  text: string;
}

export function Message({
  node,
  color,
  streaming,
  branchCount = 0,
  onBranch,
  onClipExcerpt,
  onClipWhole,
  onToggleStar,
  onRegenerate,
  onPrune,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const isUser = node.role === "user";

  function handleSelection() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";

    // Ignore empty selections and anything ranging outside this message — a
    // selection spanning two messages has no single anchor.
    if (!text || !sel || !ref.current?.contains(sel.anchorNode)) {
      setPopover(null);
      return;
    }

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const host = ref.current.getBoundingClientRect();
    setPopover({
      x: rect.left - host.left + rect.width / 2,
      y: rect.top - host.top - 8,
      text,
    });
  }

  const dismiss = () => {
    setPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  const cached = node.usage.cache_read_input_tokens > 0;

  return (
    <div ref={ref} onMouseUp={handleSelection} className="group relative">
      <div className="mb-1.5 flex items-center gap-2">
        {/* Colour never carries identity alone — the label always shows. */}
        {color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color.fg }}
            aria-hidden
          />
        )}

        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
          {isUser ? "You" : (node.model ?? "Assistant")}
        </span>

        {node.anchor_text && (
          <span
            className="rounded-sm px-1.5 py-px text-[11px]"
            style={{
              background: color?.soft,
              color: color?.fg ?? "var(--color-muted)",
            }}
          >
            ⑂ {node.anchor_text}
          </span>
        )}

        {cached && (
          <span
            className="text-[11px] text-muted"
            title={`${node.usage.cache_read_input_tokens.toLocaleString()} tokens read from cache at ~0.1x`}
          >
            cached
          </span>
        )}

        {node.stopped && !streaming && (
          <span
            className="rounded-sm px-1.5 py-px text-[11px] text-warn"
            style={{ background: "var(--color-sunken)" }}
            title="This reply was stopped early — the text below is only what had streamed so far"
          >
            ⏹ stopped
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Whole-message add: once only, then it reports its state. */}
          <button
            onClick={() => {
              if (!node.noted) onClipWhole(node.id);
            }}
            disabled={node.noted}
            title={
              node.noted
                ? "This message is already in your notes"
                : "Add this whole message to notes"
            }
            className={`text-[11px] transition-opacity ${
              node.noted
                ? "cursor-not-allowed opacity-70"
                : "text-faint opacity-0 hover:text-text group-hover:opacity-100"
            }`}
            style={node.noted ? { color: "var(--color-star)" } : undefined}
          >
            {node.noted ? "in notes ✓" : "+ notes"}
          </button>

          {node.clip_count > 0 && !node.noted && (
            <span
              className="text-[11px] text-faint"
              title={`${node.clip_count} excerpt(s) clipped from this message`}
            >
              ✎ {node.clip_count}
            </span>
          )}

          {onRegenerate && (
            <button
              onClick={() => onRegenerate(node.id)}
              title="Ask the same question again as a sibling answer"
              className="text-[11px] text-faint opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
            >
              ⟳ regenerate
            </button>
          )}

          <button
            onClick={() => onToggleStar(node.id)}
            title={node.starred ? "Unmark as important" : "Mark as important"}
            className={`text-[13px] leading-none transition-opacity ${
              node.starred ? "" : "opacity-0 group-hover:opacity-100"
            }`}
            style={{
              color: node.starred ? "var(--color-star)" : "var(--color-faint)",
            }}
          >
            {node.starred ? "★" : "☆"}
          </button>

          {onPrune && (
            <button
              onClick={() => onPrune(node.id)}
              className="text-[11px] text-faint opacity-0 transition-opacity hover:text-warn group-hover:opacity-100"
            >
              prune
            </button>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border px-3.5 py-2.5"
        style={{
          background: isUser
            ? "var(--color-user-surface)"
            : "var(--color-assistant-surface)",
          borderColor: isUser
            ? "var(--color-user-border)"
            : "var(--color-assistant-border)",
          // A branch's colour rides the left edge, so the thread reads as
          // belonging to that branch without tinting the whole message.
          borderLeftColor: color?.fg,
          borderLeftWidth: color ? 3 : 1,
          // Persistent marker for anything already collected into notes.
          boxShadow: node.noted
            ? "inset 0 0 0 1px var(--color-star)"
            : undefined,
        }}
      >
        {/* User turns stay verbatim — what you typed is what you see. Model
            output is rendered, so code arrives highlighted. */}
        {isUser ? (
          <span className="whitespace-pre-wrap">{node.content}</span>
        ) : (
          <Markdown source={node.content} compact />
        )}
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-text-bottom" />
        )}
      </div>

      {branchCount > 0 && (
        <div className="mt-1.5 text-[11px] text-faint">
          {branchCount} branch{branchCount === 1 ? "" : "es"} from this message
        </div>
      )}

      {popover && (
        <div
          style={{ left: popover.x, top: popover.y }}
          onMouseDown={(e) => e.preventDefault()} // keep the selection alive
          className="absolute z-20 flex -translate-x-1/2 -translate-y-full overflow-hidden rounded-md bg-ink text-[12px] font-medium text-on-ink shadow-lg"
        >
          {!isUser && (
            <button
              onClick={() => {
                onBranch(popover.text, node.id);
                dismiss();
              }}
              className="px-2.5 py-1 hover:opacity-80"
            >
              ⑂ Branch
            </button>
          )}
          {/* Excerpts are unlimited even once the whole message is in notes —
              pulling out a specific sentence is a different intent. */}
          <button
            onClick={() => {
              onClipExcerpt(
                node.id,
                `> ${popover.text}\n>\n> — ${node.anchor_text ? `branch “${node.anchor_text}”` : node.role}${node.model ? `, ${node.model}` : ""}`,
              );
              dismiss();
            }}
            className="border-l border-white/20 px-2.5 py-1 hover:opacity-80"
          >
            + Notes
          </button>
        </div>
      )}
    </div>
  );
}
