"""Local models via Ollama. Free, so a good default for cheap side branches.

Capability-aware: Ollama reports what each model can do, and the two features
that matter here differ widely across local models.

  vision  the model accepts images, so attachments can be sent inline
  tools   the model can call web_search itself

Models with neither still get web search through the inject path -- we run the
search and hand over the results as context. For small local models that is
often the better route anyway: they are poor judges of when a search is needed.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import AsyncIterator, Optional

import httpx

import websearch
from providers.base import Provider, StreamChunk

BASE_URL = "http://localhost:11434"
MAX_TOOL_ROUNDS = 4


class OllamaProvider(Provider):
    name = "ollama"
    supports_caching = False
    supports_search = True

    def __init__(self, base_url: str = BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")
        self._models: list[str] = []
        self._caps: dict[str, list[str]] = {}

    def models(self) -> list[str]:
        return self._models

    def capabilities(self, model: str) -> list[str]:
        return self._caps.get(model, [])

    def supports_vision(self, model: str) -> bool:
        return "vision" in self._caps.get(model, [])

    def supports_tools(self, model: str) -> bool:
        return "tools" in self._caps.get(model, [])

    async def refresh_models(self) -> list[str]:
        """Ollama's model list is whatever the user has pulled locally."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                resp.raise_for_status()
                self._models = [m["name"] for m in resp.json().get("models", [])]

                for model in self._models:
                    try:
                        show = await client.post(
                            f"{self.base_url}/api/show", json={"model": model}
                        )
                        show.raise_for_status()
                        self._caps[model] = show.json().get("capabilities", [])
                    except httpx.HTTPError:
                        self._caps[model] = []
        except (httpx.HTTPError, KeyError):
            # Ollama not running. Not an error -- the provider just has nothing
            # to offer, and the UI greys it out.
            self._models = []
            self._caps = {}
        return self._models

    # -- message shaping -------------------------------------------------

    def _to_ollama(self, messages: list[dict], model: str) -> list[dict]:
        """Ollama takes images as a sibling `images` array of base64 strings,
        not as content blocks. Anything non-text is flattened here."""
        out: list[dict] = []
        vision = self.supports_vision(model)

        for m in messages:
            content = m.get("content")
            if isinstance(content, str):
                out.append({"role": m["role"], "content": content})
                continue

            texts: list[str] = []
            images: list[str] = []
            for block in content or []:
                btype = block.get("type")
                if btype == "text":
                    texts.append(block.get("text", ""))
                elif btype == "image":
                    src = block.get("source", {})
                    if src.get("type") == "base64" and src.get("data"):
                        images.append(src["data"])
                elif btype == "document":
                    # No document type in Ollama; the extracted text was
                    # already inlined by the attachment layer.
                    texts.append(block.get("text", ""))

            msg: dict = {"role": m["role"], "content": "\n\n".join(t for t in texts if t)}
            if images:
                if vision:
                    msg["images"] = images
                else:
                    msg["content"] += (
                        "\n\n[an image was attached, but this model has no vision "
                        "capability and cannot see it]"
                    )
            out.append(msg)
        return out

    # -- streaming -------------------------------------------------------

    async def stream(
        self,
        model: str,
        messages: list[dict],
        system: Optional[str] = None,
        max_tokens: int = 16000,
        search_mode: str = "off",
    ) -> AsyncIterator[StreamChunk]:
        msgs = self._to_ollama(messages, model)
        if system:
            msgs = [{"role": "system", "content": system}] + msgs

        use_tools = search_mode == "on" and self.supports_tools(model)
        inject = search_mode == "on" and not self.supports_tools(model)

        if inject:
            # No tool calling: search on the last user turn and hand the
            # results over as context before answering -- but only when the
            # question actually looks like it wants outside information. A small
            # local model can't decide this for itself, and searching on every
            # turn (a greeting, a rewrite, a maths question) wastes a round-trip
            # and pollutes the context with irrelevant snippets.
            query = _last_user_text(msgs)
            if query and _wants_search(query):
                yield StreamChunk(status=f"searching the web for “{query[:60]}”…")
                results = await websearch.search(query)
                block = websearch.as_context(query, results)
                msgs.insert(
                    max(0, len(msgs) - 1),
                    {"role": "user", "content": block},
                )
                yield StreamChunk(
                    status=f"{len(results)} result{'' if len(results) == 1 else 's'}"
                )

        async with httpx.AsyncClient(timeout=None) as client:
            if use_tools:
                async for chunk in self._tool_rounds(client, model, msgs, max_tokens):
                    if chunk.done:
                        return
                    yield chunk

            async for chunk in self._stream_once(client, model, msgs, max_tokens):
                yield chunk

    async def _tool_rounds(
        self, client: httpx.AsyncClient, model: str, msgs: list[dict], max_tokens: int
    ) -> AsyncIterator[StreamChunk]:
        """Resolve tool calls non-streaming, then let the caller stream the
        final answer. Streaming tool-call deltas adds complexity for no user
        benefit -- nothing is shown until the tool returns anyway."""
        for _ in range(MAX_TOOL_ROUNDS):
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": msgs,
                    "stream": False,
                    "tools": [websearch.SEARCH_TOOL],
                    "options": {"num_predict": max_tokens},
                },
            )
            resp.raise_for_status()
            message = resp.json().get("message", {})
            calls = message.get("tool_calls") or []

            if not calls:
                # Model answered directly; nothing left to resolve.
                return

            msgs.append(message)
            for call in calls:
                fn = call.get("function", {})
                name = fn.get("name", "")
                args = fn.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                yield StreamChunk(
                    status=f"searching: {str(args.get('query', ''))[:60]}"
                )
                result = await websearch.run_tool(name, args)
                msgs.append({"role": "tool", "content": result})

    async def _stream_once(
        self, client: httpx.AsyncClient, model: str, msgs: list[dict], max_tokens: int
    ) -> AsyncIterator[StreamChunk]:
        payload = {
            "model": model,
            "messages": msgs,
            "stream": True,
            "options": {"num_predict": max_tokens},
        }
        async with client.stream(
            "POST", f"{self.base_url}/api/chat", json=payload
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                data = json.loads(line)
                if data.get("done"):
                    yield StreamChunk(
                        done=True,
                        usage={
                            "input_tokens": data.get("prompt_eval_count", 0),
                            "output_tokens": data.get("eval_count", 0),
                            "cache_read_input_tokens": 0,
                            "cache_creation_input_tokens": 0,
                        },
                    )
                    return
                content = data.get("message", {}).get("content", "")
                if content:
                    yield StreamChunk(text=content)

    async def count_tokens(
        self, model: str, messages: list[dict], system: Optional[str] = None
    ) -> int:
        chars = sum(
            len(str(m.get("content", ""))) for m in self._to_ollama(messages, model)
        )
        if system:
            chars += len(system)
        return chars // 4


# Prompts that clearly operate on text already in the conversation, or are
# self-contained tasks, gain nothing from a web search.
_NO_SEARCH_PREFIXES = (
    "summarize", "summarise", "rewrite", "rephrase", "translate", "fix",
    "refactor", "explain the above", "explain this", "continue", "shorten",
    "expand on the above", "tldr", "proofread", "format",
)
# Signals that the answer depends on facts outside the model's weights.
_SEARCH_CUES = (
    "latest", "current", "today", "yesterday", "recent", "recently", "news",
    "price", "stock", "release", "released", "version", "who is", "who won",
    "when did", "when is", "when will", "how much", "weather", "score",
    "2024", "2025", "2026", "http://", "https://", "www.", ".com", ".org",
)


def _wants_search(query: str) -> bool:
    """Heuristic relevance gate for the inject path.

    Conservative by design: it only *suppresses* a search when the prompt is a
    self-contained text task, and it forces one when there is a clear freshness
    or lookup cue. Anything else defaults to searching, since the user did turn
    search on for this turn.
    """
    q = query.strip().lower()
    if not q:
        return False
    if any(q.startswith(p) for p in _NO_SEARCH_PREFIXES):
        return False
    if any(cue in q for cue in _SEARCH_CUES):
        return True
    # A very short conversational turn (a greeting, an acknowledgement) is not
    # worth a search; a real question or request is.
    words = q.split()
    if len(words) <= 3 and "?" not in q:
        return False
    return True


def _last_user_text(msgs: list[dict]) -> str:
    for m in reversed(msgs):
        if m.get("role") == "user":
            return str(m.get("content", "")).strip()
    return ""


def encode_image(path: Path) -> str:
    return base64.standard_b64encode(path.read_bytes()).decode("ascii")
