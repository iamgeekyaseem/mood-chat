"""pywebview shell and the JS bridge.

pywebview calls Api methods on a worker thread. Streaming responses are pushed
back to the page with evaluate_js rather than returned, so the UI can render
tokens as they arrive instead of waiting for the whole turn.
"""

from __future__ import annotations

import asyncio
import base64
import json
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Optional

import webview

from attachments import Attachment, guess_mime, preview, to_blocks
from context import assemble, cache_verdict
from ids import new_id, require_id
from providers import Registry
from store import Store
from tree import Tree

APP_DIR = Path.home() / ".branch"
FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist" / "index.html"
FRONTEND_DEV = "http://localhost:5173"


class Api:
    def __init__(self) -> None:
        self.store = Store(APP_DIR / "branch.db")
        self.registry = Registry()
        self.registry.load(self._load_keys())
        self.window: Optional[webview.Window] = None
        self.tree_id: Optional[str] = None
        self.tree = Tree()
        # One cancel flag per in-flight response, checked between chunks.
        self._cancels: dict[str, threading.Event] = {}

    # -- keys ------------------------------------------------------------

    def _keys_path(self) -> Path:
        return APP_DIR / "keys.json"

    def _load_keys(self) -> dict[str, str]:
        p = self._keys_path()
        if not p.exists():
            return {}
        try:
            return json.loads(p.read_text())
        except json.JSONDecodeError:
            return {}

    def set_keys(self, keys: dict) -> dict:
        p = self._keys_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(keys, indent=2))
        p.chmod(0o600)
        self.registry = Registry()
        self.registry.load(keys)
        return self.providers()

    def providers(self) -> dict:
        # Ollama's model list is whatever is pulled locally and can change
        # between launches, so it is discovered rather than hardcoded.
        try:
            ollama = self.registry.get("ollama")
            _run_async(ollama.refresh_models())
        except KeyError:
            pass
        return self.registry.available()

    # -- trees -----------------------------------------------------------

    def list_trees(self) -> list[dict]:
        """Conversations for the sidebar, newest activity first."""
        out = []
        for row in self.store.list_trees():
            counts = self.store.tree_counts(row["id"])
            out.append(row | counts)
        return out

    def new_tree(self, title: str = "Untitled") -> dict:
        tid = new_id()
        self.store.create_tree(tid, title)
        self.tree_id = tid
        self.tree = Tree()
        return {"id": tid, "title": title, "nodes": {}, "children": {}}

    def open_tree(self, tree_id: str) -> dict:
        # tree_id becomes a filesystem path component (~/.branch/files/<id>),
        # so it must be a real id, not a traversal string.
        tree_id = require_id(tree_id, field="tree_id")
        self.tree_id = tree_id
        self.tree = self.store.load_tree(tree_id)
        return {"id": tree_id, **self.tree.to_dict()}

    def rename_tree(self, tree_id: str, title: str) -> dict:
        tree_id = require_id(tree_id, field="tree_id")
        self.store.rename_tree(tree_id, title.strip() or "Untitled")
        return {"ok": True}

    def delete_tree(self, tree_id: str) -> dict:
        """Remove a conversation and everything filed under it."""
        # Without this guard, a "../../Documents" id would unlink and rmdir an
        # arbitrary directory below.
        tree_id = require_id(tree_id, field="tree_id")
        for att in self.store.list_attachments(tree_id):
            self._safe_unlink(att.path)
        files_dir = self._files_dir(tree_id)
        if files_dir.exists():
            for leftover in files_dir.iterdir():
                leftover.unlink(missing_ok=True)
            files_dir.rmdir()

        self.store.delete_tree(tree_id)
        if self.tree_id == tree_id:
            self.tree_id = None
            self.tree = Tree()
        return {"ok": True}

    # -- filesystem safety ----------------------------------------------

    def _files_dir(self, tree_id: str) -> Path:
        """The attachments directory for a tree, proven to stay inside the app.

        Validation already rejects traversal, but resolving and re-checking
        containment means a filesystem write can never escape `~/.branch/files`
        even if a bad id somehow slips past the regex.
        """
        require_id(tree_id, field="tree_id")
        base = (APP_DIR / "files").resolve()
        target = (base / tree_id).resolve()
        if target != base and base not in target.parents:
            raise ValueError("files path escapes the app directory")
        return target

    def _safe_unlink(self, path: str) -> None:
        """Unlink only within ~/.branch/files; never anywhere else."""
        base = (APP_DIR / "files").resolve()
        try:
            target = Path(path).resolve()
        except OSError:
            return
        if base in target.parents:
            target.unlink(missing_ok=True)

    def search(self, query: str, scope: str = "all") -> list[dict]:
        """Full-text search over messages. `scope` is 'all' or 'current'."""
        tid = self.tree_id if scope == "current" else None
        return self.store.search(query, tree_id=tid)

    def prune(self, node_id: str) -> dict:
        require_id(node_id, field="node_id")
        removed = self.tree.prune(node_id)
        self.store.delete_nodes(removed)
        return {"removed": removed}

    def set_starred(self, node_id: str, starred: bool) -> dict:
        require_id(node_id, field="node_id")
        node = self.tree.nodes[node_id]
        node.starred = bool(starred)
        self.store.save_node(self.tree_id, node)
        return _node_dict(node)

    def set_position(self, node_id: str, x: float, y: float) -> dict:
        """Persist a node dragged on the graph playground."""
        require_id(node_id, field="node_id")
        node = self.tree.nodes[node_id]
        node.x, node.y = x, y
        self.store.save_node(self.tree_id, node)
        return {"id": node_id, "x": x, "y": y}

    def reset_layout(self) -> dict:
        """Drop every manual position so the graph falls back to auto-layout.

        Dragging cards is useful until it isn't — this is the way back to the
        tidy default without losing any content.
        """
        reset_nodes: list[str] = []
        for node in self.tree.nodes.values():
            if node.x is not None or node.y is not None:
                node.x = None
                node.y = None
                self.store.save_node(self.tree_id, node)
                reset_nodes.append(node.id)

        reset_atts: list[str] = []
        for a in self.store.list_attachments(self.tree_id):
            if a.x is not None or a.y is not None:
                a.x = None
                a.y = None
                self.store.save_attachment(a)
                reset_atts.append(a.id)

        return {"ok": True, "nodes": reset_nodes, "attachments": reset_atts}

    def set_collapsed(self, node_id: str, collapsed: bool) -> dict:
        """Collapse a finished branch so it stops taking space in the rail and
        on the canvas. The detail is kept — only its display shrinks."""
        require_id(node_id, field="node_id")
        node = self.tree.nodes[node_id]
        node.collapsed = bool(collapsed)
        self.store.save_node(self.tree_id, node)
        return _node_dict(node)

    # -- attachments -----------------------------------------------------

    def add_file(self) -> dict:
        """Open a picker and copy the chosen files into the app's store.

        Copying rather than referencing means a note written months ago still
        resolves after the original is moved or deleted.
        """
        if not self.window:
            return {"ok": False, "error": "no window"}
        if not self.tree_id:
            return {"ok": False, "error": "no conversation open"}
        chosen = self.window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True)
        if not chosen:
            return {"ok": False, "cancelled": True}

        files_dir = self._files_dir(self.tree_id)
        files_dir.mkdir(parents=True, exist_ok=True)

        created: list[dict] = []
        for raw in chosen:
            src = Path(raw)
            if not src.exists():
                continue
            att_id = new_id()
            # basename guards against a picker (or spoofed path) returning a
            # name with separators in it.
            safe_name = Path(src.name).name
            dest = files_dir / f"{att_id}_{safe_name}"
            dest.write_bytes(src.read_bytes())
            att = Attachment(
                id=att_id,
                tree_id=self.tree_id,
                name=safe_name,
                path=str(dest),
                mime=guess_mime(src),
                size=dest.stat().st_size,
                created_at=time.time(),
            )
            self.store.save_attachment(att)
            created.append(asdict(att) | {"kind": att.kind, "preview": preview(att)})

        return {"ok": True, "attachments": created}

    def list_attachments(self) -> dict:
        atts = self.store.list_attachments(self.tree_id)
        return {
            "attachments": [
                asdict(a) | {"kind": a.kind, "preview": preview(a)} for a in atts
            ],
            "links": self.store.links(self.tree_id),
        }

    def link_attachment(self, node_id: str, attachment_id: str) -> dict:
        require_id(node_id, field="node_id")
        require_id(attachment_id, field="attachment_id")
        self.store.link_attachment(node_id, attachment_id)
        return {"ok": True}

    def unlink_attachment(self, node_id: str, attachment_id: str) -> dict:
        require_id(node_id, field="node_id")
        require_id(attachment_id, field="attachment_id")
        self.store.unlink_attachment(node_id, attachment_id)
        return {"ok": True}

    def delete_attachment(self, attachment_id: str) -> dict:
        require_id(attachment_id, field="attachment_id")
        for a in self.store.list_attachments(self.tree_id):
            if a.id == attachment_id:
                self._safe_unlink(a.path)
        self.store.delete_attachment(attachment_id)
        return {"ok": True}

    def move_attachment(self, attachment_id: str, x: float, y: float) -> dict:
        require_id(attachment_id, field="attachment_id")
        for a in self.store.list_attachments(self.tree_id):
            if a.id == attachment_id:
                a.x, a.y = x, y
                self.store.save_attachment(a)
                break
        return {"ok": True}

    def _attachment_blocks(
        self, parent_id: Optional[str], provider, model: str
    ) -> list[dict]:
        """Blocks for every file linked to the path being continued."""
        if parent_id is None:
            return []
        path_ids = [n.id for n in self.tree.path_to_root(parent_id)]
        atts = self.store.attachments_for_nodes(path_ids)
        vision = provider.supports_vision(model)
        blocks: list[dict] = []
        for a in atts:
            blocks.extend(to_blocks(a, supports_vision=vision))
        return blocks

    # -- notes -----------------------------------------------------------

    def get_notes(self) -> str:
        return self.store.get_notes(self.tree_id)

    def append_note(self, markdown: str) -> str:
        return self.store.append_note(self.tree_id, markdown)

    def clip_node(self, node_id: str, markdown: str, whole: bool) -> dict:
        """Append a clipping and record where it came from.

        A whole-message clip is allowed once — a second one would append the
        same text again — while excerpts are unlimited, since pulling several
        different sentences out of one reply is a normal thing to want.
        """
        require_id(node_id, field="node_id")
        node = self.tree.nodes.get(node_id)
        if node is None:
            return {"ok": False, "error": "no such node"}

        if whole and node.noted:
            return {"ok": False, "already": True, "node": _node_dict(node)}

        content = self.store.append_note(self.tree_id, markdown)
        if whole:
            node.noted = True
        else:
            node.clip_count += 1
        self.store.save_node(self.tree_id, node)

        return {"ok": True, "notes": content, "node": _node_dict(node)}

    def set_notes(self, content: str) -> dict:
        self.store.set_notes(self.tree_id, content)
        return {"ok": True}

    def export_notes(self) -> dict:
        """Write the notes doc wherever the user points a save dialog."""
        if not self.window:
            return {"ok": False, "error": "no window"}
        result = self.window.create_file_dialog(
            webview.SAVE_DIALOG, save_filename="findings.md"
        )
        if not result:
            return {"ok": False, "cancelled": True}
        path = Path(result if isinstance(result, str) else result[0])
        path.write_text(self.store.get_notes(self.tree_id), encoding="utf-8")
        return {"ok": True, "path": str(path)}

    # -- estimation ------------------------------------------------------

    def estimate(
        self,
        parent_id: Optional[str],
        prompt: str,
        mode: str = "path",
        anchor_text: Optional[str] = None,
        provider: str = "anthropic",
        model: str = "claude-opus-4-8",
    ) -> dict:
        """What this branch will cost before you commit to sending it."""
        p = self.registry.get(provider)
        ctx = assemble(
            self.tree,
            parent_id,
            prompt,
            mode=mode,
            anchor_text=anchor_text,
            supports_caching=p.supports_caching,
        )
        prefix_only = ctx.messages[:-1]
        tokens = _run_async(p.count_tokens(model, prefix_only)) if prefix_only else 0

        result = {
            "prefix_tokens": tokens,
            "prefix_messages": ctx.prefix_messages,
            "mode": mode,
        }
        if p.supports_caching:
            result["cache"] = cache_verdict(tokens, model)
        else:
            result["cache"] = {
                "cacheable": False,
                "note": f"{provider} does not expose cache breakpoints",
            }
        return result

    # -- sending ---------------------------------------------------------

    def send(
        self,
        parent_id: Optional[str],
        prompt: str,
        mode: str = "path",
        anchor_text: Optional[str] = None,
        anchor_node_id: Optional[str] = None,
        provider: str = "anthropic",
        model: str = "claude-opus-4-8",
        search_mode: str = "off",
    ) -> dict:
        p = self.registry.get(provider)
        ctx = assemble(
            self.tree,
            parent_id,
            prompt,
            mode=mode,
            anchor_text=anchor_text,
            supports_caching=p.supports_caching,
            attachment_blocks=self._attachment_blocks(parent_id, p, model),
        )

        user_node = self.tree.add(
            "user",
            prompt,
            parent_id=parent_id,
            provider=provider,
            model=model,
            anchor_text=anchor_text,
            anchor_node_id=anchor_node_id,
            context_mode=mode,
            # Only branches carry identity colour; a plain continuation belongs
            # to whatever branch it sits inside.
            color_slot=self.tree.next_color_slot() if anchor_text else None,
        )
        assistant_node = self.tree.add(
            "assistant", "", parent_id=user_node.id, provider=provider, model=model
        )
        self.store.save_node(self.tree_id, user_node)
        self.store.save_node(self.tree_id, assistant_node)

        # Name the conversation after its opening question, so the sidebar
        # isn't a column of "Untitled".
        title = self._auto_title()

        threading.Thread(
            target=self._stream_worker,
            args=(p, model, ctx.messages, assistant_node.id, search_mode),
            daemon=True,
        ).start()

        return {
            "user_node": _node_dict(user_node),
            "assistant_node": _node_dict(assistant_node),
            "cache_marked": ctx.cache_marked,
            "title": title,
        }

    def _auto_title(self) -> Optional[str]:
        """Title an untitled conversation from its first user message."""
        current = next(
            (t for t in self.store.list_trees() if t["id"] == self.tree_id), None
        )
        if current is None or current["title"] != "Untitled":
            return None

        first = self.store.first_message(self.tree_id).strip()
        if not first:
            return None

        title = " ".join(first.split())
        if len(title) > 48:
            title = title[:47].rstrip() + "…"
        self.store.rename_tree(self.tree_id, title)
        return title

    def cancel(self, node_id: str) -> dict:
        """Stop an in-flight response. Whatever streamed so far is kept."""
        evt = self._cancels.get(node_id)
        if evt is None:
            return {"ok": False, "error": "not streaming"}
        evt.set()
        return {"ok": True}

    def _stream_worker(
        self, provider, model, messages, node_id, search_mode="off"
    ) -> None:
        cancel = threading.Event()
        self._cancels[node_id] = cancel

        def finish(buf: list[str], usage: Optional[dict], cancelled: bool) -> None:
            node = self.tree.nodes[node_id]
            node.content = "".join(buf)
            if usage:
                for k, v in usage.items():
                    setattr(node.usage, k, v)
            self.store.save_node(self.tree_id, node)
            self._emit(
                "done",
                {
                    "node_id": node_id,
                    "node": _node_dict(node),
                    "cancelled": cancelled,
                },
            )

        async def run() -> None:
            buf: list[str] = []
            try:
                async for chunk in provider.stream(
                    model, messages, search_mode=search_mode
                ):
                    # Checked between chunks rather than mid-token: the partial
                    # answer is kept, so stopping never loses what arrived.
                    if cancel.is_set():
                        finish(buf, None, cancelled=True)
                        return

                    if chunk.status:
                        self._emit(
                            "status", {"node_id": node_id, "text": chunk.status}
                        )
                    if chunk.text:
                        buf.append(chunk.text)
                        self._emit("chunk", {"node_id": node_id, "text": chunk.text})
                    if chunk.thinking:
                        self._emit(
                            "thinking", {"node_id": node_id, "text": chunk.thinking}
                        )
                    if chunk.done:
                        finish(buf, chunk.usage, cancelled=False)
                        return
            except Exception as e:
                node = self.tree.nodes[node_id]
                node.content = "".join(buf)
                self.store.save_node(self.tree_id, node)
                self._emit("error", {"node_id": node_id, "message": str(e)})

        try:
            asyncio.run(run())
        finally:
            self._cancels.pop(node_id, None)

    def _emit(self, event: str, payload: dict) -> None:
        if not self.window:
            return
        # This payload carries model output and (via web search) untrusted web
        # content straight into an evaluate_js() call. Interpolating JSON into
        # that JS source is safe only as long as nothing in the payload can
        # break out of the string — a dependency on json.dumps's escaping that
        # is easy to void later. Base64 sidesteps it entirely: the transported
        # bytes are [A-Za-z0-9+/=], which cannot terminate a JS string, and the
        # page decodes and parses them. ensure_ascii keeps the base64 UTF-8-safe
        # for atob on the other side.
        # ensure_ascii keeps the JSON pure ASCII, so atob round-trips it byte
        # for byte and JSON.parse sees the exact string.
        data = json.dumps({"event": event, **payload}, ensure_ascii=True)
        b64 = base64.b64encode(data.encode("ascii")).decode("ascii")
        self.window.evaluate_js(
            f'window.__branch && window.__branch.emit(JSON.parse(atob("{b64}")))'
        )


def _node_dict(node) -> dict:
    from dataclasses import asdict

    return asdict(node)


def _run_async(coro):
    return asyncio.run(coro)


def main() -> None:
    api = Api()
    url = str(FRONTEND_DIST) if FRONTEND_DIST.exists() else FRONTEND_DEV
    api.window = webview.create_window(
        "Branch",
        url,
        js_api=api,
        width=1440,
        height=900,
        min_size=(1000, 640),
    )
    webview.start(debug=not FRONTEND_DIST.exists())


if __name__ == "__main__":
    main()
