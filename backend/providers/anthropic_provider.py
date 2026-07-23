"""Claude provider. The only one of the three with prompt caching."""

from __future__ import annotations

from typing import AsyncIterator, Optional

import anthropic

from providers.base import Provider, StreamChunk

MODELS = [
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5",
]


class AnthropicProvider(Provider):
    name = "anthropic"
    supports_caching = True
    supports_search = True

    def __init__(self, api_key: Optional[str] = None) -> None:
        # A bare constructor also picks up an `ant auth login` profile, so an
        # unset ANTHROPIC_API_KEY does not mean there are no credentials.
        self.client = (
            anthropic.AsyncAnthropic(api_key=api_key)
            if api_key
            else anthropic.AsyncAnthropic()
        )

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
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
            "thinking": {"type": "adaptive", "display": "summarized"},
        }
        if system:
            kwargs["system"] = system
        if search_mode == "on":
            # Server-side: Claude runs the search on Anthropic's infrastructure,
            # so there is no local tool loop to drive.
            kwargs["tools"] = [
                {"type": "web_search_20260209", "name": "web_search", "max_uses": 5}
            ]

        async with self.client.messages.stream(**kwargs) as stream:
            async for event in stream:
                if event.type == "content_block_start":
                    if getattr(event.content_block, "type", "") == "server_tool_use":
                        yield StreamChunk(status="searching the web…")
                    continue
                if event.type != "content_block_delta":
                    continue
                if event.delta.type == "text_delta":
                    yield StreamChunk(text=event.delta.text)
                elif event.delta.type == "thinking_delta":
                    yield StreamChunk(thinking=event.delta.thinking)

            final = await stream.get_final_message()
            u = final.usage
            yield StreamChunk(
                done=True,
                usage={
                    "input_tokens": u.input_tokens,
                    "output_tokens": u.output_tokens,
                    "cache_read_input_tokens": getattr(
                        u, "cache_read_input_tokens", 0
                    )
                    or 0,
                    "cache_creation_input_tokens": getattr(
                        u, "cache_creation_input_tokens", 0
                    )
                    or 0,
                },
            )

    async def count_tokens(
        self, model: str, messages: list[dict], system: Optional[str] = None
    ) -> int:
        kwargs: dict = {"model": model, "messages": messages}
        if system:
            kwargs["system"] = system
        resp = await self.client.messages.count_tokens(**kwargs)
        return resp.input_tokens
