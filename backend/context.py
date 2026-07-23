"""Context assembly -- the part that actually saves tokens.

Three modes, chosen per branch:

  minimal  the highlighted phrase plus the message it came from
  path     every ancestor from root to the branch point, verbatim (default)
  full     the entire tree flattened, siblings included (escape hatch)

`path` is the interesting one. Sibling branches off the same parent produce a
byte-identical prefix, so the first branch writes the prompt cache and every
later sibling reads it at ~0.1x. The tree saves tokens twice: fewer messages
sent, and the ones that are sent are cache hits.
"""

from __future__ import annotations

from typing import Optional

from tree import ContextMode, Node, Tree

# Minimum cacheable prefix. Below this the API silently declines to cache --
# no error, just cache_creation_input_tokens: 0. Worth telling the user.
CACHE_MIN_TOKENS: dict[str, int] = {
    "claude-opus-4-8": 4096,
    "claude-opus-4-7": 4096,
    "claude-opus-4-6": 4096,
    "claude-haiku-4-5": 4096,
    "claude-sonnet-5": 2048,
    "claude-sonnet-4-6": 2048,
}
DEFAULT_CACHE_MIN = 4096


class AssembledContext:
    def __init__(
        self,
        messages: list[dict],
        prefix_messages: int,
        cache_marked: bool,
        mode: ContextMode,
    ) -> None:
        self.messages = messages
        self.prefix_messages = prefix_messages
        self.cache_marked = cache_marked
        self.mode = mode


def _as_blocks(content: str) -> list[dict]:
    return [{"type": "text", "text": content}]


def assemble(
    tree: Tree,
    parent_id: Optional[str],
    prompt: str,
    mode: ContextMode = "path",
    anchor_text: Optional[str] = None,
    supports_caching: bool = True,
    attachment_blocks: Optional[list[dict]] = None,
) -> AssembledContext:
    """Build the message array for a new user turn under `parent_id`.

    `attachment_blocks` are content blocks for files linked to this point in
    the tree. They ride on the new user turn, after the cache breakpoint, so a
    file attached to one branch never invalidates the prefix its siblings share.
    """

    if mode == "minimal":
        prefix = _minimal_prefix(tree, parent_id, anchor_text)
    elif mode == "full":
        prefix = _full_prefix(tree)
    else:
        prefix = _path_prefix(tree, parent_id)

    messages: list[dict] = [
        {"role": n.role, "content": n.content} for n in prefix
    ]

    # The cache breakpoint goes at the end of the shared prefix, never on the
    # new question -- that text differs every time, so marking it would write a
    # fresh cache entry per request and never read one.
    cache_marked = False
    if supports_caching and messages:
        last = messages[-1]
        last["content"] = _as_blocks(last["content"])
        last["content"][-1]["cache_control"] = {"type": "ephemeral", "ttl": "1h"}
        cache_marked = True

    user_text = prompt
    if anchor_text and mode == "minimal":
        user_text = (
            f'Regarding this phrase from your previous message: "{anchor_text}"\n\n'
            f"{prompt}"
        )

    if attachment_blocks:
        # Files first, question last: the model reads the material before the
        # instruction about it.
        messages.append(
            {
                "role": "user",
                "content": [*attachment_blocks, {"type": "text", "text": user_text}],
            }
        )
    else:
        messages.append({"role": "user", "content": user_text})

    return AssembledContext(
        messages=messages,
        prefix_messages=len(prefix),
        cache_marked=cache_marked,
        mode=mode,
    )


def _path_prefix(tree: Tree, parent_id: Optional[str]) -> list[Node]:
    if parent_id is None:
        return []
    return tree.path_to_root(parent_id)


def _minimal_prefix(
    tree: Tree, parent_id: Optional[str], anchor_text: Optional[str]
) -> list[Node]:
    if parent_id is None:
        return []
    parent = tree.nodes[parent_id]
    # Keep the parent's own parent when it's the user turn that prompted it --
    # a lone assistant message with no question above it reads as fragmentary.
    if parent.parent_id is not None:
        grandparent = tree.nodes[parent.parent_id]
        if grandparent.role == "user":
            return [grandparent, parent]
    return [parent]


def _full_prefix(tree: Tree) -> list[Node]:
    """Every node in creation order. Deliberately the expensive option."""
    return sorted(tree.nodes.values(), key=lambda n: n.created_at)


def cache_min_for(model: str) -> int:
    return CACHE_MIN_TOKENS.get(model, DEFAULT_CACHE_MIN)


def cache_verdict(prefix_tokens: int, model: str) -> dict:
    """What to show in the UI next to the branch's token estimate."""
    minimum = cache_min_for(model)
    if prefix_tokens >= minimum:
        return {
            "cacheable": True,
            "minimum": minimum,
            "note": f"{prefix_tokens:,} token prefix caches; siblings read it at ~0.1x",
        }
    return {
        "cacheable": False,
        "minimum": minimum,
        "note": (
            f"{prefix_tokens:,} token prefix is below the {minimum:,} minimum "
            f"for {model} -- it will not cache"
        ),
    }
