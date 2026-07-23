import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

interface Props {
  content: string;
  onChange: (content: string) => void;
  onExport: () => void;
  saveState: "saved" | "saving" | "dirty";
}

/**
 * The findings document. Clippings from Chat and Graph append here as
 * markdown; this tab is where you edit and export them.
 *
 * Rendering is a plain textarea with a live preview rather than a rich editor:
 * the content is markdown by contract (it gets saved to a .md file), so the
 * source is the thing worth editing.
 */
export function NotesView({ content, onChange, onExport, saveState }: Props) {
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

        <button
          onClick={onExport}
          className="ml-auto rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-on-ink"
        >
          Export .md
        </button>
      </header>

      {content.trim() === "" ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-[380px] text-center text-[14px] leading-relaxed text-faint">
            Nothing collected yet. Select text in a reply and choose{" "}
            <span className="text-text">“+ notes”</span> to start building up
            your findings here.
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
