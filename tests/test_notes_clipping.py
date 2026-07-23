"""Clip-once semantics for whole messages, unlimited for excerpts."""

import struct
import sys
import time
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

import pytest

from attachments import Attachment, guess_mime, preview
from store import Store
from tree import Tree


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path / "t.db")
    s.create_tree("t1", "x")
    yield s
    s.close()


# -- clip bookkeeping -------------------------------------------------------


def test_whole_and_excerpt_clips_are_tracked_separately(store):
    t = Tree()
    n = t.add("assistant", "a long reply")

    # Excerpts accumulate...
    n.clip_count += 1
    n.clip_count += 1
    # ...while the whole message is a one-shot flag.
    n.noted = True
    store.save_node("t1", n)

    got = store.load_tree("t1").nodes[n.id]
    assert got.noted is True
    assert got.clip_count == 2


def test_defaults_are_unclipped():
    n = Tree().add("assistant", "reply")
    assert n.noted is False
    assert n.clip_count == 0


def test_pre_migration_rows_default_to_unclipped(tmp_path):
    import sqlite3

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
             VALUES ('n1', 't1', NULL, 'assistant', 'old reply', 0);
        """
    )
    old.commit()
    old.close()

    s = Store(path)
    n = s.load_tree("t1").nodes["n1"]
    assert n.noted is False
    assert n.clip_count == 0
    s.close()


def test_appending_twice_would_duplicate_which_is_what_noted_prevents(store):
    """The reason whole-message clips are capped at one."""
    store.append_note("t1", "s1", "> the same reply")
    store.append_note("t1", "s1", "> the same reply")

    assert store.get_notes("t1", "s1").count("the same reply") == 2


# -- previews ---------------------------------------------------------------


def make_png(path: Path, w: int = 400, h: int = 300) -> Path:
    rows = b"".join(b"\x00" + bytes((10, 120, 200)) * w for _ in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return (
            struct.pack(">I", len(data))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )
    return path


def att_for(path: Path) -> Attachment:
    return Attachment(
        id="a1", tree_id="t1", name=path.name, path=str(path),
        mime=guess_mime(path), size=path.stat().st_size, created_at=time.time(),
    )


def test_image_preview_is_a_downscaled_data_uri(tmp_path):
    p = make_png(tmp_path / "big.png", 800, 600)
    got = preview(att_for(p))

    assert got["type"] == "image"
    assert got["data_uri"].startswith("data:image/jpeg;base64,")
    # A thumbnail, not the original re-encoded at full size.
    assert len(got["data_uri"]) < p.stat().st_size


def test_text_preview_shows_opening_lines(tmp_path):
    p = tmp_path / "notes.md"
    p.write_text("line one\nline two\nline three\n" + "filler\n" * 200)
    got = preview(att_for(p))

    assert got["type"] == "text"
    assert "line one" in got["text"]
    assert len(got["text"]) <= 400


def test_pdf_says_it_has_no_preview_rather_than_faking_one(tmp_path):
    p = tmp_path / "doc.pdf"
    p.write_bytes(b"%PDF-1.4\n")
    got = preview(att_for(p))

    assert got["type"] == "none"
    assert "PDF" in got["note"]


def test_missing_file_preview(tmp_path):
    att = Attachment(
        id="a1", tree_id="t1", name="gone.png", path=str(tmp_path / "gone.png"),
        mime="image/png", size=0, created_at=time.time(),
    )
    assert preview(att)["type"] == "missing"


def test_corrupt_image_degrades_to_no_preview(tmp_path):
    p = tmp_path / "broken.png"
    p.write_bytes(b"\x89PNG\r\n\x1a\nnot actually a png")
    got = preview(att_for(p))

    # The attachment stays usable; only the preview is absent.
    assert got["type"] == "none"
