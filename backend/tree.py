"""Conversation tree: nodes, parentage, and traversal.

A node is a single message. A branch is a user node whose `anchor_text` records
the phrase that was highlighted to create it. The path from root to any node is
the conversation that node sees -- sibling branches are invisible to each other,
which is the whole point.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Literal, Optional

Role = Literal["user", "assistant"]
ContextMode = Literal["minimal", "path", "full"]


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    @property
    def billed_input(self) -> float:
        """Input tokens weighted by what they actually cost.

        Cache reads bill at ~0.1x, cache writes at ~1.25x. This is the number
        worth showing the user -- raw token count overstates the cost of a
        branch that mostly replayed a cached ancestor path.
        """
        return (
            self.input_tokens
            + self.cache_read_input_tokens * 0.1
            + self.cache_creation_input_tokens * 1.25
        )


@dataclass
class Node:
    id: str
    parent_id: Optional[str]
    role: Role
    content: str
    created_at: float
    model: Optional[str] = None
    provider: Optional[str] = None

    # Set only on the user node that opened a branch.
    anchor_text: Optional[str] = None
    anchor_node_id: Optional[str] = None
    context_mode: ContextMode = "path"

    usage: Usage = field(default_factory=Usage)
    collapsed: bool = False

    # Canvas affordances.
    starred: bool = False
    # Assigned once at branch creation; see Tree.next_color_slot.
    color_slot: Optional[int] = None

    # Notes provenance. `noted` means the whole message was clipped, which may
    # happen only once -- re-clipping it would just duplicate the same text.
    # `clip_count` counts excerpts, which are deliberately unlimited: pulling
    # three different sentences out of one reply is a normal thing to want.
    noted: bool = False
    clip_count: int = 0
    # Free position on the graph playground; None means auto-layout.
    x: Optional[float] = None
    y: Optional[float] = None

    @property
    def is_branch_root(self) -> bool:
        return self.anchor_text is not None


class Tree:
    def __init__(self) -> None:
        self.nodes: dict[str, Node] = {}
        self._children: dict[Optional[str], list[str]] = {None: []}

    # -- construction ----------------------------------------------------

    def add(
        self,
        role: Role,
        content: str,
        parent_id: Optional[str] = None,
        **kwargs,
    ) -> Node:
        if parent_id is not None and parent_id not in self.nodes:
            raise KeyError(f"no such parent: {parent_id}")

        node = Node(
            id=uuid.uuid4().hex[:12],
            parent_id=parent_id,
            role=role,
            content=content,
            created_at=time.time(),
            **kwargs,
        )
        self.nodes[node.id] = node
        self._children.setdefault(parent_id, []).append(node.id)
        self._children.setdefault(node.id, [])
        return node

    # -- traversal -------------------------------------------------------

    def path_to_root(self, node_id: str) -> list[Node]:
        """Ancestors oldest-first, including the node itself."""
        path: list[Node] = []
        cur: Optional[str] = node_id
        while cur is not None:
            node = self.nodes[cur]
            path.append(node)
            cur = node.parent_id
        path.reverse()
        return path

    def children_of(self, node_id: Optional[str]) -> list[Node]:
        return [self.nodes[c] for c in self._children.get(node_id, [])]

    def roots(self) -> list[Node]:
        """Independent conversations. The playground can hold several."""
        return self.children_of(None)

    def next_color_slot(self) -> int:
        """Slot for the next branch.

        Colour must follow the entity, not its rank -- pruning branch #1 must
        not repaint #2 and #3. So the slot is allocated once here, stored on the
        node, and never recomputed. Using a high-water mark rather than a live
        count means a pruned slot is retired instead of being handed to the next
        branch, which would silently re-use a colour still on screen elsewhere.
        """
        used = [n.color_slot for n in self.nodes.values() if n.color_slot is not None]
        return max(used) + 1 if used else 0

    def subtree_ids(self, node_id: str) -> list[str]:
        """`node_id` and every descendant, depth-first."""
        out: list[str] = []
        stack = [node_id]
        while stack:
            cur = stack.pop()
            out.append(cur)
            stack.extend(self._children.get(cur, []))
        return out

    def branches_from(self, node_id: str) -> list[Node]:
        """Children of `node_id` that opened a new line of questioning."""
        return [c for c in self.children_of(node_id) if c.is_branch_root]

    def main_child(self, node_id: str) -> Optional[Node]:
        """The child that continues the thread rather than branching off it."""
        for c in self.children_of(node_id):
            if not c.is_branch_root:
                return c
        return None

    # -- mutation --------------------------------------------------------

    def prune(self, node_id: str) -> list[str]:
        """Delete a node and everything under it. Returns the removed ids."""
        removed = self.subtree_ids(node_id)
        parent = self.nodes[node_id].parent_id
        for rid in removed:
            self.nodes.pop(rid, None)
            self._children.pop(rid, None)
        siblings = self._children.get(parent, [])
        if node_id in siblings:
            siblings.remove(node_id)
        return removed

    # -- serialization ---------------------------------------------------

    def to_dict(self) -> dict:
        return {
            "nodes": {nid: asdict(n) for nid, n in self.nodes.items()},
            "children": {str(k): v for k, v in self._children.items()},
        }
