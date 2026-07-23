"""Provider registry.

Constructed lazily -- a missing API key should disable one provider, not crash
the app on launch.
"""

from __future__ import annotations

from typing import Optional

from providers.base import Provider, StreamChunk

__all__ = ["Provider", "StreamChunk", "Registry"]


class Registry:
    def __init__(self) -> None:
        self._providers: dict[str, Provider] = {}
        self._errors: dict[str, str] = {}

    def load(self, keys: Optional[dict[str, str]] = None) -> None:
        keys = keys or {}

        try:
            from providers.anthropic_provider import AnthropicProvider

            self._providers["anthropic"] = AnthropicProvider(keys.get("anthropic"))
        except Exception as e:
            self._errors["anthropic"] = str(e)

        try:
            from providers.openai_provider import OpenAIProvider

            self._providers["openai"] = OpenAIProvider(keys.get("openai"))
        except Exception as e:
            self._errors["openai"] = str(e)

        try:
            from providers.ollama_provider import OllamaProvider

            self._providers["ollama"] = OllamaProvider()
        except Exception as e:
            self._errors["ollama"] = str(e)

    def get(self, name: str) -> Provider:
        if name not in self._providers:
            reason = self._errors.get(name, "not registered")
            raise KeyError(f"provider '{name}' unavailable: {reason}")
        return self._providers[name]

    def available(self) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for name, p in self._providers.items():
            # Per-model capabilities matter for local models, where vision and
            # tool support vary widely between what the user happens to have
            # pulled. Hosted providers answer uniformly.
            caps = {
                m: {
                    "vision": p.supports_vision(m),
                    "tools": getattr(p, "supports_tools", lambda _m: False)(m),
                }
                for m in p.models()
            }
            out[name] = {
                "models": p.models(),
                "supports_caching": p.supports_caching,
                "supports_search": p.supports_search,
                "capabilities": caps,
                "error": None,
            }
        for name, err in self._errors.items():
            if name not in out:
                out[name] = {
                    "models": [],
                    "supports_caching": False,
                    "supports_search": False,
                    "capabilities": {},
                    "error": err,
                }
        return out
