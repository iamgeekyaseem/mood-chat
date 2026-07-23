"""OpenAI provider.

No prompt caching hooks here -- OpenAI caches prefixes automatically and does
not expose a breakpoint, so `supports_caching` stays False and context.py skips
the cache_control blocks (which OpenAI would reject as unknown fields anyway).
"""

from __future__ import annotations

from typing import AsyncIterator, Optional

from openai import AsyncOpenAI

import websearch
from providers.base import Provider, StreamChunk

MODELS = ["gpt-5", "gpt-5-mini", "gpt-4.1"]


class OpenAIProvider(Provider):
    name = "openai"
    supports_caching = False
    supports_search = True

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.client = AsyncOpenAI(api_key=api_key) if api_key else AsyncOpenAI()

    def models(self) -> list[str]:
        return MODELS

    async def stream(
        self,
        model: str,
        messages: list[dict],
        system: Optional[str] = None,
        max_tokens: int = 16000,
        search_mode: str = "off",
    ) -> AsyncIterator[StreamChunk]:
        msgs = list(messages)

        if search_mode == "on":
            query = _last_user_text(msgs)
            if query:
                yield StreamChunk(status=f"searching the web for “{query[:60]}”…")
                results = await websearch.search(query)
                msgs.insert(
                    max(0, len(msgs) - 1),
                    {"role": "user", "content": websearch.as_context(query, results)},
                )

        if system:
            msgs = [{"role": "system", "content": system}] + msgs

        stream = await self.client.chat.completions.create(
            model=model,
            messages=msgs,
            max_completion_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )

        usage = None
        async for event in stream:
            if event.usage:
                usage = {
                    "input_tokens": event.usage.prompt_tokens,
                    "output_tokens": event.usage.completion_tokens,
                    "cache_read_input_tokens": getattr(
                        event.usage.prompt_tokens_details, "cached_tokens", 0
                    )
                    if event.usage.prompt_tokens_details
                    else 0,
                    "cache_creation_input_tokens": 0,
                }
            if event.choices and event.choices[0].delta.content:
                yield StreamChunk(text=event.choices[0].delta.content)

        yield StreamChunk(done=True, usage=usage or {})

    async def count_tokens(
        self, model: str, messages: list[dict], system: Optional[str] = None
    ) -> int:
        # OpenAI has no count endpoint. Approximate at ~4 chars/token; this is
        # only used for the pre-send estimate, never for billing.
        chars = sum(len(str(m.get("content", ""))) for m in messages)
        if system:
            chars += len(system)
        return chars // 4


def _last_user_text(msgs: list[dict]) -> str:
    for m in reversed(msgs):
        if m.get("role") == "user":
            c = m.get("content")
            if isinstance(c, str):
                return c.strip()
            if isinstance(c, list):
                return " ".join(
                    b.get("text", "") for b in c if b.get("type") == "text"
                ).strip()
    return ""
