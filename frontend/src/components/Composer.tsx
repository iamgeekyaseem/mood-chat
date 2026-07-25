import { useEffect, useState } from "react";
import {
  IconBranch,
  IconCheck,
  IconClose,
  IconCompare,
  IconFast,
  IconNotes,
  IconTemplates,
  IconThink,
} from "./icons";
import type {
  ContextMode,
  Estimate,
  ModelChoice,
  ProviderInfo,
  SearchMode,
  Template,
  ThinkMode,
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
  thinkMode: ThinkMode;
  onThinkModeChange: (m: ThinkMode) => void;
  attachmentCount: number;
  onAddFile: () => void;
  status?: string | null;
  onSend: (text: string) => void;
  /** Fan the same question out to several models, each as its own branch. */
  onSendMulti: (text: string, targets: ModelChoice[]) => void;
  onCancel?: () => void;
  templates: Template[];
  onSaveTemplate: (title: string, body: string) => void;
  onDeleteTemplate: (id: string) => void;
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
  thinkMode,
  onThinkModeChange,
  attachmentCount,
  onAddFile,
  status,
  onSend,
  onSendMulti,
  onCancel,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
}: Props) {
  const [text, setText] = useState("");
  const [showModes, setShowModes] = useState(false);
  const [showMulti, setShowMulti] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  // Ticked models for a fan-out, keyed "provider:model".
  const [multi, setMulti] = useState<Set<string>>(new Set());

  useEffect(() => setText(""), [anchorText]);

  const activeProviders = Object.entries(providers).filter(
    ([, info]) => info.models.length > 0,
  );

  const multiTargets: ModelChoice[] = [...multi].map((k) => {
    const i = k.indexOf(":");
    return { provider: k.slice(0, i), model: k.slice(i + 1) };
  });

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (multiTargets.length > 0) {
      onSendMulti(trimmed, multiTargets);
    } else {
      onSend(trimmed);
    }
    setText("");
  }

  function toggleMulti(key: string) {
    setMulti((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const info = providers[provider];
  const caps = info?.capabilities?.[model];
  const searchable = info?.supports_search ?? false;
  const thinkable = caps?.thinking ?? false;
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
          <IconBranch className="mt-0.5 h-3.5 w-3.5 text-muted" />
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

        {/* Reasoning models only: choose whether to think before answering.
            Thinking is slower but sharper; fast skips it for a quick reply. */}
        {thinkable && (
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => onThinkModeChange("auto")}
              title="Let the model reason before it answers"
              className={`flex items-center gap-1 px-2 py-1 ${
                thinkMode === "auto"
                  ? "bg-ink text-on-ink"
                  : "text-muted hover:text-text"
              }`}
            >
              <IconThink className="h-3.5 w-3.5" /> think
            </button>
            <button
              onClick={() => onThinkModeChange("fast")}
              title="Skip reasoning for a quicker reply"
              className={`flex items-center gap-1 border-l border-border px-2 py-1 ${
                thinkMode === "fast"
                  ? "bg-ink text-on-ink"
                  : "text-muted hover:text-text"
              }`}
            >
              <IconFast className="h-3.5 w-3.5" /> fast
            </button>
          </div>
        )}

        <button
          onClick={onAddFile}
          title="Attach a file — it appears on the Graph tab, where you can connect it to a question"
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted hover:text-text"
        >
          <IconNotes className="h-3.5 w-3.5" /> file
          {attachmentCount > 0 ? ` (${attachmentCount})` : ""}
        </button>

        {/* Saved openings: insert a reusable prompt, or bank the current one. */}
        <div className="relative">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            title="Saved openings — reusable prompts you start from"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted hover:text-text"
          >
            <IconTemplates className="h-3.5 w-3.5" /> templates
          </button>
          {showTemplates && (
            <div className="absolute bottom-full z-30 mb-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
              {templates.length === 0 && (
                <div className="px-2 py-1.5 text-[11px] leading-relaxed text-faint">
                  No templates yet. Type an opening, then save it below.
                </div>
              )}
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-1 rounded-md px-1 hover:bg-sunken"
                >
                  <button
                    onClick={() => {
                      setText(t.body);
                      setShowTemplates(false);
                    }}
                    className="min-w-0 flex-1 truncate px-1.5 py-1.5 text-left text-[12px] text-text"
                    title={t.body}
                  >
                    {t.title}
                  </button>
                  <button
                    onClick={() => onDeleteTemplate(t.id)}
                    title="Delete template"
                    className="shrink-0 px-1 text-faint opacity-0 transition-transform hover:scale-110 hover:text-warn group-hover:opacity-100 active:scale-95"
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="mt-1 flex items-center gap-1 border-t border-border px-1 pt-1.5">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Save current as…"
                  className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-[12px] outline-none placeholder:text-faint focus:border-ink"
                />
                <button
                  onClick={() => {
                    if (!newTitle.trim() || !text.trim()) return;
                    onSaveTemplate(newTitle.trim(), text);
                    setNewTitle("");
                  }}
                  disabled={!newTitle.trim() || !text.trim()}
                  className="shrink-0 rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-on-ink disabled:opacity-40"
                >
                  save
                </button>
              </div>
            </div>
          )}
        </div>

        <select
          value={`${provider}:${model}`}
          onChange={(e) => {
            const idx = e.target.value.indexOf(":");
            const p = e.target.value.slice(0, idx);
            const m = e.target.value.slice(idx + 1);
            onProviderChange(p, m);
          }}
          disabled={multiTargets.length > 0}
          title={
            multiTargets.length > 0
              ? "Disabled while comparing models — the fan-out uses the ticked models"
              : undefined
          }
          className="rounded-md border border-border bg-surface px-2 py-1 text-muted outline-none hover:border-ink disabled:opacity-40"
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

        {/* Compare models: tick several, and one send fans out to all of them
            as separate branches. */}
        <div className="relative">
          <button
            onClick={() => setShowMulti((v) => !v)}
            title="Send this question to several models at once — each answer becomes its own branch"
            className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
              multiTargets.length > 0
                ? "border-transparent bg-ink text-on-ink"
                : "border-border text-muted hover:text-text"
            }`}
          >
            <IconCompare className="h-3.5 w-3.5" /> compare
            {multiTargets.length > 0 ? ` (${multiTargets.length})` : ""}
          </button>
          {showMulti && (
            <div className="absolute bottom-full z-30 mb-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
              <div className="px-2 py-1.5 text-[11px] leading-relaxed text-faint">
                Tick models to compare. One send branches to each.
              </div>
              {activeProviders.map(([name, info]) => (
                <div key={name}>
                  <div className="px-2 pt-1.5 text-[10px] uppercase tracking-wider text-faint">
                    {name}
                  </div>
                  {info.models.map((m) => {
                    const key = `${name}:${m}`;
                    const checked = multi.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleMulti(key)}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-sunken"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] ${
                            checked
                              ? "border-ink bg-ink text-on-ink"
                              : "border-border"
                          }`}
                        >
                          {checked && <IconCheck className="h-2.5 w-2.5" />}
                        </span>
                        <span className="truncate text-[12px] text-text">{m}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {multi.size > 0 && (
                <button
                  onClick={() => setMulti(new Set())}
                  className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-faint hover:text-text"
                >
                  clear selection
                </button>
              )}
            </div>
          )}
        </div>

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
          {busy
            ? "…"
            : multiTargets.length > 0
              ? `Send to ${multiTargets.length}`
              : "Send"}
        </button>
      </div>
    </div>
  );
}
