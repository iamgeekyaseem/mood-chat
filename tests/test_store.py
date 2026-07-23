import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import pytest

from store import Store
from tree import Tree


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "test.db")
    yield s
    s.close()


def test_roundtrip_preserves_structure(store):
    store.create_tree("t1", "Stats")

    t = Tree()
    q1 = t.add("user", "explain regression")
    a1 = t.add("assistant", "the p value tells you...", parent_id=q1.id)
    branch = t.add(
        "user", "what is a p value?", parent_id=a1.id, anchor_text="p value"
    )
    cont = t.add("user", "show me the code", parent_id=a1.id)

    for n in (q1, a1, branch, cont):
        store.save_node("t1", n)

    loaded = store.load_tree("t1")

    assert len(loaded.nodes) == 4
    assert loaded.path_to_root(branch.id)[0].content == "explain regression"
    # The branch/continuation distinction has to survive the round trip --
    # it drives which column the node renders in.
    assert [n.id for n in loaded.branches_from(a1.id)] == [branch.id]
    assert loaded.main_child(a1.id).id == cont.id


def test_usage_survives_roundtrip(store):
    store.create_tree("t1", "Stats")
    t = Tree()
    n = t.add("assistant", "hi")
    n.usage.input_tokens = 120
    n.usage.cache_read_input_tokens = 4200
    store.save_node("t1", n)

    loaded = store.load_tree("t1")
    got = loaded.nodes[n.id].usage

    assert got.input_tokens == 120
    assert got.cache_read_input_tokens == 4200
    # 120 + 4200*0.1 -- the cached branch bills like a short one.
    assert got.billed_input == pytest.approx(540.0)


def test_deleting_nodes_leaves_the_rest(store):
    store.create_tree("t1", "Stats")
    t = Tree()
    root = t.add("user", "root")
    keep = t.add("assistant", "keep me", parent_id=root.id)
    drop = t.add("user", "drop me", parent_id=keep.id, anchor_text="x")
    for n in (root, keep, drop):
        store.save_node("t1", n)

    store.delete_nodes(t.prune(drop.id))
    loaded = store.load_tree("t1")

    assert set(loaded.nodes) == {root.id, keep.id}


def test_deleting_a_tree_cascades_to_its_nodes(store):
    store.create_tree("t1", "Stats")
    t = Tree()
    n = t.add("user", "hello")
    store.save_node("t1", n)

    store.delete_tree("t1")

    assert store.list_trees() == []
    assert store.load_tree("t1").nodes == {}
