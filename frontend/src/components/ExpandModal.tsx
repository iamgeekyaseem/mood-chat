import { useEffect } from "react";
import type { ResolvedColor } from "../colors";
import type { Node } from "../types";
import { IconClose } from "./icons";
import { Markdown } from "./Markdown";

interface Props {
  node: Node;
  color: ResolvedColor | null;
  onClose: () => void;
}

/** Full, untruncated view of a graph card's message — modal shell matches
 *  DiffView's, for a consistent floating-dialog look across the app. */
export function ExpandModal({ node, color, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full message"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[80vh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-border px-5 py-3">
          {color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: color.fg }}
              aria-hidden
            />
          )}
          <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
            {node.role === "user" ? "You" : (node.model ?? "Assistant")}
          </span>
          {node.anchor_text && (
            <span
              className="rounded-sm px-1.5 py-px text-[11px]"
              style={{ background: color?.soft, color: color?.fg ?? "var(--color-muted)" }}
            >
              {node.anchor_text}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="ml-auto text-faint transition-transform hover:scale-110 hover:text-text active:scale-95"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>
        <div className="scroll-y flex-1 px-5 py-4 text-[14px] leading-relaxed">
          {node.role === "user" ? (
            <span className="whitespace-pre-wrap">{node.content}</span>
          ) : (
            <Markdown source={node.content} compact />
          )}
        </div>
      </div>
    </div>
  );
}
