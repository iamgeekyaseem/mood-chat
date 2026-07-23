"""Full-text search: the FTS index stays in sync with nodes."""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import pytest

from store import Store, _fts_query
from tree import Tree


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "s.db")
    s.create_tree("t1", "Statistics")
    s.create_tree("t2", "Cooking")
    yield s
    s.close()


def seed(store):
    t1 = Tree()
    q = t1.add("user", "explain the p value in regression")
    a = t1.add("assistant", "A p-value measures statistical significance", parent_id=q.id)
    for n in (q, a):
        store.save_node("t1", n)
    t2 = Tree()
    c = t2.add("user", "how do I sear a steak properly")
    store.save_node("t2", c)
    return q, a, c


# -- query builder ----------------------------------------------------------


def test_fts_query_quotes_terms_and_adds_prefix():
    assert _fts_query("p val") == '"p" * "val" *'


def test_fts_query_neutralises_operators():
    # AND/OR/quotes/parens must not act as FTS grammar.
    built = _fts_query('AND "or" (x)')
    assert built == '"AND" * """or""" * "(x)" *'


def test_empty_query_is_empty():
    assert _fts_query("   ") == ""


# -- search behaviour -------------------------------------------------------


def test_finds_across_conversations(store):
    seed(store)
    hits = store.search("value")
    titles = {h["tree_title"] for h in hits}
    assert titles == {"Statistics"}
    assert any("\x02" in h["snippet"] for h in hits)  # match is marked


def test_prefix_matches_as_you_type(store):
    seed(store)
    assert store.search("signif")  # "significance"
    assert store.search("reg")     # "regression"


def test_scope_limits_to_one_tree(store):
    seed(store)
    assert store.search("steak", tree_id="t2")
    assert store.search("steak", tree_id="t1") == []


def test_malformed_query_returns_no_error(store):
    seed(store)
    assert store.search("((( AND") == []
    assert store.search("") == []


# -- index sync -------------------------------------------------------------


def test_editing_a_node_updates_the_index(store):
    t = Tree()
    n = t.add("assistant", "first draft about apples")
    store.save_node("t1", n)
    assert store.search("apples")

    n.content = "revised text about oranges"
    store.save_node("t1", n)

    # Old term gone, new term found — no stale duplicate.
    assert store.search("apples") == []
    assert store.search("oranges")


def test_deleting_nodes_clears_the_index(store):
    t = Tree()
    n = t.add("user", "ephemeral mention of quokkas")
    store.save_node("t1", n)
    assert store.search("quokkas")

    store.delete_nodes([n.id])
    assert store.search("quokkas") == []


def test_deleting_a_tree_clears_its_index(store):
    seed(store)
    assert store.search("steak")
    store.delete_tree("t2")
    assert store.search("steak") == []


def test_backfill_indexes_pre_search_databases(tmp_path):
    """A database written before search existed gets indexed on open."""
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
             VALUES ('n1', 't1', NULL, 'user', 'a legacy note about penguins', 0);
        """
    )
    old.commit()
    old.close()

    s = Store(path)
    assert s.search("penguins")  # indexed by the backfill, not a fresh write
    s.close()
