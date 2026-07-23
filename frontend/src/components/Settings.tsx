import { useEffect, useState } from "react";
import type { ProviderInfo } from "../types";

interface Props {
  providers: Record<string, ProviderInfo>;
  onSave: (keys: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

const FIELDS = [
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-…",
    note: "Also picks up ANTHROPIC_API_KEY or an `ant auth login` profile, so an empty box here doesn't necessarily mean no credentials.",
  },
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-…",
    note: "Also picks up OPENAI_API_KEY.",
  },
];

/**
 * Key entry. Values are write-only: what's already stored is never read back
 * into the form, so a saved key can't be copied out of the UI. Leaving a field
 * blank keeps whatever is already saved.
 */
export function Settings({ providers, onSave, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const filled = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v.trim()),
    );
    setSaving(true);
    try {
      await onSave(filled);
      setSaved(true);
      setValues({});
      window.setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[520px] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex items-center border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-medium">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="ml-auto text-[13px] text-faint hover:text-text"
          >
            ✕
          </button>
        </header>

        <div className="scroll-y max-h-[60vh] px-5 py-4">
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">
            API keys
          </h3>
          <p className="mb-4 text-[12px] leading-relaxed text-muted">
            Stored at <code className="font-mono">~/.branch/keys.json</code> with
            owner-only permissions. Leave a field blank to keep the existing key.
          </p>

          {FIELDS.map((f) => {
            const info = providers[f.id];
            const live = (info?.models.length ?? 0) > 0;
            return (
              <div key={f.id} className="mb-4">
                <label className="mb-1 flex items-center gap-2 text-[13px]">
                  {f.label}
                  <span
                    className="text-[11px]"
                    style={{
                      color: live
                        ? "var(--color-star)"
                        : "var(--color-faint)",
                    }}
                  >
                    {live ? `● ${info.models.length} models` : "○ not configured"}
                  </span>
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={values[f.id] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.id]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[13px] outline-none placeholder:text-faint focus:border-ink"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-faint">
                  {f.note}
                </p>
              </div>
            );
          })}

          <div className="mb-1 border-t border-border pt-4">
            <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">
              Local models
            </h3>
            <p className="text-[12px] leading-relaxed text-muted">
              Ollama needs no key — only <code className="font-mono">ollama serve</code>{" "}
              running.{" "}
              {(providers.ollama?.models.length ?? 0) > 0 ? (
                <span style={{ color: "var(--color-star)" }}>
                  ● {providers.ollama.models.join(", ")}
                </span>
              ) : (
                <span className="text-faint">
                  ○ not detected. Models are discovered at launch, so restart
                  after pulling one.
                </span>
              )}
            </p>
          </div>
        </div>

        <footer className="flex items-center gap-3 border-t border-border px-5 py-3">
          {saved && <span className="text-[12px] text-muted">saved ✓</span>}
          <button
            onClick={save}
            disabled={saving || !Object.values(values).some((v) => v.trim())}
            className="ml-auto rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-on-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save keys"}
          </button>
        </footer>
      </div>
    </div>
  );
}
