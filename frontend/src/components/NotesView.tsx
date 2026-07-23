import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

interface Props {
  content: string;
  onChange: (content: string) => void;
  onExport: () => void;
  saveState: "saved" | "saving" | "dirty";
  /** Whether a session is active to write into (false before any message). */
  hasSession: boolean;
  /** The active session's opening line, shown when notes are session-scoped. */
  sessionLabel: string | null;
  /** Only surface the per-session scope when there's more than one session. */
  multiSession: boolean;
}

/**
 * The findings document. Clippings from Chat and Graph append here as
 * markdown; this tab is where you edit and export them.
 *
 * Rendering is a plain textarea with a live preview rather than a rich editor:
 * the content is markdown by contract (it gets saved to a .md file), so the
 * source is the thing worth editing.
 */
export function NotesView({
  content,
  onChange,
  onExport,
  saveState,
  hasSession,
  sessionLabel,
  multiSession,
}: Props) {
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);

  // Appended clippings should be visible without hunting for them, but only
  // scroll if the user was already at the bottom — otherwise a clip yanks the
  // view away mid-edit.
  useEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [content]);

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-2.5">
        <div className="flex rounded-md border border-border p-0.5">
          {(["write", "preview"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPreview(m === "preview")}
              className={`rounded px-2.5 py-1 text-[12px] ${
                (m === "preview") === preview
                  ? "bg-ink text-on-ink"
                  : "text-muted hover:text-text"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-faint">
          {words} word{words === 1 ? "" : "s"}
        </span>

        <span className="text-[11px] text-faint">
          {saveState === "saving"
            ? "saving…"
            : saveState === "dirty"
              ? "unsaved"
              : "saved"}
        </span>

        {/* When several sessions live on one canvas, notes are per session —
            name the one being shown so it's never ambiguous which doc this is. */}
        {multiSession && sessionLabel && (
          <span
            className="max-w-[280px] truncate rounded-md border border-border px-2 py-0.5 text-[11px] text-muted"
            title={`Notes for this session: “${sessionLabel}”`}
          >
            ⑂ {sessionLabel}
          </span>
        )}

        <button
          onClick={onExport}
          disabled={!hasSession}
          className="ml-auto rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-on-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export .md
        </button>
      </header>

      {!hasSession ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-[380px] text-center text-[14px] leading-relaxed text-faint">
            No session yet. Ask something first — each session on the canvas
            keeps its own notes, so there's nothing to write into until one
            exists.
          </p>
        </div>
      ) : content.trim() === "" ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-[380px] text-center text-[14px] leading-relaxed text-faint">
            Nothing collected in this session yet. Select text in a reply and
            choose <span className="text-text">“+ notes”</span> to start building
            up your findings here.
          </p>
        </div>
      ) : preview ? (
        <div className="scroll-y flex-1 px-6 py-6">
          <div className="mx-auto max-w-[720px]">
            <Markdown source={content} />
          </div>
        </div>
      ) : (
        <textarea
          ref={ref}
          value={content}
          onChange={(e) => {
            const el = e.currentTarget;
            atBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            onChange(e.target.value);
          }}
          spellCheck={false}
          className="scroll-y flex-1 resize-none bg-bg px-6 py-6 font-mono text-[13px] leading-relaxed outline-none"
        />
      )}
    </div>
  );
}
