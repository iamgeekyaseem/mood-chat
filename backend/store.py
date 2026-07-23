"""SQLite persistence. One row per node; the tree is rebuilt from parent_id."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Optional

from attachments import Attachment
from tree import Node, Tree, Usage


def _fts_query(raw: str) -> str:
    """Turn arbitrary user input into a safe FTS5 MATCH expression.

    FTS5 has its own query grammar (AND/OR/NEAR/quotes/columns), and feeding it
    raw text throws on stray operators. Each whitespace term is quoted as a
    phrase — which neutralises every special character — and given a trailing
    prefix `*` so search matches as you type. Terms are implicitly ANDed.
    """
    terms = [t for t in raw.split() if t.strip()]
    parts: list[str] = []
    for t in terms:
        escaped = t.replace('"', '""')
        parts.append(f'"{escaped}" *')
    return " ".join(parts)

SCHEMA = """
CREATE TABLE IF NOT EXISTS trees (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
    id             TEXT PRIMARY KEY,
    tree_id        TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    parent_id      TEXT,
    role           TEXT NOT NULL,
    content        TEXT NOT NULL,
    created_at     REAL NOT NULL,
    model          TEXT,
    provider       TEXT,
    anchor_text    TEXT,
    anchor_node_id TEXT,
    context_mode   TEXT NOT NULL DEFAULT 'path',
    usage          TEXT NOT NULL DEFAULT '{}',
    collapsed      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nodes_tree ON nodes(tree_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(tree_id, parent_id);

CREATE TABLE IF NOT EXISTS attachments (
    id          TEXT PRIMARY KEY,
    tree_id     TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    mime        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    created_at  REAL NOT NULL,
    x           REAL,
    y           REAL
);

-- Many-to-many: one file can feed several questions, and a question can carry
-- several files.
CREATE TABLE IF NOT EXISTS node_attachments (
    node_id       TEXT NOT NULL,
    attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_att_tree ON attachments(tree_id);

CREATE TABLE IF NOT EXISTS notes (
    tree_id     TEXT PRIMARY KEY REFERENCES trees(id) ON DELETE CASCADE,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  REAL NOT NULL
);

-- Full-text index over message content. FTS5 has no foreign keys, so it is
-- kept in sync by hand: every save/delete mirrors into it, and delete_tree
-- clears its rows. node_id and tree_id are carried UNINDEXED so a hit can be
-- located and scoped without a join back.
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    content,
    node_id UNINDEXED,
    tree_id UNINDEXED,
    tokenize = 'unicode61'
);
"""

# Columns added after the first release. Applied idempotently on open so an
# existing ~/.branch/branch.db keeps working instead of erroring on startup.
MIGRATIONS: list[tuple[str, str]] = [
    ("starred", "ALTER TABLE nodes ADD COLUMN starred INTEGER NOT NULL DEFAULT 0"),
    ("color_slot", "ALTER TABLE nodes ADD COLUMN color_slot INTEGER"),
    ("x", "ALTER TABLE nodes ADD COLUMN x REAL"),
    ("y", "ALTER TABLE nodes ADD COLUMN y REAL"),
    ("noted", "ALTER TABLE nodes ADD COLUMN noted INTEGER NOT NULL DEFAULT 0"),
    (
        "clip_count",
        "ALTER TABLE nodes ADD COLUMN clip_count INTEGER NOT NULL DEFAULT 0",
    ),
    ("stopped", "ALTER TABLE nodes ADD COLUMN stopped INTEGER NOT NULL DEFAULT 0"),
]

# Tables added after the first release, created idempotently on open. Kept
# separate from column MIGRATIONS because CREATE IF NOT EXISTS is self-guarding.
EXTRA_TABLES = """
CREATE TABLE IF NOT EXISTS templates (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Notes scoped to a session (a root node) rather than the whole tree, so the
-- independent sessions on one canvas keep separate findings docs.
CREATE TABLE IF NOT EXISTS session_notes (
    tree_id    TEXT NOT NULL,
    session_id TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    updated_at REAL NOT NULL,
    PRIMARY KEY (tree_id, session_id)
);
"""


class Store:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SCHEMA)
        self.db.executescript(EXTRA_TABLES)
        self._migrate()
        self._migrate_notes_to_sessions()
        self._backfill_fts()
        self.db.commit()

    def _migrate(self) -> None:
        existing = {r["name"] for r in self.db.execute("PRAGMA table_info(nodes)")}
        for column, ddl in MIGRATIONS:
            if column not in existing:
                self.db.execute(ddl)

    def _migrate_notes_to_sessions(self) -> None:
        """Move any legacy per-tree note onto that tree's earliest root session.

        Runs once: after the copy, the old `notes` row is cleared so a second
        launch doesn't re-import it over edits made since. Nothing is lost — a
        conversation's single old doc becomes its first session's doc.
        """
        rows = self.db.execute(
            "SELECT tree_id, content FROM notes WHERE content != ''"
        ).fetchall()
        for r in rows:
            root = self.db.execute(
                "SELECT id FROM nodes WHERE tree_id = ? AND parent_id IS NULL"
                " ORDER BY created_at LIMIT 1",
                (r["tree_id"],),
            ).fetchone()
            if root is None:
                continue
            # Don't clobber a session doc that already exists.
            exists = self.db.execute(
                "SELECT 1 FROM session_notes WHERE tree_id = ? AND session_id = ?",
                (r["tree_id"], root["id"]),
            ).fetchone()
            if exists is None:
                self.db.execute(
                    "INSERT INTO session_notes (tree_id, session_id, content, updated_at)"
                    " VALUES (?,?,?,?)",
                    (r["tree_id"], root["id"], r["content"], time.time()),
                )
            self.db.execute(
                "UPDATE notes SET content = '' WHERE tree_id = ?", (r["tree_id"],)
            )

    def _backfill_fts(self) -> None:
        """Populate the search index from existing nodes on first run after the
        index was added, so search works over history, not just new messages."""
        indexed = self.db.execute("SELECT COUNT(*) AS n FROM nodes_fts").fetchone()["n"]
        total = self.db.execute("SELECT COUNT(*) AS n FROM nodes").fetchone()["n"]
        if indexed >= total:
            return
        self.db.execute("DELETE FROM nodes_fts")
        self.db.execute(
            "INSERT INTO nodes_fts (content, node_id, tree_id)"
            " SELECT content, id, tree_id FROM nodes"
        )

    def _fts_upsert(self, node_id: str, tree_id: str, content: str) -> None:
        self.db.execute("DELETE FROM nodes_fts WHERE node_id = ?", (node_id,))
        self.db.execute(
            "INSERT INTO nodes_fts (content, node_id, tree_id) VALUES (?,?,?)",
            (content, node_id, tree_id),
        )

    # -- trees -----------------------------------------------------------

    def create_tree(self, tree_id: str, title: str) -> None:
        now = time.time()
        self.db.execute(
            "INSERT INTO trees (id, title, created_at, updated_at) VALUES (?,?,?,?)",
            (tree_id, title, now, now),
        )
        self.db.commit()

    def list_trees(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT id, title, created_at, updated_at FROM trees"
            " ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def tree_counts(self, tree_id: str) -> dict:
        """Summary numbers for the sidebar."""
        row = self.db.execute(
            """SELECT COUNT(*) AS nodes,
                      SUM(CASE WHEN anchor_text IS NOT NULL THEN 1 ELSE 0 END) AS branches,
                      SUM(starred) AS starred
                 FROM nodes WHERE tree_id = ?""",
            (tree_id,),
        ).fetchone()
        return {
            "nodes": row["nodes"] or 0,
            "branches": row["branches"] or 0,
            "starred": row["starred"] or 0,
        }

    def first_message(self, tree_id: str) -> str:
        """Opening user message, used to auto-title a conversation."""
        row = self.db.execute(
            "SELECT content FROM nodes WHERE tree_id = ? AND role = 'user'"
            " ORDER BY created_at LIMIT 1",
            (tree_id,),
        ).fetchone()
        return row["content"] if row else ""

    def rename_tree(self, tree_id: str, title: str) -> None:
        self.db.execute(
            "UPDATE trees SET title = ?, updated_at = ? WHERE id = ?",
            (title, time.time(), tree_id),
        )
        self.db.commit()

    def delete_tree(self, tree_id: str) -> None:
        # Nodes cascade via FK; the FTS mirror has no FK, so clear it here.
        self.db.execute("DELETE FROM nodes_fts WHERE tree_id = ?", (tree_id,))
        self.db.execute("DELETE FROM trees WHERE id = ?", (tree_id,))
        self.db.commit()

    # -- search ----------------------------------------------------------

    def search(
        self, query: str, tree_id: Optional[str] = None, limit: int = 40
    ) -> list[dict]:
        """Full-text search over message content.

        Scoped to one conversation when `tree_id` is given, otherwise across
        all of them. Returns ranked hits with a highlighted snippet and enough
        context to jump straight to the message.
        """
        match = _fts_query(query)
        if not match:
            return []

        sql = """
            SELECT f.node_id, f.tree_id, t.title AS tree_title,
                   n.role, n.anchor_text, n.created_at,
                   snippet(nodes_fts, 0, '\x02', '\x03', '…', 12) AS snippet
              FROM nodes_fts f
              JOIN nodes n ON n.id = f.node_id
              JOIN trees t ON t.id = f.tree_id
             WHERE nodes_fts MATCH ?
        """
        params: list = [match]
        if tree_id is not None:
            sql += " AND f.tree_id = ?"
            params.append(tree_id)
        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)

        try:
            rows = self.db.execute(sql, params).fetchall()
        except sqlite3.OperationalError:
            # A malformed FTS expression that slipped past _fts_query — treat as
            # no results rather than surfacing a SQL error to the UI.
            return []
        return [dict(r) for r in rows]

    # -- nodes -----------------------------------------------------------

    def save_node(self, tree_id: str, node: Node) -> None:
        self.db.execute(
            """INSERT OR REPLACE INTO nodes
               (id, tree_id, parent_id, role, content, created_at, model,
                provider, anchor_text, anchor_node_id, context_mode, usage,
                collapsed, starred, color_slot, x, y, noted, clip_count, stopped)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                node.id,
                tree_id,
                node.parent_id,
                node.role,
                node.content,
                node.created_at,
                node.model,
                node.provider,
                node.anchor_text,
                node.anchor_node_id,
                node.context_mode,
                json.dumps(node.usage.__dict__),
                int(node.collapsed),
                int(node.starred),
                node.color_slot,
                node.x,
                node.y,
                int(node.noted),
                node.clip_count,
                int(node.stopped),
            ),
        )
        self._fts_upsert(node.id, tree_id, node.content)
        self.db.execute(
            "UPDATE trees SET updated_at = ? WHERE id = ?", (time.time(), tree_id)
        )
        self.db.commit()

    def delete_nodes(self, node_ids: list[str]) -> None:
        if not node_ids:
            return
        placeholders = ",".join("?" * len(node_ids))
        self.db.execute(
            f"DELETE FROM nodes WHERE id IN ({placeholders})", node_ids
        )
        self.db.execute(
            f"DELETE FROM nodes_fts WHERE node_id IN ({placeholders})", node_ids
        )
        self.db.commit()

    def load_tree(self, tree_id: str) -> Tree:
        rows = self.db.execute(
            "SELECT * FROM nodes WHERE tree_id = ? ORDER BY created_at",
            (tree_id,),
        ).fetchall()

        tree = Tree()
        for r in rows:
            node = Node(
                id=r["id"],
                parent_id=r["parent_id"],
                role=r["role"],
                content=r["content"],
                created_at=r["created_at"],
                model=r["model"],
                provider=r["provider"],
                anchor_text=r["anchor_text"],
                anchor_node_id=r["anchor_node_id"],
                context_mode=r["context_mode"],
                usage=Usage(**json.loads(r["usage"])),
                collapsed=bool(r["collapsed"]),
                starred=bool(r["starred"]),
                color_slot=r["color_slot"],
                x=r["x"],
                y=r["y"],
                noted=bool(r["noted"]),
                clip_count=r["clip_count"],
                stopped=bool(r["stopped"]),
            )
            tree.nodes[node.id] = node
            tree._children.setdefault(node.parent_id, []).append(node.id)
            tree._children.setdefault(node.id, [])
        return tree

    # -- attachments -----------------------------------------------------

    def save_attachment(self, att: Attachment) -> None:
        self.db.execute(
            """INSERT OR REPLACE INTO attachments
               (id, tree_id, name, path, mime, size, created_at, x, y)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                att.id,
                att.tree_id,
                att.name,
                att.path,
                att.mime,
                att.size,
                att.created_at,
                att.x,
                att.y,
            ),
        )
        self.db.commit()

    def list_attachments(self, tree_id: str) -> list[Attachment]:
        rows = self.db.execute(
            "SELECT * FROM attachments WHERE tree_id = ? ORDER BY created_at",
            (tree_id,),
        ).fetchall()
        return [Attachment(**dict(r)) for r in rows]

    def delete_attachment(self, attachment_id: str) -> None:
        self.db.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
        self.db.execute(
            "DELETE FROM node_attachments WHERE attachment_id = ?", (attachment_id,)
        )
        self.db.commit()

    def link_attachment(self, node_id: str, attachment_id: str) -> None:
        self.db.execute(
            "INSERT OR IGNORE INTO node_attachments (node_id, attachment_id)"
            " VALUES (?,?)",
            (node_id, attachment_id),
        )
        self.db.commit()

    def unlink_attachment(self, node_id: str, attachment_id: str) -> None:
        self.db.execute(
            "DELETE FROM node_attachments WHERE node_id = ? AND attachment_id = ?",
            (node_id, attachment_id),
        )
        self.db.commit()

    def links(self, tree_id: str) -> list[dict]:
        rows = self.db.execute(
            """SELECT na.node_id, na.attachment_id FROM node_attachments na
               JOIN attachments a ON a.id = na.attachment_id
               WHERE a.tree_id = ?""",
            (tree_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def orphan_attachments_after_removing(self, node_ids: list[str]) -> list[Attachment]:
        """Drop links from removed nodes, then return attachments left orphaned.

        node_attachments has no foreign key back to nodes (a file can outlive
        any single message), so pruning a subtree leaves dangling links behind.
        This clears those links and reports the files that no longer belong to
        any message, so the caller can unlink them from disk.
        """
        if not node_ids:
            return []
        placeholders = ",".join("?" * len(node_ids))
        candidates = [
            r["attachment_id"]
            for r in self.db.execute(
                f"SELECT DISTINCT attachment_id FROM node_attachments"
                f" WHERE node_id IN ({placeholders})",
                node_ids,
            ).fetchall()
        ]
        self.db.execute(
            f"DELETE FROM node_attachments WHERE node_id IN ({placeholders})",
            node_ids,
        )
        orphans: list[Attachment] = []
        for aid in candidates:
            still = self.db.execute(
                "SELECT 1 FROM node_attachments WHERE attachment_id = ? LIMIT 1",
                (aid,),
            ).fetchone()
            if still:
                continue
            row = self.db.execute(
                "SELECT * FROM attachments WHERE id = ?", (aid,)
            ).fetchone()
            if row:
                orphans.append(Attachment(**dict(row)))
        self.db.commit()
        return orphans

    def attachments_for_nodes(self, node_ids: list[str]) -> list[Attachment]:
        if not node_ids:
            return []
        placeholders = ",".join("?" * len(node_ids))
        rows = self.db.execute(
            f"""SELECT DISTINCT a.* FROM attachments a
                JOIN node_attachments na ON na.attachment_id = a.id
                WHERE na.node_id IN ({placeholders})
                ORDER BY a.created_at""",
            node_ids,
        ).fetchall()
        return [Attachment(**dict(r)) for r in rows]

    # -- notes -----------------------------------------------------------
    #
    # Notes are scoped to a session, not a whole conversation. A "session" is a
    # root node (a conversation can hold several independent roots on one
    # canvas), so its findings doc is keyed by (tree_id, session_id). Legacy
    # per-tree notes were migrated onto each tree's earliest root in _migrate.

    def get_notes(self, tree_id: str, session_id: str) -> str:
        if not session_id:
            return ""
        row = self.db.execute(
            "SELECT content FROM session_notes WHERE tree_id = ? AND session_id = ?",
            (tree_id, session_id),
        ).fetchone()
        return row["content"] if row else ""

    def set_notes(self, tree_id: str, session_id: str, content: str) -> None:
        if not session_id:
            return
        self.db.execute(
            """INSERT INTO session_notes (tree_id, session_id, content, updated_at)
               VALUES (?,?,?,?)
               ON CONFLICT(tree_id, session_id) DO UPDATE SET
                   content = excluded.content, updated_at = excluded.updated_at""",
            (tree_id, session_id, content, time.time()),
        )
        self.db.commit()

    def append_note(self, tree_id: str, session_id: str, markdown: str) -> str:
        current = self.get_notes(tree_id, session_id)
        joined = f"{current.rstrip()}\n\n{markdown}".lstrip() if current else markdown
        self.set_notes(tree_id, session_id, joined)
        return joined

    # -- templates -------------------------------------------------------

    def list_templates(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT id, title, body, created_at FROM templates ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def save_template(self, template_id: str, title: str, body: str) -> None:
        self.db.execute(
            """INSERT INTO templates (id, title, body, created_at) VALUES (?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET title = excluded.title,
                                             body = excluded.body""",
            (template_id, title, body, time.time()),
        )
        self.db.commit()

    def delete_template(self, template_id: str) -> None:
        self.db.execute("DELETE FROM templates WHERE id = ?", (template_id,))
        self.db.commit()

    # -- settings --------------------------------------------------------

    def get_settings(self) -> dict:
        rows = self.db.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows}

    def set_setting(self, key: str, value: str) -> None:
        self.db.execute(
            """INSERT INTO settings (key, value) VALUES (?,?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
            (key, value),
        )
        self.db.commit()

    def close(self) -> None:
        self.db.close()
