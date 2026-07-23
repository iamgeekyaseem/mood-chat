import { useEffect, useRef, useState } from "react";
import type { TreeSummary } from "../types";

interface Props {
  trees: TreeSummary[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Conversation history. Each entry is a whole tree — its own branches, notes,
 * and attachments — so switching here swaps the entire workspace, not just the
 * visible thread.
 */
export function Sessions({
  trees,
  activeId,
  collapsed,
  onToggleCollapsed,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (collapsed) {
    return (
      <aside className="flex w-[44px] shrink-0 flex-col items-center gap-2 border-r border-border bg-sunken py-3">
        <button
          onClick={onToggleCollapsed}
          title="Show conversations"
          aria-label="Show conversations"
          className="rounded-md px-2 py-1 text-[13px] text-muted hover:text-text"
        >
          ›
        </button>
        <button
          onClick={onNew}
          title="New conversation"
          aria-label="New conversation"
          className="rounded-md px-2 py-1 text-[15px] text-muted hover:text-text"
        >
          +
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-border bg-sunken">
      <header className="flex items-center gap-1 border-b border-border px-3 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-faint">
          Conversations
        </h2>
        <button
          onClick={onToggleCollapsed}
          title="Hide conversations"
          aria-label="Hide conversations"
          className="ml-auto rounded px-1 text-[13px] text-faint hover:text-text"
        >
          ‹
        </button>
      </header>

      <div className="p-2">
        <button
          onClick={onNew}
          className="w-full rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-on-ink"
        >
          + New conversation
        </button>
      </div>

      <div className="scroll-y flex-1 px-2 pb-2">
        {trees.length === 0 ? (
          <p className="px-1 py-4 text-[12px] leading-relaxed text-faint">
            Nothing yet. Your conversations will collect here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {trees.map((t) => {
              const isActive = t.id === activeId;
              return (
                <li key={t.id}>
                  {editing === t.id ? (
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => {
                        onRename(t.id, draft);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRename(t.id, draft);
                          setEditing(null);
                        } else if (e.key === "Escape") {
                          setEditing(null);
                        }
                      }}
                      className="w-full rounded-md border border-ink bg-surface px-2 py-1.5 text-[13px] outline-none"
                    />
                  ) : (
                    <div
                      className={`group flex items-center gap-1 rounded-md px-2 py-1.5 ${
                        isActive ? "bg-surface" : "hover:bg-surface/60"
                      }`}
                      style={
                        isActive
                          ? { boxShadow: "inset 2px 0 0 var(--color-ink)" }
                          : undefined
                      }
                    >
                      <button
                        onClick={() => onOpen(t.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div
                          className={`truncate text-[13px] ${
                            isActive ? "text-text" : "text-muted"
                          }`}
                          title={t.title}
                        >
                          {t.title}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-faint">
                          <span>{t.nodes} msg</span>
                          {t.branches > 0 && <span>⑂ {t.branches}</span>}
                          {t.starred > 0 && (
                            <span style={{ color: "var(--color-star)" }}>
                              ★ {t.starred}
                            </span>
                          )}
                        </div>
                      </button>

                      {confirming === t.id ? (
                        <div className="flex shrink-0 items-center gap-1 text-[10px]">
                          <button
                            onClick={() => {
                              onDelete(t.id);
                              setConfirming(null);
                            }}
                            className="rounded px-1 py-0.5 text-warn hover:underline"
                          >
                            delete
                          </button>
                          <button
                            onClick={() => setConfirming(null)}
                            className="rounded px-1 py-0.5 text-faint hover:text-text"
                          >
                            no
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => {
                              setDraft(t.title);
                              setEditing(t.id);
                            }}
                            title="Rename"
                            className="rounded px-1 text-[11px] text-faint hover:text-text"
                          >
                            ✎
                          </button>
                          {/* Deleting takes the branches, notes, and files with
                              it, so it asks first. */}
                          <button
                            onClick={() => setConfirming(t.id)}
                            title="Delete conversation"
                            className="rounded px-1 text-[11px] text-faint hover:text-warn"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
