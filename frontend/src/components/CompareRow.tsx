import type { ResolvedColor } from "../colors";
import type { CompareGroup, NodeMap } from "../tree";
import { IconStar, IconStop } from "./icons";
import { Markdown } from "./Markdown";

interface Props {
  group: CompareGroup;
  nodes: NodeMap;
  colorFor: (id: string) => ResolvedColor | null;
  streamingIds: Set<string>;
  onCancel: (id: string) => void;
  onToggleStar: (id: string) => void;
  onSelectColumn: (assistantId: string) => void;
}

/** Several models answering the same prompt at once, rendered as scrollable
 *  side-by-side columns instead of one branch at a time. */
export function CompareRow({
  group,
  nodes,
  colorFor,
  streamingIds,
  onCancel,
  onToggleStar,
  onSelectColumn,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-lg border px-3.5 py-2.5"
        style={{
          background: "var(--color-user-surface)",
          borderColor: "var(--color-user-border)",
        }}
      >
        <span className="whitespace-pre-wrap">{group.prompt}</span>
      </div>

      <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
        Compare · {group.members.length} models
      </div>

      <div className="scroll-x flex gap-3 pb-1">
        {group.members.map((m) => {
          const assistant = m.assistantId ? nodes[m.assistantId] : null;
          const color = assistant ? colorFor(assistant.id) : null;
          const streaming = assistant ? streamingIds.has(assistant.id) : false;
          return (
            <div
              key={m.userId}
              className="min-w-[320px] max-w-[380px] flex-1 shrink-0 overflow-hidden rounded-lg border border-border"
            >
              <button
                onClick={() => m.assistantId && onSelectColumn(m.assistantId)}
                className="block w-full truncate border-b border-border bg-sunken px-3 py-1.5 text-left text-[11px] font-medium text-muted hover:text-text"
                style={color ? { borderLeft: `3px solid ${color.fg}` } : undefined}
              >
                {m.model ?? "model"}
              </button>

              <div className="scroll-y max-h-[420px] px-3 py-2.5 text-[14px] leading-relaxed">
                {assistant ? (
                  <>
                    {assistant.content ? (
                      <Markdown source={assistant.content} compact />
                    ) : (
                      <span className="text-faint">…</span>
                    )}
                    {streaming && (
                      <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-text-bottom" />
                    )}
                  </>
                ) : (
                  <span className="text-faint">…</span>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-[11px] text-faint">
                {assistant && streaming && (
                  <button
                    onClick={() => onCancel(assistant.id)}
                    className="flex items-center gap-1 text-warn transition-transform hover:scale-105 hover:opacity-80 active:scale-95"
                  >
                    <IconStop className="h-3 w-3" /> stop
                  </button>
                )}
                {assistant && (
                  <button
                    onClick={() => onToggleStar(assistant.id)}
                    title={assistant.starred ? "Unmark as important" : "Mark as important"}
                    className="ml-auto transition-transform hover:scale-110 active:scale-95"
                    style={{
                      color: assistant.starred ? "var(--color-star)" : "var(--color-faint)",
                    }}
                  >
                    <IconStar filled={assistant.starred} className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
