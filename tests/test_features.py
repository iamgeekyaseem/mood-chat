"""Colour-slot stability, notes, and the schema migration."""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import pytest

from store import Store
from tree import Tree


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "t.db")
    yield s
    s.close()


# -- colour slots -----------------------------------------------------------


def test_pruning_a_branch_does_not_repaint_the_others():
    """Colour follows the entity, never its rank."""
    t = Tree()
    root = t.add("assistant", "reply")

    slots = []
    for label in ("a", "b", "c"):
        n = t.add(
            "user", label, parent_id=root.id, anchor_text=label,
            color_slot=t.next_color_slot(),
        )
        slots.append(n)

    assert [n.color_slot for n in slots] == [0, 1, 2]

    t.prune(slots[0].id)

    # The survivors keep their colours...
    assert slots[1].color_slot == 1
    assert slots[2].color_slot == 2
    # ...and the freed slot is retired rather than reissued, so a new branch
    # cannot take a colour still shown elsewhere on the canvas.
    fresh = t.add(
        "user", "d", parent_id=root.id, anchor_text="d",
        color_slot=t.next_color_slot(),
    )
    assert fresh.color_slot == 3


def test_only_branches_get_a_colour_slot():
    t = Tree()
    root = t.add("assistant", "reply")
    plain = t.add("user", "continue", parent_id=root.id)
    assert plain.color_slot is None


def test_reset_layout_clears_positions(tmp_path, monkeypatch):
    """Reset drops every manual x/y so the graph re-runs auto-layout."""
    import app as app_module

    monkeypatch.setattr(app_module, "APP_DIR", tmp_path / ".branch")
    api = app_module.Api.__new__(app_module.Api)
    api.store = Store(tmp_path / ".branch" / "branch.db")
    api.store.create_tree("t1", "x")
    api.tree_id = "t1"
    api.tree = Tree()

    dragged = api.tree.add("user", "moved node")
    dragged.x, dragged.y = 400.0, -120.0
    untouched = api.tree.add("assistant", "auto node", parent_id=dragged.id)
    api.store.save_node("t1", dragged)
    api.store.save_node("t1", untouched)

    res = app_module.Api.reset_layout(api)

    assert dragged.id in res["nodes"]
    assert untouched.id not in res["nodes"]  # never had a manual position
    reloaded = api.store.load_tree("t1").nodes[dragged.id]
    assert reloaded.x is None and reloaded.y is None
    api.store.close()


def test_collapsed_flag_roundtrips(tmp_path):
    """Collapsing a branch is display-only — content is kept, flag persists."""
    s = Store(tmp_path / "c.db")
    s.create_tree("t1", "x")
    t = Tree()
    n = t.add("user", "important content", anchor_text="thing")
    n.collapsed = True
    s.save_node("t1", n)

    reloaded = s.load_tree("t1").nodes[n.id]
    assert reloaded.collapsed is True
    assert reloaded.content == "important content"  # kept, only display shrank
    s.close()


# -- notes ------------------------------------------------------------------


def test_append_note_accumulates(store):
    store.create_tree("t1", "Findings")

    store.append_note("t1", "> first clipping")
    result = store.append_note("t1", "> second clipping")

    assert result == "> first clipping\n\n> second clipping"
    assert store.get_notes("t1") == result


def test_first_append_has_no_leading_blank_lines(store):
    store.create_tree("t1", "Findings")
    assert store.append_note("t1", "# Findings") == "# Findings"


def test_notes_survive_reopen(tmp_path):
    s1 = Store(tmp_path / "n.db")
    s1.create_tree("t1", "x")
    s1.append_note("t1", "kept")
    s1.close()

    s2 = Store(tmp_path / "n.db")
    assert s2.get_notes("t1") == "kept"
    s2.close()


# -- migration --------------------------------------------------------------


def test_opening_a_pre_migration_database_still_works(tmp_path):
    """An existing ~/.branch/branch.db must not error on startup."""
    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.executescript(
        """
        CREATE TABLE trees (id TEXT PRIMARY KEY, title TEXT NOT NULL,
                            created_at REAL NOT NULL, updated_at REAL NOT NULL);
        CREATE TABLE nodes (
            id TEXT PRIMARY KEY, tree_id TEXT NOT NULL, parent_id TEXT,
            role TEXT NOT NULL, content TEXT NOT NULL, created_at REAL NOT NULL,
            model TEXT, provider TEXT, anchor_text TEXT, anchor_node_id TEXT,
            context_mode TEXT NOT NULL DEFAULT 'path',
            usage TEXT NOT NULL DEFAULT '{}',
            collapsed INTEGER NOT NULL DEFAULT 0);
        INSERT INTO trees VALUES ('t1', 'Legacy', 0, 0);
        INSERT INTO nodes (id, tree_id, parent_id, role, content, created_at)
             VALUES ('n1', 't1', NULL, 'user', 'from before', 0);
        """
    )
    old.commit()
    old.close()

    s = Store(path)
    loaded = s.load_tree("t1")

    assert loaded.nodes["n1"].content == "from before"
    assert loaded.nodes["n1"].starred is False
    assert loaded.nodes["n1"].color_slot is None
    s.close()


def test_starred_and_position_roundtrip(store):
    store.create_tree("t1", "x")
    t = Tree()
    n = t.add("user", "important", anchor_text="thing", color_slot=2)
    n.starred = True
    n.x, n.y = 120.5, -40.0
    store.save_node("t1", n)

    got = store.load_tree("t1").nodes[n.id]

    assert got.starred is True
    assert got.color_slot == 2
    assert (got.x, got.y) == (120.5, -40.0)
