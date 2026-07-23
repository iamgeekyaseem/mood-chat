import { useEffect, useMemo, useState } from "react";
import type { ModelChoice, ProviderInfo } from "../types";

interface Props {
  providers: Record<string, ProviderInfo>;
  initial: ModelChoice | null;
  onConfirm: (choice: ModelChoice) => void;
  onOpenSettings: () => void;
}

const PROVIDER_HINT: Record<string, string> = {
  anthropic: "cloud · API key",
  openai: "cloud · API key",
  ollama: "local · free",
};

/**
 * Startup model chooser. Asked once per launch so the active model for the
 * session is a conscious choice, not a silent default — which is how you'd end
 * up "sending" to a provider with no key. Configured providers (a key, or a
 * running Ollama) sort to the top and are pre-selected.
 */
export function ModelPicker({
  providers,
  initial,
  onConfirm,
  onOpenSettings,
}: Props) {
  // Flatten to (provider, model) rows, configured first.
  const rows = useMemo(() => {
    const out: (ModelChoice & { configured: boolean })[] = [];
    for (const [provider, info] of Object.entries(providers)) {
      for (const model of info.models) {
        out.push({ provider, model, configured: Boolean(info.configured) });
      }
    }
    return out.sort(
      (a, b) => Number(b.configured) - Number(a.configured),
    );
  }, [providers]);

  const [choice, setChoice] = useState<ModelChoice | null>(() => {
    if (initial && rows.some((r) => r.provider === initial.provider && r.model === initial.model)) {
      return initial;
    }
    const firstConfigured = rows.find((r) => r.configured) ?? rows[0];
    return firstConfigured
      ? { provider: firstConfigured.provider, model: firstConfigured.model }
      : null;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && choice) onConfirm(choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choice, onConfirm]);

  const anyConfigured = rows.some((r) => r.configured);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a model"
        className="flex max-h-[80vh] w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-medium">Choose a model for this session</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Everything you send uses this model until you switch it in the
            composer. You can pick a different model per branch later.
          </p>
        </header>

        <div className="scroll-y flex-1 p-2">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-faint">
              No models available. Add an API key in Settings, or start Ollama.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {rows.map((r) => {
                const selected =
                  choice?.provider === r.provider && choice?.model === r.model;
                return (
                  <li key={`${r.provider}:${r.model}`}>
                    <button
                      onClick={() =>
                        setChoice({ provider: r.provider, model: r.model })
                      }
                      onDoubleClick={() =>
                        onConfirm({ provider: r.provider, model: r.model })
                      }
                      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left ${
                        selected
                          ? "border-ink bg-sunken"
                          : "border-transparent hover:bg-sunken/60"
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: r.configured
                            ? "var(--color-star)"
                            : "var(--color-faint)",
                        }}
                        title={r.configured ? "ready" : "needs setup"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-text">
                          {r.model}
                        </span>
                        <span className="text-[11px] text-faint">
                          {r.provider} · {PROVIDER_HINT[r.provider] ?? ""}
                          {!r.configured && " · not configured"}
                        </span>
                      </span>
                      {selected && <span className="text-[12px] text-muted">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-border px-5 py-3">
          <button
            onClick={onOpenSettings}
            className="text-[12px] text-muted hover:text-text"
          >
            Add API keys…
          </button>
          {!anyConfigured && (
            <span className="text-[11px] text-warn">
              Nothing configured — pick anyway, or add a key / start Ollama.
            </span>
          )}
          <button
            onClick={() => choice && onConfirm(choice)}
            disabled={!choice}
            className="ml-auto rounded-md bg-ink px-4 py-1.5 text-[13px] font-medium text-on-ink transition-opacity disabled:opacity-40"
          >
            Use this model
          </button>
        </footer>
      </div>
    </div>
  );
}
