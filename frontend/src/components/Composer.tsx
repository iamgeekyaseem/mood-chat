import { useEffect, useState } from "react";
import type {
  ContextMode,
  Estimate,
  ProviderInfo,
  SearchMode,
} from "../types";

interface Props {
  placeholder: string;
  anchorText?: string | null;
  mode: ContextMode;
  onModeChange: (m: ContextMode) => void;
  provider: string;
  model: string;
  providers: Record<string, ProviderInfo>;
  onProviderChange: (provider: string, model: string) => void;
  estimate: Estimate | null;
  busy: boolean;
  searchMode: SearchMode;
  onSearchModeChange: (m: SearchMode) => void;
  attachmentCount: number;
  onAddFile: () => void;
  status?: string | null;
  onSend: (text: string) => void;
  onCancel?: () => void;
}

const MODES: { value: ContextMode; label: string; hint: string }[] = [
  { value: "minimal", label: "Minimal", hint: "Selection and its message only" },
  { value: "path", label: "Path", hint: "Every ancestor, siblings excluded" },
  { value: "full", label: "Full", hint: "The entire tree, siblings included" },
];

export function Composer({
  placeholder,
  anchorText,
  mode,
  onModeChange,
  provider,
  model,
  providers,
  onProviderChange,
  estimate,
  busy,
  searchMode,
  onSearchModeChange,
  attachmentCount,
  onAddFile,
  status,
  onSend,
  onCancel,
}: Props) {
  const [text, setText] = useState("");
  const [showModes, setShowModes] = useState(false);

  useEffect(() => setText(""), [anchorText]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setText("");
  }

  const activeProviders = Object.entries(providers).filter(
    ([, info]) => info.models.length > 0,
  );

  const info = providers[provider];
  const caps = info?.capabilities?.[model];
  const searchable = info?.supports_search ?? false;
  // Models without tool calling still get search — we run it and hand over the
  // results — so the control stays available, but the label should be honest
  // about which path it takes.
  const searchHint = caps?.tools
    ? "The model decides when to search."
    : "Results are fetched first and given to the model as context.";

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      {anchorText && (
        <div className="mb-2 flex items-start gap-2 text-[12px]">
          <span className="text-muted">⑂</span>
          <span className="text-muted">
            branching from{" "}
            <span className="text-text">“{anchorText}”</span>
          </span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="ml-auto text-faint hover:text-text"
            >
              cancel
            </button>
          )}
        </div>
      )}

      {status && (
        <div className="mb-2 flex items-center gap-2 text-[12px] text-muted">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
          {status}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter is the newline. ⌘/Ctrl+Enter still works
          // for anyone with it in muscle memory.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-faint focus:border-ink"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
        <div className="relative">
          <button
            onClick={() => setShowModes((v) => !v)}
            className="rounded-md border border-border px-2 py-1 text-muted hover:border-ink hover:text-text"
          >
            context: {mode}
          </button>
          {showModes && (
            <div className="absolute bottom-full z-30 mb-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-xl">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => {
                    onModeChange(m.value);
                    setShowModes(false);
                  }}
                  className={`block w-full rounded-md px-2.5 py-2 text-left hover:bg-sunken ${
                    m.value === mode ? "font-medium text-text" : "text-muted"
                  }`}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[11px] text-faint">{m.hint}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {searchable && (
          <button
            onClick={() => onSearchModeChange(searchMode === "on" ? "off" : "on")}
            title={searchHint}
            className={`rounded-md border px-2 py-1 ${
              searchMode === "on"
                ? "border-transparent bg-ink text-on-ink"
                : "border-border text-muted hover:text-text"
            }`}
          >
            web
          </button>
        )}

        <button
          onClick={onAddFile}
          title="Attach a file — it appears on the Graph tab, where you can connect it to a question"
          className="rounded-md border border-border px-2 py-1 text-muted hover:text-text"
        >
          + file{attachmentCount > 0 ? ` (${attachmentCount})` : ""}
        </button>

        <select
          value={`${provider}:${model}`}
          onChange={(e) => {
            const idx = e.target.value.indexOf(":");
            const p = e.target.value.slice(0, idx);
            const m = e.target.value.slice(idx + 1);
            onProviderChange(p, m);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1 text-muted outline-none hover:border-ink"
        >
          {activeProviders.map(([name, info]) => (
            <optgroup key={name} label={name}>
              {info.models.map((m) => (
                <option key={m} value={`${name}:${m}`}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {estimate && (
          <span
            className={
              estimate.cache.cacheable ? "text-text" : "text-faint"
            }
            title={estimate.cache.note}
          >
            {estimate.prefix_tokens.toLocaleString()} ctx
            {estimate.cache.cacheable ? " · cached" : ""}
          </span>
        )}

        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="ml-auto rounded-md bg-ink px-3 py-1.5 font-medium text-on-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
