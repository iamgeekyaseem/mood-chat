"""Identifier validation for the JS↔Python boundary.

Every id (tree, node, attachment) is minted here as `uuid.uuid4().hex[:12]` —
twelve lowercase hex characters. The frontend hands these ids back on almost
every call, and some of them become filesystem path components
(`~/.branch/files/<tree_id>/…`). An unvalidated id like `../../Documents` turns
a "delete this conversation" call into "wipe an arbitrary directory".

So ids are validated at the boundary before they touch the database or the
disk. Anything that isn't hex of a sane length is rejected outright — there is
no legitimate id that contains `/`, `.`, or `\\`.
"""

from __future__ import annotations

import re
import uuid

# Minted ids are 12 hex chars; allow a bit of slack for any future widening
# while still refusing path separators, dots, and traversal.
_ID_RE = re.compile(r"^[0-9a-f]{8,64}$")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def is_valid_id(value: object) -> bool:
    return isinstance(value, str) and bool(_ID_RE.match(value))


class InvalidId(ValueError):
    """Raised when an id crossing the boundary isn't a well-formed id."""


def require_id(value: object, *, field: str = "id") -> str:
    if not is_valid_id(value):
        raise InvalidId(f"invalid {field}")
    return value  # type: ignore[return-value]
