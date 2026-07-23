import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from context import assemble
from tree import Tree


def build_thread() -> tuple[Tree, str]:
    """A short main thread: two exchanges. Returns the tree and the last node."""
    t = Tree()
    q1 = t.add("user", "explain regression")
    a1 = t.add("assistant", "...the p value tells you whether...", parent_id=q1.id)
    q2 = t.add("user", "now show me the code", parent_id=a1.id)
    a2 = t.add("assistant", "here is the code", parent_id=q2.id)
    return t, a1.id


def test_path_mode_sends_only_ancestors():
    t, a1 = build_thread()
    ctx = assemble(t, a1, "what is a p value?", mode="path", anchor_text="p value")

    # root question, root answer, plus the new question -- and crucially NOT
    # the "now show me the code" exchange that hangs off a1 separately.
    assert len(ctx.messages) == 3
    texts = [str(m["content"]) for m in ctx.messages]
    assert "now show me the code" not in " ".join(texts)


def test_siblings_share_a_byte_identical_prefix():
    """This is the property prompt caching depends on."""
    t, a1 = build_thread()
    first = assemble(t, a1, "what is a p value?", mode="path")
    second = assemble(t, a1, "what is p-hacking?", mode="path")

    assert first.messages[:-1] == second.messages[:-1]
    assert first.messages[-1] != second.messages[-1]


def test_cache_breakpoint_is_on_the_prefix_not_the_question():
    t, a1 = build_thread()
    ctx = assemble(t, a1, "what is a p value?", mode="path")

    assert ctx.cache_marked
    assert ctx.messages[-2]["content"][-1]["cache_control"]["type"] == "ephemeral"
    # The new question must stay unmarked, or every request writes a fresh
    # cache entry and none is ever read.
    assert isinstance(ctx.messages[-1]["content"], str)


def test_minimal_mode_keeps_the_prompting_question():
    t, a1 = build_thread()
    ctx = assemble(t, a1, "define it", mode="minimal", anchor_text="p value")

    assert len(ctx.messages) == 3
    assert "p value" in ctx.messages[-1]["content"]


def test_no_cache_marker_when_provider_lacks_caching():
    t, a1 = build_thread()
    ctx = assemble(t, a1, "hi", mode="path", supports_caching=False)

    assert not ctx.cache_marked
    assert all(isinstance(m["content"], str) for m in ctx.messages)


def test_prune_removes_the_whole_subtree():
    t, a1 = build_thread()
    branch = t.add("user", "what is a p value?", parent_id=a1, anchor_text="p value")
    t.add("assistant", "it is a probability", parent_id=branch.id)

    removed = t.prune(branch.id)

    assert len(removed) == 2
    assert branch.id not in t.nodes
    assert t.branches_from(a1) == []
    # The main thread is untouched.
    assert t.main_child(a1) is not None


def test_branches_and_main_child_are_distinguished():
    t, a1 = build_thread()
    t.add("user", "what is a p value?", parent_id=a1, anchor_text="p value")

    assert len(t.branches_from(a1)) == 1
    assert t.main_child(a1).content == "now show me the code"
