"""Provider abstraction.

Every branch records which provider and model produced it, so the tree can mix
them. One caveat the UI needs to surface: prompt caches are scoped to a single
model. Switching models on a branch means its ancestor prefix is re-read from
scratch on that model, and the cache the siblings share is not reused.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Optional


@dataclass
class StreamChunk:
    text: str = ""
    thinking: str = ""
    done: bool = False
    usage: Optional[dict] = None
    # Progress the user should see while nothing is streaming yet -- a web
    # search can take seconds, and an idle cursor reads as a hang.
    status: str = ""


class Provider(ABC):
    name: str
    supports_caching: bool = False
    supports_search: bool = False

    def supports_vision(self, model: str) -> bool:
        return True

    @abstractmethod
    async def stream(
        self,
        model: str,
        messages: list[dict],
        system: Optional[str] = None,
        max_tokens: int = 16000,
        search_mode: str = "off",
    ) -> AsyncIterator[StreamChunk]:
        ...

    @abstractmethod
    async def count_tokens(
        self, model: str, messages: list[dict], system: Optional[str] = None
    ) -> int:
        ...

    @abstractmethod
    def models(self) -> list[str]:
        ...
