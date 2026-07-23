"""Roadmap batch: stopped flag, attachment pruning, templates, settings,
branch/tree export and import, PDF extraction, and the local-search gate."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import pytest

from attachments import Attachment
from store import Store
from tree import Tree


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "t.db")
    yield s
    s.close()


# -- stopped flag -----------------------------------------------------------


def test_stopped_flag_survives_roundtrip(store):
    store.create_tree("t1", "T")
    t = Tree()
    a = t.add("assistant", "half an answer")
    a.stopped = True
    store.save_node("t1", a)

    loaded = store.load_tree("t1")
    assert loaded.nodes[a.id].stopped is True


def test_stopped_defaults_false(store):
    store.create_tree("t1", "T")
    t = Tree()
    a = t.add("assistant", "done")
    store.save_node("t1", a)
    assert store.load_tree("t1").nodes[a.id].stopped is False


# -- orphan attachment pruning ----------------------------------------------


def _att(store, tree_id, aid, path):
    a = Attachment(
        id=aid,
        tree_id=tree_id,
        name=f"{aid}.txt",
        path=str(path),
        mime="text/plain",
        size=1,
        created_at=time.time(),
    )
    store.save_attachment(a)
    return a


def test_orphan_attachment_is_reported_after_prune(store, tmp_path):
    store.create_tree("t1", "T")
    f = tmp_path / "only.txt"
    f.write_text("x")
    _att(store, "t1", "a" * 12, f)
    store.link_attachment("node1", "a" * 12)

    orphans = store.orphan_attachments_after_removing(["node1"])
    assert [o.id for o in orphans] == ["a" * 12]
    # Link is gone.
    assert store.links("t1") == []


def test_shared_attachment_is_not_orphaned(store, tmp_path):
    """A file linked to a surviving node must not be pruned."""
    store.create_tree("t1", "T")
    f = tmp_path / "shared.txt"
    f.write_text("x")
    _att(store, "t1", "b" * 12, f)
    store.link_attachment("gone", "b" * 12)
    store.link_attachment("kept", "b" * 12)

    orphans = store.orphan_attachments_after_removing(["gone"])
    assert orphans == []
    # Still linked to the surviving node.
    assert {l["node_id"] for l in store.links("t1")} == {"kept"}


# -- templates --------------------------------------------------------------


def test_template_crud(store):
    store.save_template("tpl1", "Bug report", "Describe the bug:\n")
    store.save_template("tpl2", "Review", "Review this code:\n")
    listed = store.list_templates()
    assert {t["id"] for t in listed} == {"tpl1", "tpl2"}

    store.save_template("tpl1", "Bug report v2", "updated")
    again = {t["id"]: t for t in store.list_templates()}
    assert again["tpl1"]["title"] == "Bug report v2"

    store.delete_template("tpl2")
    assert {t["id"] for t in store.list_templates()} == {"tpl1"}


# -- settings ---------------------------------------------------------------


def test_settings_roundtrip(store):
    assert store.get_settings() == {}
    store.set_setting("branch_model", "gemma3:4b")
    assert store.get_settings()["branch_model"] == "gemma3:4b"
    store.set_setting("branch_model", "claude-opus-4-8")
    assert store.get_settings()["branch_model"] == "claude-opus-4-8"


# -- branch markdown + tree json --------------------------------------------


def test_branch_markdown_is_the_path_only():
    from app import _branch_markdown

    t = Tree()
    q = t.add("user", "explain regression")
    a = t.add("assistant", "the p value tells you significance", parent_id=q.id)
    branch = t.add(
        "user", "what is a p value?", parent_id=a.id, anchor_text="p value"
    )
    b_ans = t.add("assistant", "it is the probability under the null", parent_id=branch.id)
    # A sibling on a different path must not appear.
    t.add("user", "unrelated sibling", parent_id=a.id)

    md = _branch_markdown(t, b_ans.id)
    assert "explain regression" in md
    assert "branched from: “p value”" in md
    assert "it is the probability under the null" in md
    assert "unrelated sibling" not in md


def test_tree_json_roundtrip_remaps_ids():
    from app import _tree_from_dict

    t = Tree()
    q = t.add("user", "root question")
    a = t.add("assistant", "root answer", parent_id=q.id)
    t.add("user", "branch", parent_id=a.id, anchor_text="answer")

    rebuilt = _tree_from_dict(t.to_dict())
    assert len(rebuilt.nodes) == 3
    # Ids are fresh, structure preserved.
    assert set(rebuilt.nodes) != set(t.nodes)
    roots = rebuilt.roots()
    assert len(roots) == 1
    assert roots[0].content == "root question"
    child = rebuilt.main_child(roots[0].id)
    assert child.content == "root answer"
    assert len(rebuilt.branches_from(child.id)) == 1


def test_stopped_marker_in_markdown():
    from app import _branch_markdown

    t = Tree()
    q = t.add("user", "q")
    a = t.add("assistant", "partial", parent_id=q.id)
    a.stopped = True
    md = _branch_markdown(t, a.id)
    assert "(stopped)" in md


# -- local search relevance gate --------------------------------------------


@pytest.mark.parametrize(
    "query,expected",
    [
        ("what is the latest version of python", True),
        ("who won the 2024 election", True),
        ("check https://example.com for me", True),
        ("summarize the above", False),
        ("translate this to french", False),
        ("hi", False),
        ("thanks", False),
        ("how does a hash map work internally?", True),
    ],
)
def test_local_search_gate(query, expected):
    from providers.ollama_provider import _wants_search

    assert _wants_search(query) is expected
